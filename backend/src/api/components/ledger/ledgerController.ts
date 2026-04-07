import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import CustomerTransaction from '../../models/CustomerTransaction';
import Customer from '../../models/Customer';
import { generateLedgerPDF, generateLedgerPDFBuffer } from '../../utils/epsonPdfGenerator';
import { sendDocumentWhatsApp } from '../../utils/whatsappService';

// --- HELPER: Recalculate opening balance from scratch ---
// Never trust stored tx.balance snapshots — they become stale after payment edits/deletes
const calculateOpeningBalance = async (customerId: any, beforeDate: Date, initialBalance: number): Promise<number> => {
    const priorTransactions = await CustomerTransaction.find({
        customer: customerId,
        transactionDate: { $lt: beforeDate }
    }).sort({ transactionDate: 1, createdAt: 1 }).lean();

    if (priorTransactions.length === 0) {
        return initialBalance || 0;
    }

    let runningBalance = 0;
    for (const tx of priorTransactions) {
        const isInitial = (tx.type || '').toLowerCase() === 'initial balance';
        if (isInitial) {
            runningBalance += (tx.debit || 0);
            runningBalance -= (tx.credit || 0);
        } else if (tx.debit > 0) {
            runningBalance += tx.debit;
        } else if (tx.credit > 0) {
            runningBalance -= tx.credit;
        }
    }
    return runningBalance;
};

// --- DOWNLOAD PDF (BROWSER) ---
export const getCustomerLedgerPdf = asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;

    const customer = await Customer.findById(customerId);
    if (!customer) { res.status(404); throw new Error("Customer not found"); }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate as string) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // 1. Calculate Opening Balance (recalculated from scratch, never use stale snapshots)
    const openingBalance = await calculateOpeningBalance(customer._id, start, customer.initialBalance || 0);

    // 2. Fetch Transactions (Sorted Oldest -> Newest)
    const rawTransactions = await CustomerTransaction.find({
        customer: customer._id,
        transactionDate: { $gte: start, $lte: end }
    })
    .sort({ transactionDate: 1, createdAt: 1 }) 
    .populate({
        path: 'orderRef',
        populate: { path: 'items.productRef', select: 'sku name' }
    }) 
    .populate('billRef')  
    .populate('invoiceRef') 
    .lean();

    // 3. Filter out "Opening Balance" rows to prevent duplication
    const transactions = rawTransactions.filter(tx => {
        const desc = (tx.description || '').toLowerCase();
        const type = (tx.type || '').toLowerCase();
        
        const isInit = type === 'initial balance' || 
                       desc.includes('opening balance') || 
                       desc.includes('legacy fix');
                       
        return !isInit;
    });

    // @ts-ignore
    generateLedgerPDF(res, customer, transactions, openingBalance, start, end);
});

// --- SEND VIA WHATSAPP ---
export const sendLedgerWhatsApp = asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const { startDate, endDate } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) { res.status(404); throw new Error("Customer not found"); }
    if (!customer.phone) { res.status(400); throw new Error("Customer phone number missing"); }

    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // 1. Calculate Opening Balance (recalculated from scratch, never use stale snapshots)
    const openingBalance = await calculateOpeningBalance(customer._id, start, customer.initialBalance || 0);

    // 2. Fetch Transactions
    // ✅ FIXED: Added .populate() so PDF Generator can see items
    const rawTransactions = await CustomerTransaction.find({
        customer: customer._id,
        transactionDate: { $gte: start, $lte: end }
    })
    .sort({ transactionDate: 1, createdAt: 1 })
    .populate({
        path: 'orderRef',
        populate: { path: 'items.productRef', select: 'sku name' }
    }) 
    .populate('billRef')  
    .populate('invoiceRef')
    .lean();

    // 3. Clean Filter
    const transactions = rawTransactions.filter(tx => {
        const desc = (tx.description || '').toLowerCase();
        const type = (tx.type || '').toLowerCase();
        const isInit = type === 'initial balance' || 
                       desc.includes('opening balance') || 
                       desc.includes('legacy fix');
        return !isInit;
    });

    try {
        const baseUrl = process.env.BASE_URL || 'https://your-app.vercel.app';
        const pdfUrl = `${baseUrl}/api/ledger/${customerId}/pdf?startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
        const filename = `Ledger_${customer.name.replace(/\s+/g, '_')}.pdf`;

        const sent = await sendDocumentWhatsApp(
            customer.phone,
            pdfUrl,
            customer.name,
            'Statement',
            filename
        );
        
        if (sent) {
            res.json({ message: "WhatsApp sent successfully" });
        } else {
            throw new Error("Failed to send");
        }
    } catch (error) {
        console.error("WhatsApp Error:", error);
        res.status(500).json({ message: "WhatsApp failed." });
    }
});