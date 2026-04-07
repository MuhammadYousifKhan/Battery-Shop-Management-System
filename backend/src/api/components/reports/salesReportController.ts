import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Billing from '../../models/Billing'; 
import Order from '../../models/Order';
import Product from '../../models/Product';
import Claim from '../../models/Claim'; 
import ScrapBattery from '../../models/ScrapBatteries'; 
import CustomerTransaction from '../../models/CustomerTransaction';
import SupplierTransaction from '../../models/SupplierTransaction';
import { generateSalesReportPDF } from '../../utils/pdfGenerator';

type ReportOptions = {
    scrapTypeFilter?: 'all' | 'buy' | 'sell';
    scrapGroupBy?: 'none' | 'supplier' | 'customer';
};

const fetchReportData = async (reportType: string, startDate: string, endDate: string, options: ReportOptions = {}) => {
    if (reportType === 'scrap_detailed') {
        if (!startDate || !endDate) throw new Error('Start and End dates are required');

        const typeFilter: 'all' | 'buy' | 'sell' = options.scrapTypeFilter === 'buy' || options.scrapTypeFilter === 'sell'
            ? options.scrapTypeFilter
            : 'all';
        const groupBy: 'none' | 'supplier' | 'customer' = options.scrapGroupBy === 'supplier' || options.scrapGroupBy === 'customer'
            ? options.scrapGroupBy
            : 'none';

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const openingStats = await ScrapBattery.aggregate([
            { $match: { date: { $lt: start } } },
            { $group: { _id: '$type', totalWeight: { $sum: '$weight' } } }
        ]);

        const openingBuyWt = Number(openingStats.find((s: any) => s._id === 'buy')?.totalWeight || 0);
        const openingSellWt = Number(openingStats.find((s: any) => s._id === 'sell')?.totalWeight || 0);
        const openingStockKg = openingBuyWt - openingSellWt;

        const query: any = { date: { $gte: start, $lte: end } };
        if (typeFilter !== 'all') query.type = typeFilter;

        const rows = await ScrapBattery.find(query)
            .sort({ date: 1, createdAt: 1 })
            .populate('customerRef', 'name phone type')
            .populate('supplierRef', 'name phone')
            .lean();

        const allBuys = await ScrapBattery.aggregate([
            { $match: { type: 'buy' } },
            { $group: { _id: null, totalWt: { $sum: '$weight' }, totalAmt: { $sum: '$totalAmount' } } }
        ]);
        const avgCostPerKg = allBuys.length > 0 && allBuys[0].totalWt > 0
            ? allBuys[0].totalAmt / allBuys[0].totalWt
            : 0;

        let runningStockKg = openingStockKg;
        let totalBoughtKg = 0;
        let totalSoldKg = 0;
        let totalBuyAmount = 0;
        let totalSellAmount = 0;

        const reportData = rows.map((tx: any) => {
            const weight = Number(tx.weight || 0);
            const totalAmount = Number(tx.totalAmount || 0);
            const isBuy = tx.type === 'buy';

            if (isBuy) {
                totalBoughtKg += weight;
                totalBuyAmount += totalAmount;
                runningStockKg += weight;
            } else {
                totalSoldKg += weight;
                totalSellAmount += totalAmount;
                runningStockKg -= weight;
            }

            const settlementLabel = tx.type === 'sell'
                ? (tx.settlementMode === 'receive_payment'
                    ? 'Payment Received'
                    : (tx.settlementMode === 'deduct_balance' || tx.settlementMode === 'receive')
                        ? 'Deduct From Supplier Balance'
                        : tx.settlementMode === 'pay'
                            ? 'Paid To Supplier'
                            : 'Direct')
                : '-';

            const partyName = tx.type === 'sell'
                ? (tx.supplierRef?.name || tx.customerName || 'Unknown Supplier')
                : (tx.customerRef?.name || tx.customerName || 'Unknown Customer');

            const partyPhone = tx.type === 'sell'
                ? (tx.supplierRef?.phone || tx.customerPhone || '-')
                : (tx.customerRef?.phone || tx.customerPhone || '-');

            return {
                id: String(tx._id),
                date: tx.date,
                type: tx.type,
                partyType: tx.type === 'sell' ? 'supplier' : 'customer',
                partyName,
                partyPhone,
                customerCategory: tx.customerCategory || '-',
                settlementMode: tx.settlementMode || '-',
                settlementLabel,
                weight,
                pricePerKg: Number(tx.pricePerKg || 0),
                totalAmount,
                runningStockKg,
                supplierRef: tx.supplierRef?._id ? String(tx.supplierRef._id) : undefined,
                customerRef: tx.customerRef?._id ? String(tx.customerRef._id) : undefined
            };
        });

        let filteredRows = reportData;
        if (groupBy === 'supplier') {
            filteredRows = filteredRows.filter((r: any) => r.partyType === 'supplier');
        } else if (groupBy === 'customer') {
            filteredRows = filteredRows.filter((r: any) => r.partyType === 'customer');
        }

        let finalReportData: any[] = filteredRows;
        if (groupBy !== 'none') {
            const groupMap = new Map<string, any>();

            filteredRows.forEach((row: any) => {
                const key = `${row.partyName || 'Unknown'}|${row.partyPhone || '-'}`;
                if (!groupMap.has(key)) {
                    groupMap.set(key, {
                        partyName: row.partyName || 'Unknown',
                        partyPhone: row.partyPhone || '-',
                        partyType: row.partyType,
                        transactionCount: 0,
                        totalWeight: 0,
                        totalAmount: 0,
                        transactions: []
                    });
                }

                const g = groupMap.get(key);
                g.transactionCount += 1;
                g.totalWeight += Number(row.weight || 0);
                g.totalAmount += Number(row.totalAmount || 0);
                g.transactions.push(row);
            });

            finalReportData = Array.from(groupMap.values())
                .map((g: any) => ({
                    ...g,
                    totalWeight: Number(g.totalWeight.toFixed(2)),
                    totalAmount: Number(g.totalAmount.toFixed(0)),
                    transactions: g.transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                }))
                .sort((a: any, b: any) => b.totalAmount - a.totalAmount);
        }

        const estimatedCostOfSold = totalSoldKg * avgCostPerKg;
        const estimatedProfit = totalSellAmount - estimatedCostOfSold;

        return {
            summary: {
                reportType: 'Scrap Detailed Report',
                scrapTypeFilter: typeFilter,
                scrapGroupBy: groupBy,
                openingStockKg: Number(openingStockKg.toFixed(2)),
                totalBoughtKg: Number(totalBoughtKg.toFixed(2)),
                totalSoldKg: Number(totalSoldKg.toFixed(2)),
                closingStockKg: Number((openingStockKg + totalBoughtKg - totalSoldKg).toFixed(2)),
                totalBuyAmount: Number(totalBuyAmount.toFixed(0)),
                totalSellAmount: Number(totalSellAmount.toFixed(0)),
                avgCostPerKg: Number(avgCostPerKg.toFixed(2)),
                estimatedProfit: Number(estimatedProfit.toFixed(0)),
                transactionCount: filteredRows.length,
                partyCount: groupBy === 'none' ? 0 : finalReportData.length
            },
            reportData: finalReportData
        };
    }

    if (reportType === 'supplier_payments') {
        if (!startDate || !endDate) throw new Error('Start and End dates are required');

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const paymentTxs = await SupplierTransaction.find({
            type: 'Payment',
            transactionDate: { $gte: start, $lte: end }
        })
            .populate('supplier', 'name phone')
            .sort({ transactionDate: -1 })
            .lean();

        const supplierMap = new Map();
        let totalPaid = 0;

        paymentTxs.forEach((tx: any) => {
            const supplierId = String(tx.supplier?._id || tx.supplier || 'unknown');
            const supplierName = tx.supplier?.name || 'Unknown Supplier';
            const supplierPhone = tx.supplier?.phone || '-';
            const amount = Number(tx.debit || 0);
            const txDate = new Date(tx.transactionDate || tx.createdAt);
            const dayKey = txDate.toISOString().split('T')[0];
            totalPaid += amount;

            if (!supplierMap.has(supplierId)) {
                supplierMap.set(supplierId, {
                    supplierId,
                    supplierName,
                    supplierPhone,
                    totalPayments: 0,
                    totalPaid: 0,
                    latestPaymentDate: tx.transactionDate,
                    dailyMap: new Map(),
                });
            }

            const row = supplierMap.get(supplierId);
            row.totalPayments += 1;
            row.totalPaid += amount;

            if (!row.latestPaymentDate || new Date(tx.transactionDate) > new Date(row.latestPaymentDate)) {
                row.latestPaymentDate = tx.transactionDate;
            }

            if (!row.dailyMap.has(dayKey)) {
                row.dailyMap.set(dayKey, {
                    date: dayKey,
                    paymentCount: 0,
                    totalPaid: 0,
                    payments: []
                });
            }

            const dayBucket = row.dailyMap.get(dayKey);
            dayBucket.paymentCount += 1;
            dayBucket.totalPaid += amount;
            dayBucket.payments.push({
                id: String(tx._id),
                amount,
                description: tx.description || 'Payment to Supplier',
                paymentDate: txDate,
                time: txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        });

        const reportData = Array.from(supplierMap.values())
            .map((supplier: any) => {
                const dailyBreakdown = Array.from(supplier.dailyMap.values())
                    .map((day: any) => ({
                        ...day,
                        payments: day.payments.sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                    }))
                    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return {
                    supplierId: supplier.supplierId,
                    supplierName: supplier.supplierName,
                    supplierPhone: supplier.supplierPhone,
                    totalPayments: supplier.totalPayments,
                    totalPaid: supplier.totalPaid,
                    latestPaymentDate: supplier.latestPaymentDate,
                    dailyBreakdown
                };
            })
            .sort((a: any, b: any) => b.totalPaid - a.totalPaid);

        return {
            summary: {
                reportType: 'Supplier Payments Made',
                totalPaid: totalPaid.toFixed(0),
                totalPayments: paymentTxs.length,
                supplierCount: reportData.length,
            },
            reportData
        };
    }

    if (reportType === 'customer_payments') {
        if (!startDate || !endDate) throw new Error('Start and End dates are required');

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const paymentTxs = await CustomerTransaction.find({
            type: 'Payment',
            transactionDate: { $gte: start, $lte: end }
        })
            .populate('customer', 'name phone')
            .sort({ transactionDate: -1 })
            .lean();

        const customerMap = new Map();
        let totalReceived = 0;

        paymentTxs.forEach((tx: any) => {
            const customerId = String(tx.customer?._id || tx.customer || 'unknown');
            const customerName = tx.customer?.name || 'Unknown Customer';
            const customerPhone = tx.customer?.phone || '-';
            const amount = Number(tx.credit || 0);
            const txDate = new Date(tx.transactionDate || tx.createdAt);
            const dayKey = txDate.toISOString().split('T')[0];
            totalReceived += amount;

            if (!customerMap.has(customerId)) {
                customerMap.set(customerId, {
                    customerId,
                    customerName,
                    customerPhone,
                    totalPayments: 0,
                    totalReceived: 0,
                    latestPaymentDate: tx.transactionDate,
                    dailyMap: new Map(),
                });
            }

            const row = customerMap.get(customerId);
            row.totalPayments += 1;
            row.totalReceived += amount;

            if (!row.latestPaymentDate || new Date(tx.transactionDate) > new Date(row.latestPaymentDate)) {
                row.latestPaymentDate = tx.transactionDate;
            }

            if (!row.dailyMap.has(dayKey)) {
                row.dailyMap.set(dayKey, {
                    date: dayKey,
                    paymentCount: 0,
                    totalReceived: 0,
                    payments: []
                });
            }

            const dayBucket = row.dailyMap.get(dayKey);
            dayBucket.paymentCount += 1;
            dayBucket.totalReceived += amount;
            dayBucket.payments.push({
                id: String(tx._id),
                amount,
                description: tx.description || 'Payment Received',
                paymentDate: txDate,
                time: txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        });

        const reportData = Array.from(customerMap.values())
            .map((customer: any) => {
                const dailyBreakdown = Array.from(customer.dailyMap.values())
                    .map((day: any) => ({
                        ...day,
                        payments: day.payments.sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                    }))
                    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return {
                    customerId: customer.customerId,
                    customerName: customer.customerName,
                    customerPhone: customer.customerPhone,
                    totalPayments: customer.totalPayments,
                    totalReceived: customer.totalReceived,
                    latestPaymentDate: customer.latestPaymentDate,
                    dailyBreakdown
                };
            })
            .sort((a: any, b: any) => b.totalReceived - a.totalReceived);

        return {
            summary: {
                reportType: 'Customer Payments Received',
                totalReceived: totalReceived.toFixed(0),
                totalPayments: paymentTxs.length,
                customerCount: reportData.length,
            },
            reportData
        };
    }
    
    // --- INVENTORY REPORT ---
    if (reportType === 'inventory') {
        const products = await Product.find({}).sort({ name: 1 });
        const productValue = products.reduce((acc, prod) => acc + (prod.totalStock * (prod.averageCost || 0)), 0);

        const scrapStats = await ScrapBattery.aggregate([
             { $group: { _id: "$type", weight: { $sum: "$weight" }, value: { $sum: "$totalAmount" } } }
        ]);
        const bought = scrapStats.find(s => s._id === 'buy') || { weight: 0, value: 0 };
        const sold = scrapStats.find(s => s._id === 'sell') || { weight: 0, value: 0 };
        
        const currentScrapWeight = bought.weight - sold.weight;
        const avgScrapCost = bought.weight > 0 ? bought.value / bought.weight : 0;
        const currentScrapValue = currentScrapWeight * avgScrapCost;

        const combinedReportData = [
            ...products.map(p => p.toObject()),
            ...(currentScrapWeight !== 0 ? [{
                sku: 'SCRAP-STOCK',
                name: 'Scrap Lead/Batteries',
                category: 'Raw Material',
                totalStock: currentScrapWeight, 
                averageCost: avgScrapCost,
                price: avgScrapCost, 
                isScrap: true
            }] : [])
        ];

        return {
            summary: { 
                reportType: 'Inventory Snapshot', 
                totalValue: (productValue + currentScrapValue).toFixed(0), 
                totalSKUs: products.length + (currentScrapWeight !== 0 ? 1 : 0) 
            },
            reportData: combinedReportData
        };
    }

    // --- SALES PERFORMANCE REPORT ---
    if (!startDate || !endDate) throw new Error('Start and End dates are required');
    const start = new Date(startDate);
    const end = new Date(endDate); 
    end.setHours(23, 59, 59, 999);

    const productMap = new Map();
    const allProducts = await Product.find({}).select('_id sku name').lean();
    allProducts.forEach((p: any) => {
        productMap.set(String(p._id), { sku: p.sku || 'N/A', name: p.name, qty: 0, revenue: 0, cost: 0, dailyMap: new Map() });
    });

    const processItems = (items: any[]) => {
        items.forEach(item => {
            const prodKey = String(item._id.prodId); 
            const dateKey = item._id.date;
            if (!productMap.has(prodKey)) {
                productMap.set(prodKey, { sku: 'Deleted', name: 'Unknown', qty: 0, revenue: 0, cost: 0, dailyMap: new Map() });
            }
            const product = productMap.get(prodKey);
            product.qty += item.totalQty;
            product.revenue += item.totalRevenue;
            product.cost += item.totalCost;

            if (!product.dailyMap.has(dateKey)) { product.dailyMap.set(dateKey, { date: dateKey, qty: 0, revenue: 0, cost: 0 }); }
            const dailyEntry = product.dailyMap.get(dateKey);
            dailyEntry.qty += item.totalQty; dailyEntry.revenue += item.totalRevenue; dailyEntry.cost += item.totalCost;
        });
    };

    // 1. Retail Sales
    const billItems = await Billing.aggregate([
        { $match: { status: { $ne: 'cancelled' }, createdAt: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        { $group: { _id: { prodId: "$items.productRef", date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } }, totalQty: { $sum: "$items.quantity" }, totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, totalCost: { $sum: { $multiply: ["$items.cost", "$items.quantity"] } } } }
    ]);
    processItems(billItems);

    // 2. Wholesale Orders
    const orderItems = await Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        { $group: { _id: { prodId: "$items.productRef", date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } }, totalQty: { $sum: "$items.quantity" }, totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, totalCost: { $sum: { $multiply: ["$items.cost", "$items.quantity"] } } } }
    ]);
    processItems(orderItems);

    // 3. Claims
    const claims = await Claim.find({ createdAt: { $gte: start, $lte: end }, claimFee: { $gt: 0 } }).lean();
    if (claims.length > 0) {
        const claimKey = "CLAIM_FEES";
        productMap.set(claimKey, { sku: 'SVC-CLAIM', name: 'Claim Processing Fees', qty: 0, revenue: 0, cost: 0, dailyMap: new Map() });
        const claimEntry = productMap.get(claimKey);
        claims.forEach((c: any) => {
            const dateKey = new Date(c.createdAt).toISOString().split('T')[0];
            const fee = c.claimFee || 0;
            claimEntry.qty += 1; claimEntry.revenue += fee;
            if (!claimEntry.dailyMap.has(dateKey)) claimEntry.dailyMap.set(dateKey, { date: dateKey, qty: 0, revenue: 0, cost: 0 });
            const daily = claimEntry.dailyMap.get(dateKey); daily.qty += 1; daily.revenue += fee;
        });
    }

    // 4. SCRAP BATTERIES
    
    // A. Calculate Global Average Cost (Total Bought / Total Weight)
    const allBuys = await ScrapBattery.aggregate([
        { $match: { type: 'buy' } },
        { $group: { _id: null, totalWt: { $sum: "$weight" }, totalAmt: { $sum: "$totalAmount" } } }
    ]);
    
    // If no real buys exist, assume Avg Cost is 98% of selling price (fallback)
    let avgCostPerKg = 0;
    if (allBuys.length > 0 && allBuys[0].totalWt > 0) {
        avgCostPerKg = allBuys[0].totalAmt / allBuys[0].totalWt;
    }

    // B. Find Scrap Sales in range
    const scrapSales = await ScrapBattery.find({ type: 'sell', date: { $gte: start, $lte: end } }).lean();

    if (scrapSales.length > 0) {
        const scrapKey = "SCRAP_TRADING";
        productMap.set(scrapKey, { sku: 'SCRAP-PL', name: 'Scrap Battery Trading', qty: 0, revenue: 0, cost: 0, dailyMap: new Map() });
        const scrapEntry = productMap.get(scrapKey);
        
        scrapSales.forEach((s: any) => {
            const dateKey = new Date(s.date).toISOString().split('T')[0];
            const saleAmount = s.totalAmount || 0;
            const saleWeight = s.weight || 0; 
            
            // Calculate Cost based on Avg Buy Price
            const costRate = avgCostPerKg > 0 ? avgCostPerKg : (saleAmount / saleWeight) * 0.982; 
            const estimatedCost = saleWeight * costRate;

            // ✅ FIXED: Add actual weight to quantity
            scrapEntry.qty += saleWeight; 
            scrapEntry.revenue += saleAmount;
            scrapEntry.cost += estimatedCost;

            if (!scrapEntry.dailyMap.has(dateKey)) { scrapEntry.dailyMap.set(dateKey, { date: dateKey, qty: 0, revenue: 0, cost: 0 }); }
            const daily = scrapEntry.dailyMap.get(dateKey);
            daily.qty += saleWeight; 
            daily.revenue += saleAmount; 
            daily.cost += estimatedCost;
        });
    }

    const reportData = Array.from(productMap.values())
        .filter(p => p.qty > 0 || p.revenue > 0 || p.cost > 0) 
        .map(p => {
            const profit = p.revenue - p.cost;
            const margin = p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
            const avgSellPrice = p.qty > 0 ? p.revenue / p.qty : 0;
            const dailyBreakdown = Array.from(p.dailyMap.values()).map((d: any) => ({ date: d.date, qty: d.qty, revenue: d.revenue, profit: d.revenue - d.cost, avgPrice: d.qty > 0 ? d.revenue / d.qty : 0 })).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            return { sku: p.sku, name: p.name, qty: p.qty, avgSellPrice, revenue: p.revenue, profit, margin, dailyBreakdown };
        })
        .sort((a, b) => b.revenue - a.revenue);

    const totalRev = reportData.reduce((acc, p) => acc + p.revenue, 0);
    const totalProf = reportData.reduce((acc, p) => acc + p.profit, 0);

    return {
        summary: { reportType: 'Item-wise Performance', totalRevenue: totalRev.toFixed(0), grossProfit: totalProf.toFixed(0), totalItemsSold: reportData.reduce((acc, p) => acc + p.qty, 0) },
        reportData
    };
};

export const generateReport = asyncHandler(async (req: Request, res: Response) => {
    const { reportType, startDate, endDate, scrapTypeFilter, scrapGroupBy } = req.body;
    try {
        const data = await fetchReportData(reportType, startDate, endDate, { scrapTypeFilter, scrapGroupBy });
        res.status(200).json(data);
    } catch (err: any) { res.status(400); throw new Error(err.message || "Report Generation Failed"); }
});

export const downloadReportPDF = asyncHandler(async (req: Request, res: Response) => {
    const { reportType, startDate, endDate, scrapTypeFilter, scrapGroupBy } = req.body;
    try {
        const data = await fetchReportData(reportType, startDate, endDate, { scrapTypeFilter, scrapGroupBy });
        generateSalesReportPDF(res, { reportType, startDate: startDate ? new Date(startDate) : new Date(), endDate: endDate ? new Date(endDate) : new Date(), summary: data.summary, data: data.reportData });
    } catch (err: any) { res.status(400); throw new Error(err.message || "PDF Generation Failed"); }
});