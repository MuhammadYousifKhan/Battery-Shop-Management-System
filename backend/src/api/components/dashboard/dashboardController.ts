import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Order from '../../models/Order';
import Product from '../../models/Product';
import Customer from '../../models/Customer';
import Billing from '../../models/Billing';
import Claim from '../../models/Claim';
import ScrapBattery from '../../models/ScrapBatteries';
import Closing from '../../models/Closing';
import CustomerTransaction from '../../models/CustomerTransaction';
import { generateClosingReportPDF } from '../../utils/pdfGenerator';

// Helper: Determine start date based on period string
const getStartDate = (period: string, now: Date) => {
    let date = new Date(now);
    
    if (period === 'daily') {
        date.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
        date.setDate(now.getDate() - 7);
        date.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        date = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
        date = new Date(now.getFullYear(), 0, 1);
    } else {
        return null; // 'all'
    }
    return date;
};

// @desc    Get dashboard summary statistics
export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
    // @ts-ignore
    const userRole = req.user.role; 
    
    // 1. CHANGE: Set default to 'month' instead of 'all'
    const period = req.query.period as string || 'month'; 
    const now = new Date();

    // 1. Calculate Financial Period Date
    const lastClosing = await Closing.findOne().sort({ closingDate: -1 });
    const resetDate = lastClosing ? lastClosing.closingDate : null;
    let requestedStartDate = getStartDate(period, now);
    let effectiveStartDate = requestedStartDate;

    // 2. CHANGE: Only apply "Last Closing" logic if mode is 'all' (Current Session).
    // For 'month', 'week', etc., we strictly want calendar dates.
    if (period === 'all' && resetDate) {
        if (!effectiveStartDate || resetDate > effectiveStartDate) {
            effectiveStartDate = resetDate;
        }
    }

    let dateQuery: any = {};
    let dateQueryScrap: any = {};

    if (effectiveStartDate) {
        dateQuery = { createdAt: { $gte: effectiveStartDate } };
        dateQueryScrap = { date: { $gte: effectiveStartDate } };
    }

    // --- 2. Calculate DAILY Date (Strictly for Activity Tracker Card) ---
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const dailyQuery = { createdAt: { $gte: startOfToday } };
    const dailyQueryScrap = { date: { $gte: startOfToday } };

    // --- FINANCIALS ---
    const allProducts = await Product.find({});
    const totalStockValue = allProducts.reduce((acc, p: any) => acc + ((p.totalStock || 0) * (p.averageCost || 0)), 0);

    const costMap = new Map<string, number>();
    allProducts.forEach((p: any) => costMap.set(String(p._id), p.averageCost || 0));

    // Retail Profit
    const billData = await Billing.aggregate([
        { $match: { ...dateQuery, status: { $ne: 'cancelled' } } },
        { $unwind: "$items" },
        { $project: { productRef: "$items.productRef", price: "$items.price", cost: "$items.cost", quantity: "$items.quantity" } }
    ]);

    let retailProfit = 0;
    for (const item of billData) {
        let costPrice = item.cost ?? (costMap.get(String(item.productRef)) || 0);
        retailProfit += ((item.price || 0) - costPrice) * (item.quantity || 0);
    }

    // Wholesale Profit
    const orderData = await Order.aggregate([
        { $match: { ...dateQuery, status: 'completed' } },
        { $unwind: "$items" },
        { $project: { productRef: "$items.productRef", price: "$items.price", cost: "$items.cost", quantity: "$items.quantity" } }
    ]);

    let wholesaleProfit = 0;
    for (const item of orderData) {
        let costPrice = item.cost ?? (costMap.get(String(item.productRef)) || 0);
        wholesaleProfit += ((item.price || 0) - costPrice) * (item.quantity || 0);
    }

    // Scrap Profit
    const scrapStats = await ScrapBattery.aggregate([
        { $match: dateQueryScrap },
        { $group: { _id: "$type", total: { $sum: "$totalAmount" }, totalWt: { $sum: "$weight" } } }
    ]);

    const allScrapStats = await ScrapBattery.aggregate([
        { $group: { _id: "$type", total: { $sum: "$totalAmount" }, totalWt: { $sum: "$weight" } } }
    ]);
    
    // ✅ FIXED: Profit = Sold Amount - (Sold Weight * Average Cost)
    // First, calculate All-Time Average Cost
    const allScrapBuys = await ScrapBattery.aggregate([
        { $match: { type: 'buy' } },
        { $group: { _id: null, totalWt: { $sum: "$weight" }, totalAmt: { $sum: "$totalAmount" } } }
    ]);
    const avgScrapCost = allScrapBuys.length > 0 && allScrapBuys[0].totalWt > 0 
        ? allScrapBuys[0].totalAmt / allScrapBuys[0].totalWt 
        : 0;

    const soldEntry = scrapStats.find(s => s._id === 'sell');
    const soldAmount = soldEntry?.total || 0;
    const soldWeight = soldEntry?.totalWt || 0;

    // Use Avg Cost to find COGS of sold scrap. Fallback to 98% if no buy history.
    const costOfScrapSold = avgScrapCost > 0 ? (soldWeight * avgScrapCost) : (soldAmount * 0.98);
    const scrapProfit = soldAmount - costOfScrapSold;

    const allBoughtEntry = allScrapStats.find((s: any) => s._id === 'buy') || { total: 0, totalWt: 0 };
    const allSoldEntry = allScrapStats.find((s: any) => s._id === 'sell') || { total: 0, totalWt: 0 };
    const currentScrapWeight = (allBoughtEntry.totalWt || 0) - (allSoldEntry.totalWt || 0);
    const currentScrapValue = currentScrapWeight * avgScrapCost;

    const supplierSellFlow = await ScrapBattery.aggregate([
        { $match: { supplierRef: { $exists: true, $ne: null }, type: 'sell' } },
        {
            $group: {
                _id: '$settlementMode',
                totalAmount: { $sum: '$totalAmount' },
                totalWeight: { $sum: '$weight' },
                count: { $sum: 1 }
            }
        }
    ]);

    const flowMap = new Map<string, any>();
    supplierSellFlow.forEach((f: any) => flowMap.set(String(f._id || 'unknown'), f));

    const soldToSuppliersAmount = Number(allSoldEntry.total || 0);
    const soldToSuppliersWeight = Number(allSoldEntry.totalWt || 0);
    const deductedFromBalance = Number(flowMap.get('deduct_balance')?.totalAmount || 0) + Number(flowMap.get('receive')?.totalAmount || 0);
    const paymentReceivedFromSuppliers = Number(flowMap.get('receive_payment')?.totalAmount || 0);
    const legacyPaidToSuppliers = Number(flowMap.get('pay')?.totalAmount || 0);

    // Claim Fees as Profit (Service Income)
    const claimStats = await Claim.aggregate([
        { $match: dateQuery },
        { $group: { _id: null, totalFees: { $sum: "$claimFee" } } }
    ]);
    const claimProfit = claimStats[0]?.totalFees || 0;

    // Total Profit (Retail + Wholesale + Scrap + Claims)
    const totalProfit = retailProfit + wholesaleProfit + scrapProfit + claimProfit;

    const creditResult = await Customer.aggregate([
        { $match: { currentBalance: { $gt: 0 } } },
        { $group: { _id: null, totalCredit: { $sum: "$currentBalance" } } }
    ]);
    const totalCustomerCredit = creditResult[0]?.totalCredit || 0;

    // --- PERIOD COUNTS ---
    // @ts-ignore
    const wholesaleCount = await Order.countDocuments({ ...dateQuery, status: { $ne: 'cancelled' } });
    const retailCount = await Billing.countDocuments({ ...dateQuery, status: { $ne: 'cancelled' } });
    const totalOrders = wholesaleCount + retailCount;
    const wholesaleCustomers = await Customer.countDocuments({ type: 'wholesale' });
    
    // Low Stock Alert (Threshold 5)
    const lowStockCount = await Product.countDocuments({ stock: { $lte: 5 } }); 
    
    const pendingClaimsCount = await Claim.countDocuments({ status: 'pending' });

    // --- DAILY ACTIVITY COUNTS (Strictly Today) ---
    // @ts-ignore
    const dailyRetail = await Billing.countDocuments({ ...dailyQuery, status: { $ne: 'cancelled' } });
    // @ts-ignore
    const dailyWholesale = await Order.countDocuments({ ...dailyQuery, status: { $ne: 'cancelled' } });
    const dailyClaims = await Claim.countDocuments({ ...dailyQuery });
    const dailyScrap = await ScrapBattery.countDocuments({ ...dailyQueryScrap, type: 'buy' });
    const dailyTotal = dailyRetail + dailyWholesale + dailyClaims + dailyScrap;

    const recentOrders = await Order.find(dateQuery).sort({ createdAt: -1 }).limit(5).select('customerName items totalAmount status createdAt');

    // --- CHART DATA (Retail + Wholesale Combined) ---
    const chartStartDate = effectiveStartDate || new Date(new Date().setDate(new Date().getDate() - 7));
    
    const retailChartData = await Billing.aggregate([
        { $match: { createdAt: { $gte: chartStartDate }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, totalSales: { $sum: '$amount' } } } // Fixed: Use 'amount' (Gross)
    ]);

    const wholesaleChartData = await Order.aggregate([
        { $match: { createdAt: { $gte: chartStartDate }, status: 'completed' } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, totalSales: { $sum: '$totalAmount' } } }
    ]);

    // Claim Fees Chart Data (Service Income)
    const claimChartData = await Claim.aggregate([
        { $match: { createdAt: { $gte: chartStartDate }, claimFee: { $gt: 0 } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, totalSales: { $sum: '$claimFee' } } }
    ]);

    const salesMap = new Map();
    
    const addToMap = (data: any[]) => {
        data.forEach(item => {
            const date = item._id;
            const current = salesMap.get(date) || 0;
            salesMap.set(date, current + item.totalSales);
        });
    };

    addToMap(retailChartData);
    addToMap(wholesaleChartData);
    addToMap(claimChartData);

    const salesChartData = Array.from(salesMap.entries())
        .map(([date, sales]) => ({ date, sales }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // --- RESPONSE ---
    const responseData = {
        totalProfit: userRole === 'manager' ? 0 : totalProfit,
        totalStockValue: userRole === 'manager' ? 0 : totalStockValue,
        scrapStock: {
            weight: currentScrapWeight,
            value: currentScrapValue,
            avgCostPerKg: avgScrapCost
        },
        supplierScrapFlow: {
            soldToSuppliersWeight,
            soldToSuppliersAmount,
            deductedFromBalance,
            paymentReceivedFromSuppliers,
            paidToSuppliers: legacyPaidToSuppliers
        },
        totalCustomerCredit,
        totalOrders,
        wholesaleCustomers,
        lowStockCount,
        pendingClaimsCount,
        recentOrders,
        salesChartData: userRole === 'manager' ? [] : salesChartData,
        lastClosingDate: resetDate,
        dailyActivity: {
            retail: dailyRetail || 0,
            wholesale: dailyWholesale || 0,
            claims: dailyClaims || 0,
            scrap: dailyScrap || 0,
            total: dailyTotal || 0
        }
    };

    res.status(200).json(responseData);
});

// @desc    Get Daily Activity (Flat List)
export const getDailyActivity = asyncHandler(async (req: Request, res: Response) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const query = { createdAt: { $gte: today, $lt: tomorrow } };

    try {
        const retailSales = await Billing.find(query)
            .populate('items.productRef', 'name sku') 
            .sort({ createdAt: -1 })
            .lean();

        const wholesaleOrders = await Order.find(query)
            .populate('customerRef', 'name')
            .populate('items.productRef', 'name sku') 
            .sort({ createdAt: -1 })
            .lean();

        const payments = await CustomerTransaction.find({
            ...query,
            type: { $in: ['Payment', 'Return'] }
        })
        .populate('customer', 'name')
        .sort({ createdAt: -1 })
        .lean();
        
        // 🚀 Include Claims in Activity Log
        const claims = await Claim.find(query)
            .populate('customerRef', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const activityLog = [
            ...retailSales.map((s: any) => ({
                type: 'Retail Sale',
                id: s.invoiceNumber || s._id,
                details: `${s.items.length} Items Sold`,
                amount: s.amount,
                time: s.createdAt
            })),
            ...wholesaleOrders.map((o: any) => ({
                type: 'Wholesale Order',
                id: o.orderId || o._id,
                details: `Customer: ${o.customerRef?.name || 'Unknown'}`,
                amount: o.totalAmount,
                time: o.createdAt
            })),
            ...payments.map((p: any) => ({
                type: 'Payment Received',
                id: p._id,
                details: `From: ${p.customer?.name || 'Unknown'}`,
                amount: p.credit > 0 ? p.credit : p.debit,
                time: p.createdAt
            })),
            // Add Claims
            ...claims.map((c: any) => ({
                type: 'Claim Processed',
                id: c._id,
                details: `${c.status.toUpperCase()} - Fee: ${c.claimFee || 0}`,
                amount: c.claimFee || 0,
                time: c.createdAt
            }))
        ];

        activityLog.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        res.json(activityLog);

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ message: "Failed to load activity log" });
    }
});

// @desc    Get Detailed Activity List (For Modal)
export const getActivityDetails = asyncHandler(async (req: Request, res: Response) => {
    const period = req.query.period as string || 'daily'; 
    const now = new Date();

    const lastClosing = await Closing.findOne().sort({ closingDate: -1 });
    const resetDate = lastClosing ? lastClosing.closingDate : null;

    let requestedStartDate = getStartDate(period, now);
    let effectiveStartDate = requestedStartDate;

    if (resetDate && period !== 'daily') {
        if (!effectiveStartDate || resetDate > effectiveStartDate) {
            effectiveStartDate = resetDate;
        }
    }

    let dateQuery: any = {};      
    let dateQueryScrap: any = {}; 

    if (effectiveStartDate) {
        dateQuery = { createdAt: { $gte: effectiveStartDate } };
        dateQueryScrap = { date: { $gte: effectiveStartDate } };
    }

    const allProducts = await Product.find({}).select('_id averageCost sku'); 
    const costMap = new Map<string, number>();
    allProducts.forEach((p: any) => costMap.set(String(p._id), p.averageCost || 0));

    const retailBills = await Billing.find({ ...dateQuery, status: { $ne: 'cancelled' } })
        .populate('items.productRef', 'name sku')
        .sort({ createdAt: -1 });

    const wholesaleOrders = await Order.find({ ...dateQuery, status: { $ne: 'cancelled' } })
        .populate('items.productRef', 'name sku')
        .sort({ createdAt: -1 });

    const claims = await Claim.find({ ...dateQuery })
        .populate('items.productRef', 'name sku')
        .sort({ createdAt: -1 });

    const scrap = await ScrapBattery.find(dateQueryScrap).sort({ date: -1 });

    let totalRevenue = 0;
    let totalCost = 0;
    
    const calculateListProfit = (items: any[]) => {
        let revenue = 0;
        let cost = 0;
        if (!items) return { revenue: 0, cost: 0 };
        items.forEach(item => {
            const itemRevenue = (item.price || 0) * (item.quantity || 0);
            const itemCost = ((item.cost || costMap.get(String(item.productRef?._id))) || 0) * (item.quantity || 0);
            revenue += itemRevenue;
            cost += itemCost;
        });
        return { revenue, cost };
    };

    const retailDetails = retailBills.map(bill => {
        const { revenue, cost } = calculateListProfit(bill.items);
        totalRevenue += revenue;
        totalCost += cost;
        return { ...bill.toObject(), totalAmount: bill.amount, profit: revenue - cost };
    });

    const wholesaleDetails = wholesaleOrders.map(order => {
        const { revenue, cost } = calculateListProfit(order.items);
        if (order.status === 'completed') {
            totalRevenue += revenue;
            totalCost += cost;
        }
        return { ...order.toObject(), totalAmount: order.totalAmount, profit: revenue - cost };
    });

    // ✅ FIXED SCRAP PROFIT IN ACTIVITY LIST
    let scrapRevenue = 0;
    let scrapCost = 0;

    // Get All-Time Avg Cost for Scrap Profit Calc
    const allScrapBuys = await ScrapBattery.aggregate([
        { $match: { type: 'buy' } },
        { $group: { _id: null, totalWt: { $sum: "$weight" }, totalAmt: { $sum: "$totalAmount" } } }
    ]);
    const avgScrapCost = allScrapBuys.length > 0 && allScrapBuys[0].totalWt > 0 
        ? allScrapBuys[0].totalAmt / allScrapBuys[0].totalWt 
        : 0;

    scrap.forEach(s => {
        if (s.type === 'sell') {
            scrapRevenue += s.totalAmount;
            const itemCost = s.weight * avgScrapCost;
            scrapCost += itemCost;
        }
    });
    totalRevenue += scrapRevenue;
    totalCost += scrapCost; // ✅ Add scrap cost to total cost, so Net Profit is correct
    
    let claimRevenue = 0;
    claims.forEach((c: any) => {
        const fee = c.claimFee || 0;
        claimRevenue += fee;
    });
    totalRevenue += claimRevenue;

    const netProfit = totalRevenue - totalCost;

    res.json({
        retail: retailDetails,
        wholesale: wholesaleDetails,
        claims,
        scrap,
        summary: { 
            totalRevenue, 
            totalCost, 
            scrapProfit: scrapRevenue - scrapCost, // ✅ Show clean scrap profit
            claimRevenue: claimRevenue, 
            totalProfit: netProfit 
        }
    });
});

// @desc    Reset Dashboard Stats AND Generate Report
export const resetDashboardStats = asyncHandler(async (req: Request, res: Response) => {
    const lastClosing = await Closing.findOne().sort({ closingDate: -1 });
    const startDate = lastClosing ? lastClosing.closingDate : new Date(0);
    const endDate = new Date(); 

    const costMap = new Map<string, number>();
    const skuMap = new Map<string, string>();

    const allProducts = await Product.find({});
    allProducts.forEach((p: any) => {
        const id = String(p._id);
        costMap.set(id, p.averageCost || 0);
        skuMap.set(id, p.sku || '-');
    });

    // 1. Retail
    const retailData = await Billing.aggregate([
        { $match: { createdAt: { $gt: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
        { $unwind: "$items" },
        { $group: { _id: "$items.productRef", sku: { $first: "$items.sku" }, name: { $first: "$items.productName" }, qty: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, recordedCost: { $sum: { $multiply: ["$items.cost", "$items.quantity"] } } } }
    ]);

    // 2. Wholesale
    const wholesaleData = await Order.aggregate([
        { $match: { createdAt: { $gt: startDate, $lte: endDate }, status: 'completed' } },
        { $unwind: "$items" },
        { $group: { _id: "$items.productRef", sku: { $first: "$items.sku" }, name: { $first: "$items.productName" }, qty: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, recordedCost: { $sum: { $multiply: ["$items.cost", "$items.quantity"] } } } }
    ]);

    const productStats = new Map<string, any>();
    const mergeData = (dataArray: any[]) => {
        dataArray.forEach(item => {
            const id = String(item._id);
            if (!productStats.has(id)) { productStats.set(id, { name: item.name, sku: item.sku || '-', qty: 0, revenue: 0, recordedCost: 0 }); }
            const current = productStats.get(id);
            current.qty += item.qty; current.revenue += item.revenue; current.recordedCost += item.recordedCost;
            if ((!current.sku || current.sku === '-') && item.sku) current.sku = item.sku;
            if (!current.name && item.name) current.name = item.name;
        });
    };
    mergeData(retailData);
    mergeData(wholesaleData);

    const processedItems = Array.from(productStats.entries()).map(([id, item]) => {
        const fallbackCost = (costMap.get(id) || 0) * item.qty;
        const totalCost = item.recordedCost || fallbackCost;
        const profit = item.revenue - totalCost;
        const margin = item.revenue > 0 ? ((profit / item.revenue) * 100).toFixed(1) : '0.0';
        const productSku = skuMap.get(id) || item.sku || '-';
        return { name: item.name || "Unknown Product", sku: productSku, qty: item.qty, revenue: item.revenue, cost: totalCost, profit: profit, margin: margin };
    });

    // 3. Claims (Add to Item List as Service)
    const claimStats = await Claim.aggregate([
        { $match: { createdAt: { $gt: startDate, $lte: endDate }, claimFee: { $gt: 0 } } },
        { $group: { _id: null, totalFees: { $sum: "$claimFee" }, count: { $sum: 1 } } }
    ]);
    const claimProfit = claimStats[0]?.totalFees || 0;
    const claimCountVal = claimStats[0]?.count || 0;

    if (claimProfit > 0) {
        processedItems.push({
            name: "Claim Processing Fees",
            sku: "SVC-CLAIM",
            qty: claimCountVal,
            revenue: claimProfit,
            cost: 0, // No cost of goods
            profit: claimProfit,
            margin: "100.0"
        });
    }

    processedItems.sort((a, b) => b.revenue - a.revenue);

    const totalSales = processedItems.reduce((acc, i) => acc + i.revenue, 0);
    const totalProfitFromGoods = processedItems.reduce((acc, i) => acc + i.profit, 0);

    // 4. Scrap
    const scrapStats = await ScrapBattery.aggregate([
        { $match: { date: { $gt: startDate, $lte: endDate } } },
        { $group: { _id: "$type", total: { $sum: "$totalAmount" }, totalWt: { $sum: "$weight" } } }
    ]);
    
    // ✅ FIXED: Scrap Profit = Sales - COGS
    const allScrapBuys = await ScrapBattery.aggregate([
        { $match: { type: 'buy' } },
        { $group: { _id: null, totalWt: { $sum: "$weight" }, totalAmt: { $sum: "$totalAmount" } } }
    ]);
    const avgScrapCost = allScrapBuys.length > 0 && allScrapBuys[0].totalWt > 0 
        ? allScrapBuys[0].totalAmt / allScrapBuys[0].totalWt 
        : 0;

    const soldEntry = scrapStats.find(s => s._id === 'sell');
    const soldAmount = soldEntry?.total || 0;
    const soldWeight = soldEntry?.totalWt || 0;
    
    const costOfScrapSold = soldWeight * avgScrapCost;
    const scrapProfit = soldAmount - costOfScrapSold;

    // Counts
    // @ts-ignore
    const wholesaleCount = await Order.countDocuments({ createdAt: { $gt: startDate, $lte: endDate }, status: 'completed' });
    const retailCount = await Billing.countDocuments({ createdAt: { $gt: startDate, $lte: endDate }, status: { $ne: 'cancelled' } });
    const claimCount = await Claim.countDocuments({ createdAt: { $gt: startDate, $lte: endDate } });
    const scrapBuyCount = await ScrapBattery.countDocuments({ date: { $gt: startDate, $lte: endDate }, type: 'buy' });
    
    const totalOrders = wholesaleCount + retailCount;
    const totalActivity = totalOrders + claimCount + scrapBuyCount;

    const summary = {
        totalSales: totalSales + soldAmount, // Revenue includes Scrap Sales
        totalProfit: totalProfitFromGoods + scrapProfit,
        retailProfit: 0, 
        wholesaleProfit: 0, 
        scrapProfit: scrapProfit,
        claimProfit: claimProfit, 
        totalOrders: totalOrders,
        retailCount,
        wholesaleCount,
        claimCount,
        scrapBuyCount,
        totalActivity: totalActivity
    };

    // @ts-ignore
    const userId = req.user._id;
    await Closing.create({
        closedBy: userId,
        closingDate: endDate,
        periodStartDate: startDate,
        summary: summary,
        notes: req.body.notes || 'Manual Reset with PDF Report'
    });

    generateClosingReportPDF(res, { startDate, endDate, summary, itemWiseSales: processedItems });
});