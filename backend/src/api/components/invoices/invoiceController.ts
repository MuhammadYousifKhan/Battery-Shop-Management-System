import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Invoice from '../../models/Invoice'; 
import Product from '../../models/Product';
import Supplier from '../../models/Supplier'; 
import SupplierTransaction from '../../models/SupplierTransaction'; 
import mongoose, { Types } from 'mongoose';
import { addStock } from '../../utils/stockService'; 
import { generateSupplierInvoicePDF } from '../../utils/pdfGenerator'; 

// @desc    Create Invoice (Handles Draft vs Active)
export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { supplierRef, items, totalAmount, status, invoiceNumber } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    try {
        let resultInvoice;

        await session.withTransaction(async () => {
            const invoiceStatus = status || 'pending';

            const invoice = new Invoice({
                supplier: supplierRef,
                items: items, 
                totalAmount,
                invoiceNumber, 
                status: invoiceStatus
            });
            const createdInvoice = await invoice.save({ session });

            if (invoiceStatus !== 'draft') {
                for (const item of items) {
                    if (!item.productRef || !item.quantity) throw new Error('Product details required.');
                    
                    await addStock(
                        item.productRef,
                        Number(item.quantity),
                        Number(item.price), 
                        session,
                        createdInvoice._id as Types.ObjectId,
                        'Purchase'
                    );
                }

                const supplier = await Supplier.findByIdAndUpdate(
                    supplierRef,
                    { $inc: { currentBalance: totalAmount } },
                    { new: true, session }
                );

                if (supplier) {
                    await SupplierTransaction.create([{
                        supplier: supplierRef,
                        user: userId,
                        type: 'Invoice',
                        description: `Purchase Invoice #${createdInvoice.invoiceNumber}`,
                        debit: 0,
                        credit: totalAmount, 
                        balance: supplier.currentBalance,
                        invoiceRef: createdInvoice._id
                    }], { session });
                }
            }
            resultInvoice = createdInvoice;
        });
        
        if (!resultInvoice) {
            res.status(500);
            throw new Error('Invoice creation failed');
        }
        const populatedInvoice = await Invoice.findById((resultInvoice as any)._id).populate('supplier', 'name');
        res.status(201).json(populatedInvoice);

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Transaction failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// @desc    Complete/Post Invoice (Draft -> Pending)
export const completeInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    try {
        let updatedInvoice;

        await session.withTransaction(async () => {
            const invoice = await Invoice.findById(id).session(session);
            if (!invoice) throw new Error('Invoice not found');
            if (invoice.status !== 'draft') throw new Error('Invoice is already completed/posted.');

            for (const item of invoice.items) {
                await addStock(
                    item.productRef,
                    Number(item.quantity),
                    Number(item.price), 
                    session,
                    invoice._id as Types.ObjectId,
                    'Purchase'
                );
            }

            const supplier = await Supplier.findByIdAndUpdate(
                invoice.supplier,
                { $inc: { currentBalance: invoice.totalAmount } },
                { new: true, session }
            );

            if (supplier) {
                await SupplierTransaction.create([{
                    supplier: invoice.supplier,
                    user: userId,
                    type: 'Invoice',
                    description: `Purchase Invoice #${invoice.invoiceNumber}`,
                    debit: 0,
                    credit: invoice.totalAmount, 
                    balance: supplier.currentBalance,
                    invoiceRef: invoice._id
                }], { session });
            }

            invoice.status = 'pending';
            updatedInvoice = await invoice.save({ session });
        });

        res.json({ message: "Invoice Completed.", invoice: updatedInvoice });

    } catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Completion failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Cancel Invoice (Reverts Stock & Ledger)
export const cancelInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    try {
        let cancelledInvoice;

        await session.withTransaction(async () => {
            const invoice = await Invoice.findById(id).session(session);
            if (!invoice) throw new Error('Invoice not found');
            if (invoice.status === 'cancelled') throw new Error('Invoice is already cancelled');

            if (invoice.status === 'draft') {
                invoice.status = 'cancelled';
                cancelledInvoice = await invoice.save({ session });
                return;
            }

            // Revert Stock
            for (const item of invoice.items) {
                const product = await Product.findById(item.productRef).session(session);
                if (product) {
                    const batchIndex = product.batches.findIndex(b => 
                        b.supplierInvoiceRef && b.supplierInvoiceRef.toString() === id
                    );
                    if (batchIndex > -1) {
                        product.stock -= product.batches[batchIndex].quantity;
                        product.batches.splice(batchIndex, 1);
                        await product.save({ session });
                    }
                }
            }

            // Revert Ledger
            const supplier = await Supplier.findById(invoice.supplier).session(session);
            if (supplier) {
                supplier.currentBalance -= invoice.totalAmount;
                await supplier.save({ session });

                await SupplierTransaction.create([{
                    supplier: invoice.supplier,
                    user: userId,
                    type: 'Return', 
                    description: `Cancelled Invoice #${invoice.invoiceNumber}`,
                    debit: invoice.totalAmount, 
                    credit: 0, 
                    balance: supplier.currentBalance,
                    invoiceRef: invoice._id
                }], { session });
            }

            invoice.status = 'cancelled';
            cancelledInvoice = await invoice.save({ session });
        });

        res.json({ message: "Invoice cancelled. Stock and Ledger reverted.", invoice: cancelledInvoice });

    } catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Cancellation failed" });
    } finally {
        session.endSession();
    }
});

// @desc    Update Invoice (Fixed Logic: Preserves Sold Stock)
export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { items: newItems, totalAmount, status, supplierRef } = req.body;

    const session = await mongoose.startSession();
    try {
        let resultInvoice;

        await session.withTransaction(async () => {
            const oldInvoice = await Invoice.findById(id).session(session);
            if (!oldInvoice) throw new Error('Invoice not found');

            // A: Edit Draft
            if (oldInvoice.status === 'draft') {
                oldInvoice.items = newItems;
                oldInvoice.totalAmount = parseFloat(totalAmount);
                if (supplierRef) oldInvoice.supplier = supplierRef;
                if (status && status !== 'draft') throw new Error("Use 'Complete' to finalize.");
                resultInvoice = await oldInvoice.save({ session });
                return;
            }

            // B: Edit Completed Invoice
            const oldTotal = oldInvoice.totalAmount || 0;
            const newTotal = parseFloat(totalAmount);
            const oldSupplierId = oldInvoice.supplier;
            const newSupplierId = supplierRef || oldSupplierId;
            const isSupplierChanged = supplierRef && (String(supplierRef) !== String(oldSupplierId));

            let itemsToProcess = [...newItems];

            // 1. Process Old Items
            for (const oldItem of oldInvoice.items) {
                const product = await Product.findById(oldItem.productRef).session(session);
                if (!product) continue;

                const batchIndex = product.batches.findIndex(b => 
                    b.supplierInvoiceRef && b.supplierInvoiceRef.toString() === id
                );

                // Find matching item in new invoice
                const newItemIndex = itemsToProcess.findIndex(ni => 
                    String(ni.productRef) === String(oldItem.productRef)
                );

                if (batchIndex > -1) {
                    // Batch exists
                    const currentBatch = product.batches[batchIndex];
                    const remainingQty = currentBatch.quantity;
                    const originalQty = oldItem.quantity;
                    const soldQty = originalQty - remainingQty;

                    if (newItemIndex > -1) {
                        // Update
                        const newItem = itemsToProcess[newItemIndex];
                        const newInvoiceQty = parseInt(newItem.quantity);
                        
                        if (newInvoiceQty < soldQty) {
                            throw new Error(`Cannot set quantity to ${newInvoiceQty} for ${product.name}. ${soldQty} already sold.`);
                        }

                        const newBatchQty = newInvoiceQty - soldQty;
                        const qtyDifference = newBatchQty - remainingQty;

                        currentBatch.quantity = newBatchQty;
                        currentBatch.costPrice = parseFloat(newItem.price);
                        
                        product.stock += qtyDifference;
                        itemsToProcess.splice(newItemIndex, 1);
                    } else {
                        // Remove
                        product.stock -= remainingQty;
                        product.batches.splice(batchIndex, 1);
                    }
                } else {
                    // Batch missing (Fully Sold)
                    const soldQty = oldItem.quantity;

                    if (newItemIndex > -1) {
                        const newItem = itemsToProcess[newItemIndex];
                        const newInvoiceQty = parseInt(newItem.quantity);

                        if (newInvoiceQty < soldQty) {
                            throw new Error(`Cannot reduce quantity. ${soldQty} units from previous invoice are fully sold.`);
                        }

                        const extraStock = newInvoiceQty - soldQty;
                        if (extraStock > 0) {
                            await addStock(
                                newItem.productRef,
                                extraStock,
                                parseFloat(newItem.price),
                                session,
                                oldInvoice._id as Types.ObjectId,
                                'Purchase (Edited - Restock)'
                            );
                        }
                        itemsToProcess.splice(newItemIndex, 1);
                    }
                }
                product.markModified('batches');
                await product.save({ session });
            }

            // 2. Add New Items
            for (const newItem of itemsToProcess) {
                await addStock(
                    newItem.productRef,
                    parseInt(newItem.quantity),
                    parseFloat(newItem.price), 
                    session,
                    oldInvoice._id as Types.ObjectId,
                    'Purchase (Edited - New Item)'
                );
            }

            // 3. Fix Ledger
            const transaction = await SupplierTransaction.findOne({ invoiceRef: oldInvoice._id }).session(session);

            if (isSupplierChanged) {
                await Supplier.findByIdAndUpdate(oldSupplierId, 
                    { $inc: { currentBalance: -oldTotal } }, { session }
                );
                const newSupplier = await Supplier.findByIdAndUpdate(newSupplierId, 
                    { $inc: { currentBalance: newTotal } }, { new: true, session }
                );
                if (transaction) {
                    transaction.supplier = newSupplierId;
                    transaction.credit = newTotal;
                    transaction.balance = newSupplier ? newSupplier.currentBalance : newTotal;
                    transaction.description = `Purchase Invoice #${oldInvoice.invoiceNumber} (Moved)`;
                    await transaction.save({ session });
                }
            } else {
                const diff = newTotal - oldTotal;
                if (diff !== 0) {
                    const supplier = await Supplier.findByIdAndUpdate(oldSupplierId,
                        { $inc: { currentBalance: diff } }, { new: true, session }
                    );
                    if (transaction && supplier) {
                        transaction.credit = newTotal; 
                        transaction.balance = supplier.currentBalance; 
                        transaction.description = `Purchase Invoice #${oldInvoice.invoiceNumber} (Edited)`;
                        await transaction.save({ session });
                    }
                }
            }

            oldInvoice.items = newItems;
            oldInvoice.totalAmount = newTotal;
            if (status) oldInvoice.status = status;
            if (supplierRef) oldInvoice.supplier = supplierRef;
            
            resultInvoice = await oldInvoice.save({ session });
        });

        if (!resultInvoice) {
            res.status(500);
            throw new Error('Invoice update failed');
        }
        const populated = await Invoice.findById((resultInvoice as any)._id).populate('supplier', 'name');
        res.json(populated);

    } catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Update failed" });
    } finally {
        session.endSession();
    }
});

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
    const list = await Invoice.find({}).populate('supplier', 'name').sort({ createdAt: -1 });
    res.json(list);
});

export const getInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
    const invoiceId = req.params.id;
    const invoice = await Invoice.findById(invoiceId).populate('supplier', 'name').lean();
    if (!invoice) { res.status(404); throw new Error("Invoice not found"); }
    // @ts-ignore
    generateSupplierInvoicePDF(res, invoice);
});

export const updateInvoiceToPaid = asyncHandler(async (req: Request, res: Response) => {
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status: "paid" }, { new: true }).populate('supplier', 'name');
    if (invoice) res.json(invoice);
    else { res.status(404); throw new Error('Invoice not found'); }
});