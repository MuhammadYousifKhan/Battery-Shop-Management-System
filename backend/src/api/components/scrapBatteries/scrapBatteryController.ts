// src/api/components/scrapBatteries/scrapBatteryController.ts
import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import ScrapBattery from "../../models/ScrapBatteries";
import Customer from '../../models/Customer';
import Supplier from '../../models/Supplier';
import CustomerTransaction from '../../models/CustomerTransaction';
import SupplierTransaction from '../../models/SupplierTransaction';

const formatPakistaniPhone = (phone: string): string => {
    if (!phone) return '';
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10 && clean.startsWith('3')) return `92${clean}`;
    if (clean.length === 11 && clean.startsWith('03')) return `92${clean.substring(1)}`;
    if (clean.length === 12 && clean.startsWith('92')) return clean;
    return clean;
};

const toNum = (value: any): number => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const buildScrapLedgerDescription = (weight: number, pricePerKg: number) => {
    return `Scrap purchase (${weight.toFixed(2)} Kg @ Rs ${pricePerKg.toFixed(2)}/Kg)`;
};

const buildScrapSupplierDescription = (
    weight: number,
    pricePerKg: number,
    settlementMode: 'deduct_balance' | 'receive_payment' | 'receive' | 'pay'
) => {
    let direction = 'Deducted from Supplier Balance';
    if (settlementMode === 'receive_payment') direction = 'Payment Received from Supplier';
    if (settlementMode === 'pay') direction = 'Paid to Supplier';
    if (settlementMode === 'receive') direction = 'Deducted from Supplier Balance';
    return `Scrap sale (${direction}) ${weight.toFixed(2)} Kg @ Rs ${pricePerKg.toFixed(2)}/Kg`;
};

const revertSupplierSettlement = async (
    supplierTransactionRef: mongoose.Types.ObjectId | undefined,
    session: mongoose.ClientSession
) => {
    if (!supplierTransactionRef) return;

    const transaction = await SupplierTransaction.findById(supplierTransactionRef).session(session);
    if (!transaction) return;

    const supplier = await Supplier.findById(transaction.supplier).session(session);
    if (supplier) {
        supplier.currentBalance = toNum(supplier.currentBalance) + toNum(transaction.debit) - toNum(transaction.credit);
        await supplier.save({ session });
    }

    await SupplierTransaction.findByIdAndDelete(transaction._id).session(session);
};

const createSupplierSettlement = async (
    {
        supplierRef,
        weight,
        pricePerKg,
        settlementMode,
        userId,
        session
    }: {
        supplierRef: mongoose.Types.ObjectId;
        weight: number;
        pricePerKg: number;
        settlementMode: 'deduct_balance' | 'receive_payment' | 'receive' | 'pay';
        userId?: mongoose.Types.ObjectId;
        session: mongoose.ClientSession;
    }
) => {
    const supplier = await Supplier.findById(supplierRef).session(session);
    if (!supplier) throw new Error('Selected supplier not found.');

    const totalAmount = weight * pricePerKg;
    const normalizedMode = settlementMode === 'receive'
        ? 'deduct_balance'
        : (settlementMode === 'pay' ? 'pay' : settlementMode);

    const debit = (normalizedMode === 'deduct_balance' || normalizedMode === 'receive_payment') ? totalAmount : 0;
    const credit = normalizedMode === 'pay' ? totalAmount : 0;

    let txType: 'Scrap Balance Deduction' | 'Scrap Payment Received' | 'Scrap Supplier Payment';
    if (normalizedMode === 'receive_payment') {
        txType = 'Scrap Payment Received';
    } else if (normalizedMode === 'pay') {
        txType = 'Scrap Supplier Payment';
    } else {
        txType = 'Scrap Balance Deduction';
    }

    supplier.currentBalance = toNum(supplier.currentBalance) + credit - debit;
    await supplier.save({ session });

    const [createdTx] = await SupplierTransaction.create([{
        supplier: supplier._id,
        user: userId,
        type: txType,
        description: buildScrapSupplierDescription(weight, pricePerKg, normalizedMode),
        debit,
        credit,
        balance: supplier.currentBalance,
        transactionDate: new Date()
    }], { session });

    return { supplier, createdTx };
};

const resolveScrapCustomer = async (
    {
        customerRef,
        customerName,
        customerPhone,
        customerCategory
    }: {
        customerRef?: string;
        customerName?: string;
        customerPhone?: string;
        customerCategory?: string;
    },
    session: mongoose.ClientSession
) => {
    let customer: any = null;
    const normalizedPhone = customerPhone ? formatPakistaniPhone(customerPhone) : '';

    if (customerRef) {
        customer = await Customer.findById(customerRef).session(session);
        if (!customer) throw new Error('Selected customer not found.');
    } else {
        if (!normalizedPhone) {
            throw new Error('Phone number is required for walk-in scrap purchase to keep ledger integrity.');
        }

        customer = await Customer.findOne({ phone: normalizedPhone }).session(session);

        if (!customer) {
            customer = new Customer({
                name: customerName?.trim() || 'Walk-in Customer',
                phone: normalizedPhone,
                type: customerCategory === 'wholesale' ? 'wholesale' : 'retail',
                currentBalance: 0,
                initialBalance: 0
            });
            await customer.save({ session });
        }
    }

    return {
        customer,
        normalizedPhone: normalizedPhone || customer.phone,
        resolvedCategory:
            customerCategory === 'walkin'
                ? 'walkin'
                : (customer.type === 'wholesale' ? 'wholesale' : 'retail')
    };
};

// Helper to calculate stock details
const getStockStats = async () => {
    const stats = await ScrapBattery.aggregate([
        {
            $group: {
                _id: "$type",
                totalWeight: { $sum: "$weight" },
                totalAmount: { $sum: "$totalAmount" }
            }
        }
    ]);

    const bought = stats.find(s => s._id === 'buy') || { totalWeight: 0, totalAmount: 0 };
    const sold = stats.find(s => s._id === 'sell') || { totalWeight: 0, totalAmount: 0 };
    
    // 1. Calculate Available Stock
    const currentStock = bought.totalWeight - sold.totalWeight;

    // 2. Calculate Weighted Average Cost (Price Per KG)
    // Formula: Total Money Spent / Total Weight Bought
    const avgCostPerKg = bought.totalWeight > 0 
        ? (bought.totalAmount / bought.totalWeight) 
        : 0;

    // 3. Calculate Value of CURRENT Stock (The fix you asked for)
    // If Stock is 0, this becomes 0.
    const currentStockValue = currentStock * avgCostPerKg;

    return {
        currentStock: parseFloat(currentStock.toFixed(2)),
        currentStockValue: parseFloat(currentStockValue.toFixed(2)),
        totalSoldValue: sold.totalAmount, // We keep historical sales total
        avgCostPerKg: parseFloat(avgCostPerKg.toFixed(2))
    };
};

// @desc    Add a new Buy or Sell transaction
// @route   POST /api/scrap
export const addScrapBatteryTransaction = asyncHandler(async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
    const { type, customerName, customerRef, customerPhone, customerCategory, supplierRef, settlementMode, weight, pricePerKg } = req.body;

    if (!weight || !pricePerKg || !type) {
        res.status(400); throw new Error('Type, Weight, and PricePerKg are required');
    }

    const weightNum = parseFloat(weight);
    const priceNum = parseFloat(pricePerKg);

    // If Selling, validate stock
    if (type === 'sell') {
        const stats = await getStockStats();
        if (stats.currentStock < weightNum) {
            res.status(400); 
            throw new Error(`Insufficient scrap stock. Available: ${stats.currentStock} Kg`);
        }
    }

    const totalAmount = weightNum * priceNum;

    let ledgerTransaction: any = null;
    let resolvedCustomer: any = null;
    let resolvedSupplier: any = null;
    let supplierTransaction: any = null;
    let resolvedPhone = '';
    let resolvedCategory = type === 'buy' ? 'walkin' : 'dealer';
    let resolvedCustomerName = customerName || (type === 'buy' ? 'Walk-in Customer' : 'Scrap Dealer');
    const resolvedSettlementMode: 'deduct_balance' | 'receive_payment' | 'pay' =
        settlementMode === 'pay'
            ? 'pay'
            : (settlementMode === 'deduct_balance' || settlementMode === 'receive')
                ? 'deduct_balance'
                : 'receive_payment';

    if (type === 'buy') {
        const resolved = await resolveScrapCustomer({ customerRef, customerName, customerPhone, customerCategory }, session);
        resolvedCustomer = resolved.customer;
        resolvedPhone = resolved.normalizedPhone;
        resolvedCategory = resolved.resolvedCategory;
        resolvedCustomerName = resolvedCustomer.name;

        const previousBalance = toNum(resolvedCustomer.currentBalance);
        const newBalance = previousBalance - totalAmount;

        ledgerTransaction = await CustomerTransaction.create([
            {
                customer: resolvedCustomer._id,
                // @ts-ignore
                user: req.user?._id,
                type: 'Adjustment',
                description: buildScrapLedgerDescription(weightNum, priceNum),
                debit: 0,
                credit: totalAmount,
                balance: newBalance,
                transactionDate: new Date()
            }
        ], { session });

        resolvedCustomer.currentBalance = newBalance;
        await resolvedCustomer.save({ session });
    } else {
        if (!supplierRef) {
            throw new Error('Supplier is required for scrap sale.');
        }
        resolvedSupplier = await Supplier.findById(supplierRef).session(session);
        if (!resolvedSupplier) {
            throw new Error('Selected supplier not found.');
        }

        resolvedCustomerName = resolvedSupplier.name;
        resolvedPhone = resolvedSupplier.phone || '';
        resolvedCategory = 'dealer';

        const settlement = await createSupplierSettlement({
            supplierRef: resolvedSupplier._id as mongoose.Types.ObjectId,
            weight: weightNum,
            pricePerKg: priceNum,
            settlementMode: resolvedSettlementMode,
            userId: req.user?._id as mongoose.Types.ObjectId,
            session
        });
        supplierTransaction = settlement.createdTx;
    }

    const transaction = new ScrapBattery({
        type,
        customerName: resolvedCustomerName,
        customerRef: resolvedCustomer?._id,
        supplierRef: resolvedSupplier?._id,
        supplierTransactionRef: supplierTransaction?._id as mongoose.Types.ObjectId,
        customerPhone: resolvedPhone,
        customerCategory: resolvedCategory,
        settlementMode: type === 'sell' ? resolvedSettlementMode : undefined,
        ledgerTransactionRef: Array.isArray(ledgerTransaction) ? ledgerTransaction[0]?._id : undefined,
        weight: weightNum,
        pricePerKg: priceNum,
        totalAmount
    });

    await transaction.save({ session });
    await session.commitTransaction();
    res.status(201).json(transaction);
    } catch (error: any) {
        await session.abortTransaction();
        res.status(400);
        throw new Error(error.message || 'Failed to add scrap transaction');
    } finally {
        session.endSession();
    }
});

// @desc    Get all transactions AND current stock stats
// @route   GET /api/scrap
export const getScrapBatteryTransactions = asyncHandler(async (req: Request, res: Response) => {
    const list = await ScrapBattery.find()
        .sort({ date: -1 })
        .populate('customerRef', 'name phone type')
        .populate('supplierRef', 'name phone');
    
    // Get Corrected Stats
    const stats = await getStockStats();

    res.json({
        transactions: list,
        stats: {
            currentStock: stats.currentStock,
            
            // ✅ FIX: Send 'Current Stock Value' in the field used for "Total Bought Value"
            // This ensures the dashboard shows 0 when stock is 0.
            totalBoughtValue: stats.currentStockValue, 
            
            totalSoldValue: stats.totalSoldValue
        }
    });
});

// @desc    Update a scrap transaction
// @route   PUT /api/scrap/:id
export const updateScrapTransaction = asyncHandler(async (req: Request, res: Response) => {
    const { customerName, customerRef, customerPhone, customerCategory, supplierRef, settlementMode, weight, pricePerKg } = req.body;
    const transactionId = req.params.id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

    const transaction = await ScrapBattery.findById(transactionId).session(session);
    if (!transaction) {
        res.status(404); throw new Error('Transaction not found');
    }

    const weightNum = parseFloat(weight) || transaction.weight;
    const priceNum = parseFloat(pricePerKg) || transaction.pricePerKg;

    // Validate Stock if updating a Sell transaction
    if (transaction.type === 'sell') {
        const stats = await getStockStats();
        // Add back the old weight to see "Pre-Transaction" stock, then subtract new weight
        const stockAfterEdit = stats.currentStock + transaction.weight - weightNum;
        
        if (stockAfterEdit < 0) {
            res.status(400);
            throw new Error(`Cannot update: Would result in negative stock.`);
        }
    }

    transaction.weight = weightNum;
    transaction.pricePerKg = priceNum;
    transaction.totalAmount = weightNum * priceNum;

    // Keep customer ledger in sync for BUY entries.
    if (transaction.type === 'buy') {
        if (transaction.ledgerTransactionRef) {
            const existingLedger = await CustomerTransaction.findById(transaction.ledgerTransactionRef).session(session);
            if (existingLedger) {
                const oldCustomer = await Customer.findById(existingLedger.customer).session(session);
                if (oldCustomer) {
                    oldCustomer.currentBalance = toNum(oldCustomer.currentBalance) + toNum(existingLedger.credit) - toNum(existingLedger.debit);
                    await oldCustomer.save({ session });
                }
                await CustomerTransaction.findByIdAndDelete(existingLedger._id).session(session);
            }
        }

        const resolved = await resolveScrapCustomer(
            {
                customerRef: customerRef || String(transaction.customerRef || ''),
                customerName: customerName || transaction.customerName,
                customerPhone: customerPhone || transaction.customerPhone,
                customerCategory: customerCategory || transaction.customerCategory
            },
            session
        );

        const resolvedCustomer = resolved.customer;
        const updatedTotal = weightNum * priceNum;
        const previousBalance = toNum(resolvedCustomer.currentBalance);
        const newBalance = previousBalance - updatedTotal;

        const createdLedger = await CustomerTransaction.create([
            {
                customer: resolvedCustomer._id,
                // @ts-ignore
                user: req.user?._id,
                type: 'Adjustment',
                description: buildScrapLedgerDescription(weightNum, priceNum),
                debit: 0,
                credit: updatedTotal,
                balance: newBalance,
                transactionDate: new Date(transaction.date || Date.now())
            }
        ], { session });

        resolvedCustomer.currentBalance = newBalance;
        await resolvedCustomer.save({ session });

        transaction.customerRef = resolvedCustomer._id;
        transaction.customerName = resolvedCustomer.name;
        transaction.customerPhone = resolved.normalizedPhone;
        transaction.customerCategory = resolved.resolvedCategory as any;
        transaction.ledgerTransactionRef = createdLedger[0]._id;
        transaction.supplierRef = undefined;
        transaction.supplierTransactionRef = undefined;
        transaction.settlementMode = undefined;
    } else {
        await revertSupplierSettlement(transaction.supplierTransactionRef as mongoose.Types.ObjectId | undefined, session);

        const resolvedSupplierId = supplierRef || String(transaction.supplierRef || '');
        if (!resolvedSupplierId) {
            throw new Error('Supplier is required for scrap sale.');
        }

        const resolvedSupplier = await Supplier.findById(resolvedSupplierId).session(session);
        if (!resolvedSupplier) {
            throw new Error('Selected supplier not found.');
        }

        const resolvedSettlementMode: 'deduct_balance' | 'receive_payment' | 'pay' =
            settlementMode === 'pay'
                ? 'pay'
                : (settlementMode === 'deduct_balance' || settlementMode === 'receive')
                    ? 'deduct_balance'
                    : (settlementMode === 'receive_payment'
                        ? 'receive_payment'
                        : (transaction.settlementMode === 'pay'
                            ? 'pay'
                            : ((transaction.settlementMode === 'deduct_balance' || transaction.settlementMode === 'receive')
                                ? 'deduct_balance'
                                : 'receive_payment')));

        const settlement = await createSupplierSettlement({
            supplierRef: resolvedSupplier._id as mongoose.Types.ObjectId,
            weight: weightNum,
            pricePerKg: priceNum,
            settlementMode: resolvedSettlementMode,
            userId: req.user?._id as mongoose.Types.ObjectId,
            session
        });

        (transaction as any).supplierRef = resolvedSupplier._id as mongoose.Types.ObjectId;
        (transaction as any).supplierTransactionRef = settlement.createdTx._id as mongoose.Types.ObjectId;
        (transaction as any).settlementMode = resolvedSettlementMode;
        transaction.customerName = resolvedSupplier.name;
        transaction.customerPhone = resolvedSupplier.phone || '';
        transaction.customerCategory = 'dealer';
        transaction.customerRef = undefined;
    }

    const updated = await transaction.save({ session });
    await session.commitTransaction();
    res.json(updated);
    } catch (error: any) {
        await session.abortTransaction();
        res.status(400);
        throw new Error(error.message || 'Failed to update scrap transaction');
    } finally {
        session.endSession();
    }
});

// @desc    Delete a scrap transaction
// @route   DELETE /api/scrap/:id
export const deleteScrapTransaction = asyncHandler(async (req: Request, res: Response) => {
    const transactionId = req.params.id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

    const transaction = await ScrapBattery.findById(transactionId).session(session);
    if (!transaction) { res.status(404); throw new Error('Transaction not found'); }

    // If deleting a BUY, check if stock would go negative
    if (transaction.type === 'buy') {
        const stats = await getStockStats();
        if (stats.currentStock - transaction.weight < 0) {
            res.status(400);
            throw new Error(`Cannot delete: Would result in negative stock.`);
        }

        if (transaction.ledgerTransactionRef) {
            const ledger = await CustomerTransaction.findById(transaction.ledgerTransactionRef).session(session);
            if (ledger) {
                const customer = await Customer.findById(ledger.customer).session(session);
                if (customer) {
                    customer.currentBalance = toNum(customer.currentBalance) + toNum(ledger.credit) - toNum(ledger.debit);
                    await customer.save({ session });
                }
                await CustomerTransaction.findByIdAndDelete(ledger._id).session(session);
            }
        }
    } else {
        await revertSupplierSettlement(transaction.supplierTransactionRef as mongoose.Types.ObjectId | undefined, session);
    }

    await ScrapBattery.findByIdAndDelete(transactionId).session(session);
    await session.commitTransaction();
    res.json({ message: 'Transaction deleted successfully' });
    } catch (error: any) {
        await session.abortTransaction();
        res.status(400);
        throw new Error(error.message || 'Failed to delete scrap transaction');
    } finally {
        session.endSession();
    }
});