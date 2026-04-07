import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Product from '../../models/Product';
import Invoice from '../../models/Invoice';
import Billing from '../../models/Billing';
import Order from '../../models/Order';
import Claim from '../../models/Claim';
import { addStock, removeStock } from '../../utils/stockService';
import { generateInventorySnapshotPDF } from '../../utils/pdfGenerator';

// @desc    Get all products
// @route   GET /api/products
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
    const products = await Product.find({}).sort({ createdAt: -1 });
    res.json(products);
});

// @desc    Get single product
// @route   GET /api/products/:id
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.id);
    if (product) {
        res.json(product);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Create a product
// @route   POST /api/products
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
    const { sku, name, category, price, supplier, unit, averageCost } = req.body;

    const productExists = await Product.findOne({ sku });
    if (productExists) {
        res.status(400);
        throw new Error('Product with this SKU already exists');
    }

    const product = new Product({
        sku,
        name,
        category,
        price,
        supplier,
        unit: unit || 'pcs',
        averageCost: averageCost || 0,
        stock: 0,
        totalStock: 0,
        batches: []
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
});

// @desc    Update a product
// @route   PUT /api/products/:id
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const { name, price, category, supplier, unit, sku } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
        product.name = name || product.name;
        product.price = price !== undefined ? price : product.price;
        product.category = category || product.category;
        product.supplier = supplier || product.supplier;
        product.unit = unit || product.unit;
        product.sku = sku || product.sku;

        const updatedProduct = await product.save();
        res.json(updatedProduct);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        await product.deleteOne();
        res.json({ message: 'Product removed' });
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Generate Inventory Snapshot PDF
// @route   GET /api/products/snapshot/pdf
export const getProductSnapshotPdf = asyncHandler(async (req: Request, res: Response) => {
    const products = await Product.find({})
        .sort({ category: 1, name: 1 })
        .lean(); 

    if (!products || products.length === 0) {
        res.status(404);
        throw new Error('No products found to print');
    }

    // @ts-ignore
    generateInventorySnapshotPDF(res, products);
});

// @desc    Manually Adjust Stock (Add/Remove)
// @route   POST /api/products/adjust
export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
    const { productId, type, quantity, reason, costPrice } = req.body;

    if (!productId || !type || !quantity) {
        res.status(400); throw new Error('Product ID, Type, and Quantity are required');
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            if (type === 'add') {
                await addStock(
                    productId, 
                    Number(quantity), 
                    Number(costPrice || 0), 
                    session, 
                    undefined, 
                    `Manual Adjustment: ${reason}`
                );
            } else if (type === 'remove') {
                await removeStock(
                    productId, 
                    Number(quantity), 
                    session
                );
            } else {
                throw new Error("Invalid adjustment type. Use 'add' or 'remove'.");
            }
        });

        res.status(200).json({ message: "Stock adjusted successfully" });

    } catch (error) {
        const msg = error instanceof Error ? error.message : "Adjustment failed";
        res.status(500).json({ message: msg });
    } finally {
        session.endSession();
    }
});

// @desc    Auto-Fix Ghost Stock (Smart Recalculation)
// @route   POST /api/products/recalculate
export const recalculateStock = asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.body; 
    
    // If productId is provided, calculate only that one. Otherwise, fix all.
    const query = productId ? { _id: productId } : {};
    const products = await Product.find(query);

    const report = [];

    for (const product of products) {
        const pId = product._id;

        // 1. INPUT: Total Purchased (From Invoices)
        // We strictly look at pending/paid invoices to get the verified purchase history.
        const invoices = await Invoice.find({ 
            status: { $in: ['pending', 'paid'] }, 
            'items.productRef': pId 
        }).sort({ createdAt: -1 });

        let totalIn = 0;
        invoices.forEach(inv => {
            inv.items.forEach(item => {
                if (String(item.productRef) === String(pId)) {
                    totalIn += item.quantity;
                }
            });
        });

        // 2. INPUT: Manual Adjustments & Returns (Preserve these!)
        // We look at existing batches but EXCLUDE known System/Ghost sources
        let manualAdds = 0;
        if (product.batches) {
            product.batches.forEach(batch => {
                const src = (batch.source || '').toLowerCase();
                
                // 🛑 STRICT FILTER: Exclude anything that looks like a System Batch or a Ghost Batch
                // 'purchase' -> Counted in Step 1 (Invoices)
                // 'order edit' -> The Bug (Ghost Stock)
                // 'invoice' / 'system' -> General system operations
                const isSystemBatch = 
                    src === 'purchase' || 
                    src.includes('purchase') || 
                    src.includes('invoice') || 
                    src.includes('order edit') || 
                    src.includes('system auto-fix');

                // Whatever remains is a true manual entry (e.g. "Found Extra", "Return")
                if (!isSystemBatch) {
                    manualAdds += batch.quantity;
                }
            });
        }
        
        // Total Valid Inputs
        const totalInputs = totalIn + manualAdds;

        // 3. OUTPUT: Retail Sales
        const bills = await Billing.find({ 
            status: { $ne: 'cancelled' }, 
            'items.productRef': pId 
        });
        let totalSoldRetail = 0;
        bills.forEach(bill => {
            bill.items.forEach(item => {
                if (String(item.productRef) === String(pId)) {
                    totalSoldRetail += item.quantity;
                }
            });
        });

        // 4. OUTPUT: Wholesale Orders
        const orders = await Order.find({ 
            status: { $in: ['completed', 'processing'] }, 
            'items.productRef': pId 
        });
        let totalSoldWholesale = 0;
        orders.forEach(order => {
            order.items.forEach(item => {
                if (String(item.productRef) === String(pId)) {
                    totalSoldWholesale += item.quantity;
                }
            });
        });

        // 5. OUTPUT: Claims (Replacements)
        const claims = await Claim.find({ 
            'replacementItem.productRef': pId,
            status: 'resolved'
        });
        const totalClaims = claims.length;

        // --- FINAL CALCULATION ---
        const calculatedStock = totalInputs - totalSoldRetail - totalSoldWholesale - totalClaims;
        const finalStock = calculatedStock > 0 ? calculatedStock : 0;

        // 6. REBUILD BATCHES (Clean Slate)
        // We delete corrupted batches and create new clean ones based on priority.
        const newBatches: any[] = [];
        let remainingStockToFill = finalStock;

        // A. Fill from Invoices (Newest First - FIFO Pricing)
        for (const inv of invoices) {
            if (remainingStockToFill <= 0) break;
            const item = inv.items.find(i => String(i.productRef) === String(pId));
            if (item) {
                const qtyToTake = Math.min(item.quantity, remainingStockToFill);
                newBatches.push({
                    quantity: qtyToTake,
                    costPrice: item.price,
                    receivedDate: inv.createdAt,
                    supplierInvoiceRef: inv._id,
                    source: 'Purchase'
                });
                remainingStockToFill -= qtyToTake;
            }
        }

        // B. If stock remains (from Manual Adds/Returns), create a consolidated batch
        if (remainingStockToFill > 0) {
            newBatches.push({
                quantity: remainingStockToFill,
                costPrice: product.averageCost || 0, // Fallback to current avg
                receivedDate: new Date(),
                source: 'Consolidated Balance'
            });
        }

        // 7. SAVE CHANGES
        // We force save to ensure the "Ghost" batches are wiped out.
        if (product.stock !== finalStock || product.batches.length !== newBatches.length) {
            const oldStock = product.stock;
            product.stock = finalStock;
            product.totalStock = finalStock; // Sync virtual field
            product.batches = newBatches;
            await product.save();
            
            report.push({ 
                name: product.name, 
                old: oldStock, 
                new: finalStock, 
                details: `In(${totalIn}) + Man(${manualAdds}) - Out(${totalSoldRetail + totalSoldWholesale + totalClaims})` 
            });
        }
    }

    res.json({ 
        message: `Processed ${products.length} items. Corrected ${report.length} items.`, 
        changes: report 
    });
});

// @desc    Correct a single stock batch cost price
// @route   POST /api/products/batch-cost
export const correctBatchCost = asyncHandler(async (req: Request, res: Response) => {
    const { productId, batchId, costPrice, reason } = req.body;

    if (!productId || !batchId || costPrice === undefined || costPrice === null) {
        res.status(400);
        throw new Error('productId, batchId and costPrice are required');
    }

    const normalizedCost = Number(costPrice);
    if (!Number.isFinite(normalizedCost) || normalizedCost < 0) {
        res.status(400);
        throw new Error('Invalid costPrice. It must be a non-negative number.');
    }

    const product = await Product.findById(productId);
    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    const targetBatch = product.batches.find((b: any) => String(b._id) === String(batchId));
    if (!targetBatch) {
        res.status(404);
        throw new Error('Batch not found for this product');
    }

    const oldCost = Number(targetBatch.costPrice || 0);
    targetBatch.costPrice = normalizedCost;

    if (reason && String(reason).trim()) {
        const existingSource = targetBatch.source || 'Purchase';
        targetBatch.source = `${existingSource} | Cost corrected: ${String(reason).trim()}`;
    }

    product.markModified('batches');
    await product.save();

    res.status(200).json({
        message: 'Batch cost price corrected successfully',
        productId: product._id,
        batchId: targetBatch._id,
        oldCost,
        newCost: targetBatch.costPrice,
        source: targetBatch.source,
    });
});