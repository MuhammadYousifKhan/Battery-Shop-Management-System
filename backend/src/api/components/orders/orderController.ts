import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Order from '../../models/Order';
import Customer from '../../models/Customer';
import Product from '../../models/Product'; 
import CustomerTransaction from '../../models/CustomerTransaction';
import mongoose from 'mongoose';
import { removeStockDetailed, addStock } from '../../utils/stockService'; 
import { generateOrderPDF, generateOrderPDFBuffer } from '../../utils/epsonPdfGenerator';
import { sendDocumentWhatsApp } from '../../utils/whatsappService';

const normalizeOrderItem = (item: any, context: string) => {
    if (!item?.productRef) {
        throw new Error(`${context}: Product reference is required.`);
    }

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`${context}: Quantity must be greater than 0.`);
    }

    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0) {
        throw new Error(`${context}: Price must be a valid non-negative number.`);
    }

    return {
        ...item,
        quantity,
        price,
    };
};

const normalizeTotalAmount = (value: any, context: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${context}: Total amount must be a valid non-negative number.`);
    }
    return parsed;
};

const normalizeOptionalCreatedAt = (value: any, context: string): Date | undefined => {
    if (!value) return undefined;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${context}: Invalid date provided.`);
    }

    // Date pickers send midnight; preserve current time to keep day grouping predictable.
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

const restoreItemStockFromAllocations = async (
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

    const storedQty = Number(item.quantity);
    if (!Number.isFinite(storedQty) || storedQty <= 0) {
        throw new Error(`Stored quantity is invalid for product ${item.productName}`);
    }

    let costToRestore = item.cost;
    if (costToRestore === undefined || costToRestore === null || !Number.isFinite(Number(costToRestore))) {
        const product = await Product.findById(item.productRef).session(session);
        costToRestore = product ? (product.averageCost || 0) : 0;
    }

    await addStock(
        item.productRef as mongoose.Types.ObjectId,
        storedQty,
        Number(costToRestore),
        session,
        undefined,
        sourceLabel,
        new Date(0)
    );
};

// --- GET ALL ORDERS ---
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = await Order.find({}).sort({ createdAt: -1 });
  res.json(orders);
});

// --- GET SINGLE ORDER ---
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
    const order = await Order.findById(req.params.id);
    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// --- CREATE ORDER ---
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
    const { customerRef, items, totalAmount, productType, nic, address, createdAt } = req.body;
    
    // Safety Check
    if (!items || items.length === 0) { res.status(400); throw new Error('No items in order'); }

    const session = await mongoose.startSession();
    try {
        let resultOrder;
        const normalizedTotalAmount = normalizeTotalAmount(totalAmount, 'Create order');
        const normalizedCreatedAt = normalizeOptionalCreatedAt(createdAt, 'Create order');

        await session.withTransaction(async () => {
            let orderTotalCost = 0;
            const enrichedItems = []; 

            for (const rawItem of items) {
                const item = normalizeOrderItem(rawItem, 'Create order');

                // FIFO Stock Removal
                const removal = await removeStockDetailed(item.productRef, item.quantity, session);
                const unitCost = removal.totalCost / item.quantity;
                
                orderTotalCost += removal.totalCost;

                const product = await Product.findById(item.productRef).session(session);
                if (!product) { throw new Error(`Product not found: ${item.productName}`); }

                enrichedItems.push({
                    ...item,
                    cost: unitCost,
                    batchCostAllocations: removal.allocations,
                    sku: product.sku 
                });
            }
            
            const customer = await Customer.findById(customerRef).session(session);
            if(!customer) throw new Error("Customer not found");

            const order = new Order({
                customerRef,
                customerName: customer.name,
                items: enrichedItems, 
                totalAmount: normalizedTotalAmount,
                totalCost: orderTotalCost,
                productType,
                nic, address,
                ...(normalizedCreatedAt ? { createdAt: normalizedCreatedAt } : {}),
                status: 'processing'
            });

            resultOrder = await order.save({ session });
        });
        
        res.status(201).json(resultOrder);
    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Order creation failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// --- UPDATE ORDER (FIXED) ---
export const updateOrder = asyncHandler(async (req: Request, res: Response) => {
    const { items, totalAmount, nic, createdAt } = req.body;

    // 🛑 CRITICAL FIX: Prevent stock corruption if items are missing
    if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400);
        throw new Error("Update failed: Item list is missing. This would cause incorrect stock refund.");
    }

    const session = await mongoose.startSession();
    try {
        let resultOrder;
        const normalizedTotalAmount = normalizeTotalAmount(totalAmount, 'Update order');

        await session.withTransaction(async () => {
            const order = await Order.findById(req.params.id).session(session);
            if (!order) { throw new Error('Order not found'); }
            if (order.status === 'cancelled') { throw new Error('Cannot edit a cancelled order'); }

            const oldTotalAmount = order.totalAmount || 0;

            // 1. Revert Old Stock (Add back temporarily)
            for (const item of order.items) {
                 await restoreItemStockFromAllocations(
                    item,
                    session,
                    `Order Edit #${order._id.toString().slice(-6).toUpperCase()}`
                 );
            }

            // 2. Deduct New Stock (Remove correct items)
            const enrichedItems = [];
            let orderTotalCost = 0;

            for (const rawItem of items) {
                const item = normalizeOrderItem(rawItem, 'Update order');

                const removal = await removeStockDetailed(item.productRef, item.quantity, session);
                const unitCost = removal.totalCost / item.quantity;
                orderTotalCost += removal.totalCost;

                const product = await Product.findById(item.productRef).session(session);
                if (!product) throw new Error(`Product not found: ${item.productName}`);

                enrichedItems.push({
                    ...item,
                    cost: unitCost,
                    batchCostAllocations: removal.allocations,
                    sku: product.sku,
                });
            }

            // 3. Update Order
            order.items = enrichedItems;
            order.totalAmount = normalizedTotalAmount;
            (order as any).totalCost = orderTotalCost;
            order.nic = nic || order.nic;
            
            const normalizedCreatedAt = normalizeOptionalCreatedAt(createdAt, 'Update order');
            if (normalizedCreatedAt) order.createdAt = normalizedCreatedAt;

            // 4. Update Ledger if Completed
            if (order.status === 'completed') {
                const newTotal = normalizedTotalAmount;
                const amountDifference = newTotal - oldTotalAmount;
                const ledgerUpdate: any = {};

                if (normalizedCreatedAt) {
                    ledgerUpdate.transactionDate = order.createdAt;
                }

                if (amountDifference !== 0) {
                    const customer = await Customer.findById(order.customerRef).session(session);
                    if (customer) {
                        customer.currentBalance += amountDifference;
                        await customer.save({ session });

                        ledgerUpdate.$inc = { debit: amountDifference, balance: amountDifference };
                    }
                }

                if (Object.keys(ledgerUpdate).length > 0) {
                    await CustomerTransaction.findOneAndUpdate(
                        { orderRef: order._id },
                        ledgerUpdate,
                        { session }
                    );
                }
            }

            resultOrder = await order.save({ session });
        });

        res.json(resultOrder);

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Update failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// --- COMPLETE ORDER ---
export const completeOrder = asyncHandler(async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    try {
        let resultOrder;

        await session.withTransaction(async () => {
            const order = await Order.findById(req.params.id).session(session);
            if (!order) { throw new Error('Order not found'); }
            if (order.status === 'completed') { throw new Error('Order is already completed'); }

            const customer = await Customer.findById(order.customerRef).session(session);
            if (!customer) throw new Error('Customer not found');

            const newBalance = (customer.currentBalance || 0) + order.totalAmount;
            customer.currentBalance = newBalance;
            await customer.save({ session });

            await CustomerTransaction.create([{
                customer: customer._id,
                // @ts-ignore
                user: req.user?._id, 
                type: 'Invoice',
                orderRef: order._id, 
                description: `Order Inv #${order._id.toString().slice(-6)}`,
                debit: order.totalAmount, 
                credit: 0,
                balance: newBalance, 
                transactionDate: order.createdAt || new Date()
            }], { session });

            order.status = 'completed';
            resultOrder = await order.save({ session });
        });

        res.json(resultOrder);

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Completion failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// --- CANCEL ORDER ---
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    try {
        let resultOrder;

        await session.withTransaction(async () => {
            const order = await Order.findById(req.params.id).session(session);
            if (!order) { throw new Error('Order not found'); }
            if (order.status === 'cancelled') { throw new Error('Order is already cancelled'); }

            // 1. Revert Stock
            for (const item of order.items) {
                 await restoreItemStockFromAllocations(
                    item,
                    session,
                    `Cancelled Order #${order._id.toString().slice(-6).toUpperCase()}`
                 );
            }

            // 2. Revert Ledger
            if (order.status === 'completed') {
                const customer = await Customer.findById(order.customerRef).session(session);
                if (customer) {
                    customer.currentBalance -= order.totalAmount;
                    await customer.save({ session });

                    await CustomerTransaction.create([{
                        customer: customer._id,
                        // @ts-ignore
                        user: req.user?._id,
                        type: 'Return', 
                        orderRef: order._id,
                        description: `Cancelled Order #${order._id.toString().slice(-6)}`,
                        debit: 0,
                        credit: order.totalAmount, 
                        balance: customer.currentBalance,
                        transactionDate: new Date() 
                    }], { session });
                }
            }

            order.status = 'cancelled';
            resultOrder = await order.save({ session });
        });

        res.json({ message: 'Order cancelled and stock reverted.', order: resultOrder });

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Cancellation failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// --- READ ONLY ROUTES ---
export const getOrderPdf = asyncHandler(async (req: Request, res: Response) => {
    const order = await Order.findById(req.params.id).populate('customerRef', 'phone').lean();
    if (!order) { res.status(404); throw new Error('Order not found'); }
    // Attach customer phone for PDF
    // @ts-ignore
    if (order.customerRef?.phone) order.customerPhone = order.customerRef.phone;
    // @ts-ignore
    generateOrderPDF(res, order);
});

export const sendGatePassWhatsApp = asyncHandler(async (req: Request, res: Response) => {
    const order = await Order.findById(req.params.id);
    if (!order) { res.status(404); throw new Error('Order not found'); }

    const customer = await Customer.findById(order.customerRef);
    if (!customer || !customer.phone) { res.status(400); throw new Error('Customer phone not found'); }

    // Use the PDF URL approach — send the Order PDF as a "Gate Pass" document
    const baseUrl = process.env.BASE_URL || 'https://your-app.vercel.app';
    const pdfUrl = `${baseUrl}/api/orders/${order._id}/pdf`;
    const orderId = (order as any).orderId || order._id.toString().slice(-6);

    const sent = await sendDocumentWhatsApp(
        customer.phone,
        pdfUrl,
        order.customerName,
        'Gate Pass',
        `GatePass_${orderId}.pdf`
    );

    if (sent) res.json({ message: "Gate pass sent successfully" });
    else { res.status(500); throw new Error("Failed to send WhatsApp"); }
});

export const sendBillWhatsApp = asyncHandler(async (req: Request, res: Response) => {
    const order = await Order.findById(req.params.id);
    if (!order) { res.status(404); throw new Error('Order not found'); }

    const customer = await Customer.findById(order.customerRef);
    if (!customer || !customer.phone) { res.status(400); throw new Error('Customer phone not found'); }

    try {
        const baseUrl = process.env.BASE_URL || 'https://your-app.vercel.app';
        const pdfUrl = `${baseUrl}/api/orders/${order._id}/pdf`;
        const orderId = (order as any).orderId || order._id.toString().slice(-6);

        const sent = await sendDocumentWhatsApp(
            customer.phone,
            pdfUrl,
            order.customerName,
            'Invoice',
            `Invoice_${orderId}.pdf`
        );

        if (sent) res.json({ message: "Bill sent successfully via WhatsApp!" });
        else throw new Error("WAB2C API returned error");

    } catch (e: any) {
        console.error(e);
        res.status(500).json({ message: "Failed to send WhatsApp message", error: e.message });
    }
});