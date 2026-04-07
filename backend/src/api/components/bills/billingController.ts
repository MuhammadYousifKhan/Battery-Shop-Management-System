import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose, { Types } from 'mongoose';
import Billing from '../../models/Billing';
import Customer from '../../models/Customer';
import Product from '../../models/Product';
import CustomerTransaction from '../../models/CustomerTransaction'; 
import ScrapBattery from '../../models/ScrapBatteries'; 
import { removeStockDetailed, addStock } from '../../utils/stockService';
import { generateBillPDF } from '../../utils/epsonPdfGenerator';
import { sendDocumentWhatsApp } from '../../utils/whatsappService';

// --- 🛠️ HELPER FORMATTERS ---
const formatPakistaniPhone = (phone: string | undefined): string | undefined => {
    if (!phone) return undefined;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('03') && clean.length === 11) return '92' + clean.substring(1);
    if (clean.startsWith('3') && clean.length === 10) return '92' + clean;
    if (clean.startsWith('923') && clean.length === 12) return clean;
    return clean;
};

const formatPakistaniCNIC = (nic: string | undefined): string | undefined => {
    if (!nic) return undefined;
    const digits = nic.replace(/\D/g, '');
    if (digits.length !== 13) return nic; 
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
};

const normalizeOptionalCreatedAt = (value: any, context: string): Date | undefined => {
    if (!value) return undefined;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${context}: Invalid date provided.`);
    }

    if (
        parsed.getHours() === 0 &&
        parsed.getMinutes() === 0 &&
        parsed.getSeconds() === 0 &&
        parsed.getMilliseconds() === 0
    ) {
        const now = new Date();
        parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }

    return parsed;
};

const restoreBillItemStockFromAllocations = async (
    item: any,
    session: mongoose.ClientSession,
    sourceLabel: string
) => {
    const allocations = Array.isArray(item.batchCostAllocations)
        ? item.batchCostAllocations
        : [];

    if (allocations.length > 0) {
        for (const allocation of allocations) {
            const allocationQty = Number(allocation.quantity);
            const allocationCost = Number(allocation.costPrice);

            if (!Number.isFinite(allocationQty) || allocationQty <= 0) continue;
            if (!Number.isFinite(allocationCost) || allocationCost < 0) continue;

            await addStock(
                item.productRef as mongoose.Types.ObjectId,
                allocationQty,
                allocationCost,
                session,
                undefined,
                sourceLabel,
                allocation.receivedDate ? new Date(allocation.receivedDate) : new Date(0)
            );
        }
        return;
    }

    let costToRestore = item.cost;
    if (costToRestore === undefined || costToRestore === null || !Number.isFinite(Number(costToRestore))) {
        const product = await Product.findById(item.productRef).session(session);
        costToRestore = product ? (product.averageCost || 0) : 0;
    }

    await addStock(
        item.productRef as mongoose.Types.ObjectId,
        Number(item.quantity),
        Number(costToRestore),
        session,
        undefined,
        sourceLabel,
        new Date(0)
    );
};

// ---------------------------------------------------------

// @desc    Create a new bill (Retail Sale)
export const createBill = asyncHandler(async (req: Request, res: Response) => {
    let { customerName, customerRef, items, totalAmount, customerPhone, address, paidAmount, scrapWeight, scrapPricePerKg, scrapAmount, dueDate, nic, createdAt } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    if (!items || items.length === 0) {
        res.status(400); throw new Error('No items in bill');
    }

    const session = await mongoose.startSession();
    try {
        let createdBill: any; 
        const effectiveBillDate = normalizeOptionalCreatedAt(createdAt, 'Create bill') || new Date();

        await session.withTransaction(async () => {
            const enrichedItems = [];
            let isPhoneMandatory = false;

            // 1. DEDUCT STOCK & VALIDATE PRODUCTS
            for (const item of items) {
                const removal = await removeStockDetailed(item.productRef, item.quantity, session);
                const unitCost = removal.totalCost / item.quantity;

                const product = await Product.findById(item.productRef).session(session);
                if (!product) throw new Error(`Product not found: ${item.productName}`);
                isPhoneMandatory = true;

                enrichedItems.push({
                    ...item,
                    cost: unitCost, 
                    batchCostAllocations: removal.allocations,
                    sku: product.sku,
                    category: product.category
                });
            }

            // 2. VALIDATE CUSTOMER DATA
            const finalPhone = formatPakistaniPhone(customerPhone);
            const finalNic = formatPakistaniCNIC(nic);

            if (isPhoneMandatory && !finalPhone) throw new Error('Phone Number is MANDATORY for all sales.');

            // Link or Create Customer
            if (!customerRef && finalPhone) {
                const existingCustomer = await Customer.findOne({ phone: finalPhone }).session(session);
                if (existingCustomer) {
                    customerRef = existingCustomer._id;
                } else {
                    const [newCustomer] = await Customer.create([{
                        name: customerName,
                        phone: finalPhone,
                        type: 'retail',
                        address: address || '',
                        status: 'active',
                        currentBalance: 0,
                        initialBalance: 0
                    }], { session });
                    customerRef = newCustomer._id;
                }
            }

            // 3. FINANCIAL CALCULATIONS
            const grossTotal = parseFloat(totalAmount) || 0; 
            const scrapWt = parseFloat(scrapWeight) || 0;
            const scrapPrice = parseFloat(scrapPricePerKg) || 0;
            const scrap = scrapAmount ? parseFloat(scrapAmount) : (scrapWt * scrapPrice); 
            
            const actualPaid = paidAmount !== undefined ? parseFloat(paidAmount) : (grossTotal - scrap);
            const balance = grossTotal - actualPaid - scrap;

            let status = 'paid';
            if (balance > 1) status = 'partial'; 
            else if (balance > 0 && actualPaid === 0) status = 'pending';

            const initialPaymentHistory = actualPaid > 0 
                ? [{ amount: actualPaid, date: effectiveBillDate, note: 'Initial Payment' }] 
                : [];

            // 4. SCRAP ASSET CREATION (Buy)
            let scrapTransaction = null;
            if (scrapWt > 0 && scrapPrice > 0) {
                scrapTransaction = await ScrapBattery.create([{
                    type: 'buy', // Increases Stock
                    customerName: `${customerName} (Bill Adj)`,
                    weight: scrapWt,
                    pricePerKg: scrapPrice,
                    totalAmount: scrap,
                    date: effectiveBillDate
                }], { session });
            }

            // 5. CREATE BILL
            const bill = new Billing({
                customerName,
                customerRef: customerRef || null,
                customerPhone: finalPhone,    
                nic: finalNic,                
                items: enrichedItems,
                
                amount: grossTotal,
                
                scrapWeight: scrapWt,
                scrapPricePerKg: scrapPrice,
                scrapAmount: scrap,
                // @ts-ignore
                scrapRef: scrapTransaction ? scrapTransaction[0]._id : null, 
                
                paidAmount: actualPaid,
                balance: balance > 0 ? balance : 0, 
                dueDate: dueDate ? new Date(dueDate) : undefined, 
                paymentHistory: initialPaymentHistory,
                createdAt: effectiveBillDate,
                status,
                address
            });

            createdBill = await bill.save({ session });

            // 6. LEDGER UPDATE
            if (customerRef) {
                const customer = await Customer.findByIdAndUpdate(
                    customerRef, 
                    { $inc: { currentBalance: balance } },
                    { new: true, session }
                );

                if (customer) {
                    await CustomerTransaction.create([{
                        customer: customerRef,
                        user: userId,
                        type: 'Invoice',
                        description: `Retail Bill #${(createdBill as any)._id.toString().slice(-6)}`, 
                        debit: balance > 0 ? balance : 0, 
                        credit: 0,
                        balance: customer.currentBalance,
                        billRef: createdBill._id,
                        transactionDate: effectiveBillDate
                    }], { session });
                }
            }
        });

        res.status(201).json(createdBill);

    } catch (error: any) { 
        if (error.code === 11000) res.status(400).json({ message: "Customer with this phone number already exists." });
        else res.status(500).json({ message: error instanceof Error ? error.message : "Bill creation failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Update a bill
export const updateBill = asyncHandler(async (req: Request, res: Response) => {
    const { items, totalAmount, customerName, customerPhone, paidAmount, scrapWeight, scrapPricePerKg, scrapAmount, dueDate, nic } = req.body;
    const billId = req.params.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400); throw new Error("Update failed: Item list is missing.");
    }

    const session = await mongoose.startSession();
    try {
        let updatedBill: any;

        await session.withTransaction(async () => {
            const oldBill = await Billing.findById(billId).session(session);
            if (!oldBill) { throw new Error('Bill not found'); }
            if (oldBill.status === 'cancelled') { throw new Error('Cannot edit a cancelled bill'); }

                // 1. REVERT OLD STOCK (stamp as oldest so FIFO consumes it on re-deduct)
                for (const item of oldBill.items) {
                        await restoreBillItemStockFromAllocations(
                        item,
                        session,
                        `Bill Edit Revert #${(oldBill as any)._id.toString().slice(-6)}`
                        );
                }

            // 2. DEDUCT NEW STOCK
            const enrichedItems = [];
            let isPhoneMandatory = false;

            for (const item of items) {
                const removal = await removeStockDetailed(item.productRef, item.quantity, session);
                const unitCost = removal.totalCost / item.quantity;
                const product = await Product.findById(item.productRef).session(session);
                if (!product) throw new Error(`Product not found for update item: ${item.productRef}`);
                
                isPhoneMandatory = true;

                enrichedItems.push({ 
                    ...item, 
                    cost: unitCost, 
                    batchCostAllocations: removal.allocations,
                    sku: product.sku || item.sku,
                    category: product.category || item.category
                });
            }

            const finalPhone = formatPakistaniPhone(customerPhone) || oldBill.customerPhone;
            const finalNic = formatPakistaniCNIC(nic) || oldBill.nic;

            if (isPhoneMandatory && !finalPhone) throw new Error('Phone Number is MANDATORY for all sales.');

            // 3. RECALCULATE
            const newGross = parseFloat(totalAmount) || 0;
            const newScrapWt = scrapWeight !== undefined ? parseFloat(scrapWeight) : (oldBill.scrapWeight || 0);
            const newScrapPrice = scrapPricePerKg !== undefined ? parseFloat(scrapPricePerKg) : (oldBill.scrapPricePerKg || 0);
            const newScrap = scrapAmount !== undefined ? parseFloat(scrapAmount) : (newScrapWt * newScrapPrice);
            
            const newPaid = paidAmount !== undefined ? parseFloat(paidAmount) : oldBill.paidAmount; 
            const newBalance = newGross - newPaid - newScrap;
            
            const oldBalance = oldBill.balance || 0;
            const balanceDiff = (newBalance > 0 ? newBalance : 0) - oldBalance;

            // 4. LEDGER CORRECTION
            if (oldBill.customerRef) {
                const customer = await Customer.findById(oldBill.customerRef).session(session);
                if (customer) {
                    if (balanceDiff !== 0) {
                        customer.currentBalance += balanceDiff;
                        await customer.save({ session });
                    }
                    await CustomerTransaction.findOneAndUpdate(
                        { billRef: oldBill._id, type: 'Invoice' },
                        { 
                            description: `Retail Bill #${(oldBill as any)._id.toString().slice(-6)} (Edited)`,
                            debit: newBalance > 0 ? newBalance : 0,
                            balance: customer.currentBalance 
                        },
                        { session }
                    );
                }
            }

            // 5. UPDATE OBJECT
            oldBill.items = enrichedItems;
            oldBill.amount = newGross;
            oldBill.scrapWeight = newScrapWt;
            oldBill.scrapPricePerKg = newScrapPrice;
            oldBill.scrapAmount = newScrap;
            oldBill.customerName = customerName || oldBill.customerName;
            
            if (finalPhone) oldBill.customerPhone = finalPhone;
            if (finalNic) oldBill.nic = finalNic;
            if (dueDate !== undefined) oldBill.dueDate = dueDate ? new Date(dueDate) : undefined;

            oldBill.paidAmount = newPaid;
            oldBill.balance = newBalance > 0 ? newBalance : 0;
            
            if (newBalance <= 1) oldBill.status = 'paid'; 
            else if (newPaid > 0) oldBill.status = 'partial';
            else oldBill.status = 'pending';

            // 6. UPDATE SCRAP TRANSACTION
            const oldScrapRef = oldBill.scrapRef;
            
            if (newScrapWt > 0 && newScrapPrice > 0) {
                if (oldScrapRef) {
                    await ScrapBattery.findByIdAndUpdate(oldScrapRef, {
                        customerName: `${oldBill.customerName} (Bill Adj)`,
                        weight: newScrapWt,
                        pricePerKg: newScrapPrice,
                        totalAmount: newScrap
                    }, { session });
                } else {
                    const newScrapTx = await ScrapBattery.create([{
                        type: 'buy',
                        customerName: `${oldBill.customerName} (Bill Adj)`,
                        weight: newScrapWt,
                        pricePerKg: newScrapPrice,
                        totalAmount: newScrap
                    }], { session });
                    oldBill.scrapRef = newScrapTx[0]._id as any;
                }
            } else {
                if (oldScrapRef) {
                    await ScrapBattery.findByIdAndDelete(oldScrapRef).session(session);
                    oldBill.scrapRef = undefined;
                }
            }

            updatedBill = await oldBill.save({ session });
        });

        res.json(updatedBill);

    } catch (error: any) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Bill update failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Cancel a Bill
export const cancelBill = asyncHandler(async (req: Request, res: Response) => {
    const billId = req.params.id;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    try {
        let cancelledBill: any;

        await session.withTransaction(async () => {
            const bill = await Billing.findById(billId).session(session);
            if (!bill) { throw new Error('Bill not found'); }
            if (bill.status === 'cancelled') { throw new Error('Bill is already cancelled'); }

            for (const item of bill.items) {
                      await restoreBillItemStockFromAllocations(
                          item,
                          session,
                          `Bill Cancelled #${(bill as any)._id.toString().slice(-6)}`
                      );
            }

            if (bill.customerRef) {
                const customer = await Customer.findById(bill.customerRef).session(session);
                if (customer) {
                    const debtToRemove = bill.balance || 0;
                    if (debtToRemove > 0) {
                        customer.currentBalance -= debtToRemove;
                        await customer.save({ session });

                        await CustomerTransaction.create([{
                            customer: bill.customerRef,
                            user: userId,
                            type: 'Payment', 
                            description: `Cancelled Bill #${(bill as any)._id.toString().slice(-6)}`,
                            debit: 0,
                            credit: debtToRemove, 
                            balance: customer.currentBalance,
                            billRef: bill._id
                        }], { session });
                    }
                }
            }

            bill.status = 'cancelled';
            bill.balance = 0; 

            if (bill.scrapRef) {
                await ScrapBattery.findByIdAndDelete(bill.scrapRef).session(session);
                bill.scrapRef = undefined;
            }
            
            cancelledBill = await bill.save({ session });
        });

        res.json({ message: 'Bill cancelled and stock reverted', bill: cancelledBill });

    } catch (error: any) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Cancellation failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Add Payment
export const addBillPayment = asyncHandler(async (req: Request, res: Response) => {
    const { amount } = req.body;
    const billId = req.params.id;
    // @ts-ignore
    const userId = req.user._id;

    if (!amount || amount <= 0) { res.status(400); throw new Error("Invalid payment amount"); }

    const session = await mongoose.startSession();
    try {
        let updatedBill: any;

        await session.withTransaction(async () => {
            const bill = await Billing.findById(billId).session(session);
            if (!bill) throw new Error("Bill not found");

            bill.paidAmount = (bill.paidAmount || 0) + amount;
            bill.balance = (bill.balance || 0) - amount;
            bill.paymentHistory.push({ amount, date: new Date(), note: 'Installment Payment' });
            bill.status = bill.balance <= 0 ? 'paid' : 'partial';

            await bill.save({ session });

            if (bill.customerRef) {
                const customer = await Customer.findByIdAndUpdate(
                    bill.customerRef,
                    { $inc: { currentBalance: -amount } }, 
                    { new: true, session }
                );

                if (customer) {
                    await CustomerTransaction.create([{
                        customer: bill.customerRef,
                        user: userId,
                        type: 'Payment',
                        description: `Payment for Bill #${(bill as any)._id.toString().slice(-6)}`,
                        debit: 0,
                        credit: amount,
                        balance: customer.currentBalance,
                        billRef: bill._id 
                    }], { session });
                }
            }
            updatedBill = bill;
        });

        res.json(updatedBill);

    } catch (error: any) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Payment failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Get all bills
export const getBills = asyncHandler(async (req: Request, res: Response) => {
    const bills = await Billing.find({}).sort({ createdAt: -1 });
    res.json(bills);
});

// @desc    Get Bill PDF
export const getBillPdf = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const billId = req.params.id;

    const bill = await Billing.findById(billId).populate('items.productRef').lean();
    if (!bill) { res.status(404); throw new Error("Bill not found"); }
    
    let prevBalance = 0;
    if (bill.customerRef) {
        const customer = await Customer.findById(bill.customerRef);
        if (customer) prevBalance = (customer.currentBalance || 0) - (bill.balance || 0);
    }
    // @ts-ignore
    bill.customerBalance = prevBalance; 

    // @ts-ignore
    generateBillPDF(res, bill);
});

// @desc    Mark as Paid (Legacy)
export const markAsPaid = asyncHandler(async (req: Request, res: Response) => {
    const bill = await Billing.findById(req.params.id);
    if(bill) {
        bill.status = 'paid';
        bill.paidAmount = bill.amount;
        bill.balance = 0;
        await bill.save();
        res.json(bill);
    } else {
        res.status(404); throw new Error("Bill not found");
    }
});

// @desc    Mark as Unpaid (Legacy)
export const markAsUnpaid = asyncHandler(async (req: Request, res: Response) => {
    const bill = await Billing.findById(req.params.id);
    if(bill) {
        bill.status = 'pending';
        bill.paidAmount = 0;
        bill.balance = bill.amount;
        bill.paymentHistory = []; 
        await bill.save();
        res.json(bill);
    } else {
        res.status(404); throw new Error("Bill not found");
    }
});

// @desc    Get Reminders
export const getPaymentReminders = asyncHandler(async (req: Request, res: Response) => {
    const reminders = await Billing.find({
        status: { $in: ['partial', 'pending'] },
        balance: { $gt: 0 }
    })
    .select('customerName amount paidAmount balance dueDate status createdAt items customerPhone') 
    .sort({ dueDate: 1 }) 
    .lean();

    const today = new Date();
    const processed = reminders.map((r: any) => ({
        ...r,
        isOverdue: r.dueDate ? new Date(r.dueDate) < today : false,
        daysOverdue: r.dueDate ? Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / (1000 * 3600 * 24)) : 0
    }));

    res.status(200).json(processed);
});

// @desc    Send Bill via WhatsApp (Retail Sale Receipt)
// @route   POST /api/billing/:id/send-whatsapp
// @access  Private
export const sendBillWhatsApp = asyncHandler(async (req: Request, res: Response) => {
    const bill = await Billing.findById(req.params.id);
    if (!bill) { res.status(404); throw new Error('Bill not found'); }

    const phone = bill.customerPhone;
    if (!phone) {
        res.status(400); 
        throw new Error('Customer phone number not found on this bill'); 
    }

    try {
        const baseUrl = process.env.BASE_URL || 'https://your-app.vercel.app';
        const pdfUrl = `${baseUrl}/api/bills/${(bill as any)._id}/pdf`;
        const billId = String((bill as any)._id).slice(-6);

        const sent = await sendDocumentWhatsApp(
            phone,
            pdfUrl,
            bill.customerName || 'Customer',
            'Bill',
            `Bill_${billId}.pdf`
        );

        if (sent) {
            res.status(200).json({ message: 'Bill sent via WhatsApp successfully!' });
        } else {
            res.status(500).json({ message: 'Failed to send WhatsApp message' });
        }
    } catch (err: any) {
        console.error('WhatsApp Bill Error:', err);
        res.status(500).json({ message: err.message || 'Failed to send WhatsApp' });
    }
});