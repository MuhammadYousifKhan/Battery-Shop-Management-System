import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Supplier from '../../models/Supplier';
import SupplierTransaction from '../../models/SupplierTransaction'; 
import Closing from '../../models/Closing'; 
import { generateSupplierLedgerPDF, generateSupplierPaymentPDF } from '../../utils/pdfGenerator'; 

// @desc    Get all suppliers with Real-Time Balance
export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const suppliers = await Supplier.find({}).sort({ name: 1 }).lean();

    // Aggregate TRUE balance from transactions
    const balances = await SupplierTransaction.aggregate([
        {
            $group: {
                _id: "$supplier",
                totalCredit: { $sum: "$credit" },
                totalDebit: { $sum: "$debit" }
            }
        }
    ]);

    const balanceMap = new Map();
    balances.forEach(b => {
        const bal = (b.totalCredit || 0) - (b.totalDebit || 0);
        balanceMap.set(String(b._id), bal);
    });

    const result = suppliers.map(s => ({
        ...s,
        // @ts-ignore
        currentBalance: balanceMap.has(String(s._id)) ? balanceMap.get(String(s._id)) : 0
    }));

    res.status(200).json(result);
});

// @desc    Create a new supplier
export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, contactPerson, address, openingBalance } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const supplierExists = await Supplier.findOne({ name }).session(session);
        if (supplierExists) {
            res.status(400); throw new Error('Supplier name already exists');
        }

        const initialBal = parseFloat(openingBalance) || 0;

        const supplier = new Supplier({
            name, phone, contactPerson, address,
            initialBalance: initialBal,
            currentBalance: initialBal
        });

        const createdSupplier = await supplier.save({ session });

        if (initialBal !== 0) {
            await SupplierTransaction.create([{
                supplier: createdSupplier._id,
                user: userId,
                type: 'Initial Balance',
                description: 'Opening Balance',
                debit: initialBal < 0 ? Math.abs(initialBal) : 0, 
                credit: initialBal > 0 ? initialBal : 0,
                balance: initialBal
            }], { session });
        }

        await session.commitTransaction();
        res.status(201).json(createdSupplier);
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// @desc    Update a supplier
export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, contactPerson, address, openingBalance, status } = req.body;
    // @ts-ignore
    const userId = req.user?._id; 

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const supplier = await Supplier.findById(req.params.id).session(session);
        if (!supplier) { 
            res.status(404); throw new Error('Supplier not found'); 
        }

        if (openingBalance !== undefined && openingBalance !== null && openingBalance !== '') {
            const newOpeningBal = parseFloat(openingBalance);
            const oldOpeningBal = supplier.initialBalance || 0;

            if (!isNaN(newOpeningBal) && newOpeningBal !== oldOpeningBal) {
                const diff = newOpeningBal - oldOpeningBal;

                const initTx = await SupplierTransaction.findOne({
                    supplier: supplier._id,
                    type: 'Initial Balance'
                }).session(session);

                if (initTx) {
                    initTx.credit = newOpeningBal > 0 ? newOpeningBal : 0; 
                    initTx.debit = newOpeningBal < 0 ? Math.abs(newOpeningBal) : 0; 
                    initTx.balance = newOpeningBal;
                    initTx.description = `Opening Balance (Edited)`;
                    await initTx.save({ session });
                } else {
                    if (newOpeningBal !== 0) {
                        await SupplierTransaction.create([{
                            supplier: supplier._id,
                            user: userId,
                            type: 'Initial Balance',
                            description: 'Opening Balance (Manual Adjustment)',
                            debit: newOpeningBal < 0 ? Math.abs(newOpeningBal) : 0,
                            credit: newOpeningBal > 0 ? newOpeningBal : 0,
                            balance: newOpeningBal,
                            transactionDate: supplier.createdAt 
                        }], { session });
                    }
                }

                supplier.initialBalance = newOpeningBal;
                supplier.currentBalance = (supplier.currentBalance || 0) + diff;
            }
        }

        if (name) supplier.name = name;
        if (phone) supplier.phone = phone;
        if (contactPerson) supplier.contactPerson = contactPerson;
        if (address) supplier.address = address;
        if (status) supplier.status = status;

        const updatedSupplier = await supplier.save({ session });
        await session.commitTransaction();
        
        res.json(updatedSupplier);

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplier = await Supplier.findById(req.params.id);
    if (supplier) {
        await supplier.deleteOne();
        res.json({ message: 'Supplier removed' });
    } else {
        res.status(404); throw new Error('Supplier not found');
    }
});

// @desc    Add Payment to Supplier
export const addSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const { amount, date, description } = req.body;
    const supplierId = req.params.id;
    // @ts-ignore
    const userId = req.user._id;

    if (!amount || amount <= 0) {
        res.status(400); throw new Error("Invalid amount");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const supplier = await Supplier.findById(supplierId).session(session);
        if (!supplier) throw new Error("Supplier not found");

        supplier.currentBalance -= parseFloat(amount); 
        await supplier.save({ session });

        await SupplierTransaction.create([{
            supplier: supplier._id,
            user: userId,
            type: 'Payment',
            description: description || 'Payment to Supplier',
            debit: amount,
            credit: 0,
            balance: supplier.currentBalance,
            transactionDate: date || new Date()
        }], { session });

        await session.commitTransaction();
        res.json({ message: "Payment recorded", balance: supplier.currentBalance });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: error instanceof Error ? error.message : "Payment failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Get Supplier Ledger (JSON) - RECALCULATES ROW BALANCES
export const getSupplierLedger = asyncHandler(async (req: Request, res: Response) => {
    const supplierId = req.params.id;
    const { startDate, endDate } = req.query;
    
    const supplier = await Supplier.findById(supplierId).lean();
    if (!supplier) { res.status(404); throw new Error("Supplier not found"); }

    let query: any = { supplier: supplierId };
    let openingBalance = 0;

    // 1. Calculate Opening Balance from scratch (Safe Method)
    if (startDate) {
        const start = new Date(startDate as string);
        if (!isNaN(start.getTime())) {
            start.setHours(0, 0, 0, 0);
            
            // Sum all credits and debits BEFORE the start date
            const prevStats = await SupplierTransaction.aggregate([
                { 
                    $match: { 
                        supplier: new mongoose.Types.ObjectId(supplierId), 
                        transactionDate: { $lt: start } 
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        totalCredit: { $sum: "$credit" }, 
                        totalDebit: { $sum: "$debit" } 
                    } 
                }
            ]);

            const prevCredit = prevStats[0]?.totalCredit || 0;
            const prevDebit = prevStats[0]?.totalDebit || 0;
            openingBalance = prevCredit - prevDebit;

            // Set Query for Current Period
            const end = endDate ? new Date(endDate as string) : new Date();
            end.setHours(23, 59, 59, 999);
            query.transactionDate = { $gte: start, $lte: end };
        }
    }

    // 2. Fetch Raw Transactions (Oldest First)
    let rawLedger = await SupplierTransaction.find(query)
        .sort({ transactionDate: 1, createdAt: 1 }) 
        .populate('user', 'username')
        .populate('invoiceRef', 'invoiceNumber')
        .lean();

    // 3. RECALCULATE RUNNING BALANCE FOR EACH ROW
    // This fixes the "5,200,699" error by ignoring the DB 'balance' and calculating it fresh.
    let runningBalance = openingBalance;
    
    const recalculatedLedger = rawLedger.map((tx: any) => {
        const credit = tx.credit || 0;
        const debit = tx.debit || 0;
        
        // Apply Math: Previous + Credit (Bill) - Debit (Payment)
        runningBalance = runningBalance + credit - debit;

        return {
            ...tx,
            balance: runningBalance // <--- Overwrite with correct calculated value
        };
    });

    const scrapTypes = new Set([
        'Scrap Settlement',
        'Scrap Balance Deduction',
        'Scrap Payment Received',
        'Scrap Supplier Payment'
    ]);
    const scrapSettlements = recalculatedLedger.filter((tx: any) => scrapTypes.has(tx.type));
    const scrapSummary = scrapSettlements.reduce((acc: any, tx: any) => {
        acc.count += 1;
        const debit = Number(tx.debit || 0);
        const credit = Number(tx.credit || 0);
        if (tx.type === 'Scrap Payment Received') {
            acc.paymentReceived += debit;
        } else if (tx.type === 'Scrap Balance Deduction' || tx.type === 'Scrap Settlement') {
            acc.deductedFromBalance += debit;
        } else if (tx.type === 'Scrap Supplier Payment') {
            acc.paidToSupplier += credit;
        }
        return acc;
    }, { count: 0, deductedFromBalance: 0, paymentReceived: 0, paidToSupplier: 0 });

    // 4. Send Correct Data
    res.json({ 
        supplier, 
        ledger: recalculatedLedger, 
        openingBalance, 
        closingBalance: runningBalance,
        scrapSettlements,
        scrapSummary: {
            count: scrapSummary.count,
            deductedFromBalance: scrapSummary.deductedFromBalance,
            paymentReceived: scrapSummary.paymentReceived,
            paidToSupplier: scrapSummary.paidToSupplier,
            netPayableReduction: (scrapSummary.deductedFromBalance + scrapSummary.paymentReceived) - scrapSummary.paidToSupplier
        }
    });
});

// @desc    Get Supplier Ledger PDF
export const getSupplierLedgerPdf = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const supplier = await Supplier.findById(id).lean();
    if (!supplier) { res.status(404); throw new Error("Supplier not found"); }

    const lastClosing = await Closing.findOne().sort({ closingDate: -1 }).lean();
    const defaultStart = lastClosing ? lastClosing.closingDate : new Date(new Date().setDate(new Date().getDate() - 30));

    const start = startDate ? new Date(startDate as string) : new Date(defaultStart);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    if (isNaN(start.getTime())) start.setTime(new Date(defaultStart).getTime());
    if (isNaN(end.getTime())) end.setTime(Date.now());

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const lastTransaction = await SupplierTransaction.findOne({
        supplier: supplier._id,
        transactionDate: { $lt: start }
    }).sort({ transactionDate: -1, createdAt: -1 }).lean();

    let openingBalance = lastTransaction ? lastTransaction.balance : 0;
    
    if (!lastTransaction) {
        const firstTx = await SupplierTransaction.findOne({ supplier: supplier._id }).sort({ transactionDate: 1 }).lean();
        // @ts-ignore
        if (!firstTx || new Date(firstTx.transactionDate) >= start) openingBalance = 0;
    }

    const transactions = await SupplierTransaction.find({
        supplier: supplier._id,
        transactionDate: { $gte: start, $lte: end }
    })
    .sort({ transactionDate: 1, createdAt: 1 }) 
    .populate({
        path: 'invoiceRef',
        select: 'items invoiceNumber',
        populate: { path: 'items.productRef', select: 'name' } 
    })
    .lean();

    // @ts-ignore
    generateSupplierLedgerPDF(res, supplier, transactions, openingBalance, start, end);
});

// @desc    Get Single Payment PDF
export const getPaymentPdf = asyncHandler(async (req: Request, res: Response) => {
    const { paymentId } = req.params;
    const transaction = await SupplierTransaction.findById(paymentId).populate('supplier').lean();
    
    if (!transaction || transaction.type !== 'Payment') {
        res.status(404); throw new Error("Payment record not found");
    }
    
    // @ts-ignore
    generateSupplierPaymentPDF(res, transaction, transaction.supplier);
});