import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose, { Types } from 'mongoose';
import Claim from '../../models/Claim'; 
import Product from '../../models/Product'; 
import Supplier from '../../models/Supplier';
import Customer from '../../models/Customer';
import CustomerTransaction from '../../models/CustomerTransaction'; 
import { removeStock, addStock } from '../../utils/stockService'; 
import { generateClaimLedgerPDF, generateClaimLedgerPDFBuffer } from '../../utils/pdfGenerator';
import { sendDocumentWhatsApp } from '../../utils/whatsappService';

const normalizePakistaniPhone = (phone: string | undefined): string | null => {
    if (!phone) return null;

    const digits = phone.replace(/\D/g, '');

    if (digits.startsWith('03') && digits.length === 11) {
        return `92${digits.slice(1)}`;
    }
    if (digits.startsWith('3') && digits.length === 10) {
        return `92${digits}`;
    }
    if (digits.startsWith('923') && digits.length === 12) {
        return digits;
    }

    return null;
};

// @desc    Get all claims
export const getClaims = asyncHandler(async (req: Request, res: Response) => {
    const { customerId, supplierId, type } = req.query;

    let filter: any = {};
    if (customerId) { filter.customerRef = customerId; }

    if (supplierId) {
        filter.supplierRef = supplierId;
    } else if (type === 'supplier') {
        filter.supplierRef = { $ne: null };
    }

    const claims = await Claim.find(filter)
        .populate('customerRef', 'name phone')
        .populate('userRef', 'username')
        .populate('supplierRef', 'name')
        .populate('items.productRef', 'sku name')
        .sort({ createdAt: -1 });
    res.json(claims);
});

// @desc    Create new claim
export const createClaim = asyncHandler(async (req: Request, res: Response) => {
    const { 
        customerRef, 
        newCustomer, 
        items, 
        claimDate, 
        status, 
        replacementItem, 
        description, 
        resolution,
        claimFee,
        claimFeeComment,
        claimFeePaid,
        resolutionType,
        deductionAmount,
        forceCreate 
    } = req.body;
    
    // @ts-ignore
    const userId = req.user._id;

    if ((!customerRef && !newCustomer) || !Array.isArray(items) || items.length === 0) {
        res.status(400); throw new Error('Customer and at least one item are required.');
    }

    // --- VALIDATE EXCHANGE DATA ---
    const effectiveResolutionType = resolutionType || 'exchange';
    if (status === 'resolved' && effectiveResolutionType === 'exchange') {
        if (!replacementItem || !replacementItem.productRef) {
            res.status(400); 
            throw new Error('Replacement product is required for exchange resolution.');
        }
    }

    // --- DUPLICATE CHECK ---
    const serialToCheck = items[0].serialNumber;
    const productToCheck = items[0].productRef;

    const existingClaims = await Claim.find({
        'items.serialNumber': serialToCheck,
        status: { $ne: 'rejected' } 
    });

    if (existingClaims.length > 0) {
        const exactMatch = existingClaims.find(c => 
            c.items.some(i => i.productRef.toString() === productToCheck)
        );

        if (exactMatch) {
            res.status(400);
            throw new Error(`Duplicate Claim: Serial Number (${serialToCheck}) already exists for this product model.`);
        }
    }

    const session = await mongoose.startSession();
    try {
        let resultClaim: any; // ✅ Explicitly typed as 'any' to fix TS18046

        await session.withTransaction(async () => {
            let finalCustomerId = customerRef;

            if (!finalCustomerId && newCustomer) {
                const { name, phone, address } = newCustomer;
                const normalizedPhone = normalizePakistaniPhone(phone);
                if (!normalizedPhone) {
                    throw new Error('Invalid phone number. Use a valid Pakistan mobile format (e.g., 03XXXXXXXXX).');
                }

                const existing = await Customer.findOne({ phone: normalizedPhone }).session(session);
                if (existing) {
                    finalCustomerId = existing._id;
                } else {
                    const createdCustomer = await Customer.create([{
                        name, phone: normalizedPhone, address,
                        type: 'retail', 
                        initialBalance: 0,
                        currentBalance: 0
                    }], { session });
                    finalCustomerId = createdCustomer[0]._id;
                }
            }

            let supplierId = null;
            const product = await Product.findById(items[0].productRef).session(session);
            if (!product) throw new Error("Product not found");

            if (product.supplier) {
                const supplierDoc = await Supplier.findOne({ name: product.supplier }).session(session);
                if (supplierDoc) supplierId = supplierDoc._id;
            }

            const enrichedItems = items.map((item: any) => ({
                ...item,
                productName: product.name,
                sku: product.sku
            }));

            let claimData: any = {
                customerRef: finalCustomerId,
                userRef: userId,
                items: enrichedItems, 
                description,
                claimDate: claimDate || new Date(),
                status: status || 'pending',
                supplierRef: supplierId,
                supplierStatus: 'none',
                claimFee: parseFloat(claimFee) || 0,
                claimFeeComment: claimFeeComment || '',
                claimFeePaid: claimFeePaid === true || claimFeePaid === 'true',
                resolutionType: resolutionType || 'exchange',
                deductionAmount: parseFloat(deductionAmount) || 0
            };

            // Handle Exchange Resolution
            if (status === 'resolved' && effectiveResolutionType === 'exchange' && replacementItem && replacementItem.productRef) {
                const repProduct = await Product.findById(replacementItem.productRef).session(session);
                if (!repProduct) { throw new Error("Replacement product not found"); }
                
                const stockBefore = repProduct.stock;
                console.log(`[Claim Create] Exchange: Deducting 1 from "${repProduct.name}" (stock before: ${stockBefore})`);
                await removeStock(replacementItem.productRef, 1, session);
                console.log(`[Claim Create] removeStock completed for "${repProduct.name}"`);
                
                claimData.replacementItem = {
                    productRef: repProduct._id,
                    productName: repProduct.name,
                    serialNumber: replacementItem.serialNumber,
                    sku: repProduct.sku 
                };
                claimData.resolutionDate = new Date();
                const autoRes = `Immediate Exchange with [${repProduct.sku}] ${repProduct.name} (SN: ${replacementItem.serialNumber})`;
                claimData.resolution = resolution || autoRes;
            }
            
            // Handle Ledger Deduction Resolution
            if (status === 'resolved' && effectiveResolutionType === 'ledger_deduction') {
                const deductAmt = parseFloat(deductionAmount) || 0;
                if (deductAmt > 0) {
                    const customer = await Customer.findById(finalCustomerId).session(session);
                    if (customer) {
                        // Credit (subtract from balance) - deduction means customer gets money back
                        customer.currentBalance -= deductAmt;
                        await customer.save({ session });
                    }
                }
                claimData.resolutionDate = new Date();
                claimData.resolution = resolution || `Ledger Deduction of Rs.${deductAmt} for [${product.sku}] ${product.name} (SN: ${items[0].serialNumber})`;
            }

            const claim = new Claim(claimData);
            resultClaim = await claim.save({ session });

            // Create ledger transaction for deduction
            if (status === 'resolved' && effectiveResolutionType === 'ledger_deduction') {
                const deductAmt = parseFloat(deductionAmount) || 0;
                if (deductAmt > 0) {
                    const customer = await Customer.findById(finalCustomerId).session(session);
                    if (customer) {
                        const claimIdStr = (resultClaim as any)._id.toString().slice(-6).toUpperCase();
                        await CustomerTransaction.create([{
                            customer: customer._id,
                            user: userId,
                            type: 'Adjustment',
                            description: `Claim Deduction: ${product.name} (SN: ${items[0].serialNumber}) (Claim #${claimIdStr})`,
                            debit: 0,
                            credit: deductAmt,
                            balance: customer.currentBalance,
                            transactionDate: new Date()
                        }], { session });
                    }
                }
            }

            const feeAmount = parseFloat(claimFee) || 0;
            if (feeAmount > 0) {
                const customer = await Customer.findById(finalCustomerId).session(session);
                if (customer) {
                    const isPaid = claimData.claimFeePaid;
                    
                    if (!isPaid) {
                        customer.currentBalance += feeAmount;
                        await customer.save({ session });

                        // ✅ Safe access to _id
                        const claimIdStr = (resultClaim as any)._id.toString().slice(-6).toUpperCase();

                        await CustomerTransaction.create([{
                            customer: customer._id,
                            user: userId,
                            type: 'Adjustment', 
                            description: `Claim Fee: ${claimFeeComment || 'Service Charges'} (Claim #${claimIdStr})`,
                            debit: feeAmount,  
                            credit: 0,  
                            balance: customer.currentBalance,
                            transactionDate: new Date()
                        }], { session });
                    }
                }
            }
        });

        // ✅ Fix TS18048: Check if defined
        if (!resultClaim) throw new Error("Transaction failed to return data");

        // ✅ Post-transaction stock verification for exchange resolution
        if (resultClaim.replacementItem && resultClaim.replacementItem.productRef) {
            const verifyProduct = await Product.findById(resultClaim.replacementItem.productRef);
            if (verifyProduct) {
                console.log(`[Claim Create] Post-tx stock verification: "${verifyProduct.name}" stock = ${verifyProduct.stock}`);
                
                // Safety net: If the batch-based FIFO deduction failed inside the transaction,
                // ensure stock is at least decremented via a direct atomic update.
                const batchSum = (verifyProduct.batches || []).reduce((sum: number, b: any) => sum + b.quantity, 0);
                if (verifyProduct.stock > batchSum) {
                    console.warn(`[Claim Create] Stock mismatch detected! stock=${verifyProduct.stock}, batchSum=${batchSum}. Correcting...`);
                    verifyProduct.stock = batchSum;
                    await verifyProduct.save();
                }
            }
        }

        const populatedClaim = await Claim.findById(resultClaim._id)
            .populate('customerRef', 'name phone')
            .populate('userRef', 'username')
            .populate('supplierRef', 'name');

        res.status(201).json(populatedClaim);

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Claim creation failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// @desc    Update claim status
export const updateClaimStatus = asyncHandler(async (req: Request, res: Response) => {
    const { status, resolution, replacementItem, supplierStatus, supplierRef, resolutionType, deductionAmount } = req.body; 
    // @ts-ignore
    const userId = req.user._id;
    
    const session = await mongoose.startSession();
    try {
        let updatedClaim: any; // ✅ Explicitly typed as 'any'

        await session.withTransaction(async () => {
            const claim = await Claim.findById(req.params.id).session(session);
            if (!claim) { throw new Error('Claim not found'); }

            const previousStatus = claim.status;

            if (supplierRef) claim.supplierRef = supplierRef;
            
            if (supplierStatus && supplierStatus !== claim.supplierStatus) {
                const originalItem = claim.items[0]; 
                
                if (originalItem && originalItem.productRef) {
                    if (supplierStatus === 'received_from_supplier' && claim.supplierStatus !== 'received_from_supplier') {
                        const product = await Product.findById(originalItem.productRef).session(session);
                        if (product) {
                            // ✅ Safe ID access
                            const claimIdStr = (claim._id as Types.ObjectId).toString().slice(-6);
                            await addStock(
                                originalItem.productRef as Types.ObjectId, 
                                1, 
                                product.averageCost || 0, 
                                session,
                                undefined,
                                `Claim Received From Supplier #${claimIdStr}`
                            );
                        }
                    }
                    else if (claim.supplierStatus === 'received_from_supplier' && supplierStatus !== 'received_from_supplier') {
                         await removeStock(originalItem.productRef as Types.ObjectId, 1, session);
                    }
                }
                claim.supplierStatus = supplierStatus;
            }

            // Handle Exchange Resolution
            const effectiveResType = resolutionType || 'exchange';
            if (status === 'resolved' && previousStatus !== 'resolved' && effectiveResType === 'exchange' && replacementItem && replacementItem.productRef) {
                console.log(`[Claim Update] Exchange: Deducting 1 from product ${replacementItem.productRef}`);
                await removeStock(replacementItem.productRef, 1, session);
                console.log(`[Claim Update] removeStock completed`);
                
                const product = await Product.findById(replacementItem.productRef).session(session);
                const prodName = product ? product.name : 'Unknown';
                const prodSku = product ? product.sku : '-';

                claim.replacementItem = {
                    productRef: new Types.ObjectId(replacementItem.productRef),
                    productName: prodName,
                    serialNumber: replacementItem.serialNumber,
                    sku: prodSku 
                };
                claim.resolutionType = 'exchange';
                claim.resolutionDate = new Date(); 
                claim.resolution = resolution || `Replaced with [${prodSku}] ${prodName} (SN: ${replacementItem.serialNumber})`;
            }
            // Handle Ledger Deduction Resolution
            else if (status === 'resolved' && previousStatus !== 'resolved' && effectiveResType === 'ledger_deduction') {
                const deductAmt = parseFloat(deductionAmount) || 0;
                if (deductAmt > 0) {
                    const customer = await Customer.findById(claim.customerRef).session(session);
                    if (customer) {
                        // Credit (subtract from balance) - deduction means customer gets money back
                        customer.currentBalance -= deductAmt;
                        await customer.save({ session });

                        const claimIdStr = (claim._id as Types.ObjectId).toString().slice(-6).toUpperCase();
                        const originalItem = claim.items[0];
                        const itemName = originalItem?.productName || 'Unknown Product';
                        const serialNo = originalItem?.serialNumber || 'N/A';

                        await CustomerTransaction.create([{
                            customer: customer._id,
                            user: userId,
                            type: 'Adjustment',
                            description: `Claim Deduction: ${itemName} (SN: ${serialNo}) (Claim #${claimIdStr})`,
                            debit: 0,
                            credit: deductAmt,
                            balance: customer.currentBalance,
                            transactionDate: new Date()
                        }], { session });
                    }
                }
                claim.resolutionType = 'ledger_deduction';
                claim.deductionAmount = deductAmt;
                claim.resolutionDate = new Date();
                claim.resolution = resolution || `Ledger Deduction of Rs.${deductAmt}`;
            }
            // Revert logic (when un-resolving)
            else if (previousStatus === 'resolved' && status !== 'resolved') {
                if (claim.replacementItem && claim.replacementItem.productRef) {
                    const product = await Product.findById(claim.replacementItem.productRef).session(session);
                    const cost = product ? product.averageCost : 0;

                    // ✅ Safe ID access
                    const claimIdStr = (claim._id as Types.ObjectId).toString().slice(-6);
                    await addStock(
                        claim.replacementItem.productRef,
                        1,
                        cost,
                        session,
                        undefined,
                        `Claim Reverted (Un-resolved) #${claimIdStr}`
                    );

                    claim.replacementItem = undefined;
                    claim.resolution = undefined;
                    claim.resolutionDate = undefined;
                }
            }

            if (status) {
                claim.status = status;
                if (status === 'resolved' || status === 'rejected') {
                    if (!claim.resolutionDate) claim.resolutionDate = new Date();
                    if (resolution) claim.resolution = resolution;
                }
            }

            updatedClaim = await claim.save({ session });
        });

        // ✅ Check defined
        if (!updatedClaim) throw new Error("Update transaction failed");

        const populated = await Claim.findById(updatedClaim._id)
             .populate('customerRef', 'name phone')
             .populate('userRef', 'username')
             .populate('supplierRef', 'name');

        res.json(populated);

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Update failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// @desc    Edit Claim Details
export const editClaimDetails = asyncHandler(async (req: Request, res: Response) => {
    const { items, description, claimFee, claimFeeComment, claimFeePaid, claimDate } = req.body;
    // @ts-ignore
    const userId = req.user._id;
    const claimId = req.params.id;

    const session = await mongoose.startSession();
    try {
        let updatedClaim;

        await session.withTransaction(async () => {
            const claim = await Claim.findById(claimId).session(session);
            if (!claim) throw new Error("Claim not found");
            
            if (claim.status === 'resolved' && items) {
                const currentProd = claim.items[0]?.productRef?.toString();
                const newProd = items[0]?.productRef;
                if (currentProd !== newProd) {
                    throw new Error("Cannot change Product/Item of a resolved claim. Please 'Revert' status to Pending first.");
                }
            }

            const oldFee = claim.claimFee || 0;
            const oldPaid = claim.claimFeePaid;

            if (oldFee > 0 && !oldPaid) {
                const customer = await Customer.findById(claim.customerRef).session(session);
                if (customer) {
                    customer.currentBalance -= oldFee;
                    await customer.save({ session });
                    
                    // ✅ Safe ID Access
                    const claimIdStr = (claim._id as Types.ObjectId).toString().slice(-6);
                    await CustomerTransaction.create([{
                        customer: customer._id,
                        user: userId,
                        type: 'Adjustment',
                        description: `Claim Fee Reversal (Edit #${claimIdStr})`,
                        debit: 0,
                        credit: oldFee, 
                        balance: customer.currentBalance,
                        transactionDate: new Date()
                    }], { session });
                }
            }

            const newFee = parseFloat(claimFee) || 0;
            const newPaid = claimFeePaid === true || claimFeePaid === 'true';

            if (newFee > 0 && !newPaid) {
                const customer = await Customer.findById(claim.customerRef).session(session);
                if (customer) {
                    customer.currentBalance += newFee;
                    await customer.save({ session });

                    await CustomerTransaction.create([{
                        customer: customer._id,
                        user: userId,
                        type: 'Adjustment',
                        description: `Claim Fee: ${claimFeeComment || 'Service Charges'} (Edited)`,
                        debit: newFee,
                        credit: 0,
                        balance: customer.currentBalance,
                        transactionDate: new Date()
                    }], { session });
                }
            }

            if (items && items.length > 0 && claim.status !== 'resolved') {
                const product = await Product.findById(items[0].productRef).session(session);
                if (product) {
                    claim.items = items.map((item: any) => ({
                        ...item,
                        productName: product.name,
                        sku: product.sku,
                        serialNumber: item.serialNumber
                    }));
                }
            }
            if (description !== undefined) claim.description = description;
            if (claimDate) claim.claimDate = new Date(claimDate);
            
            claim.claimFee = newFee;
            claim.claimFeePaid = newPaid;
            claim.claimFeeComment = claimFeeComment;

            updatedClaim = await claim.save({ session });
        });

        // Ensure update succeeded
        if (!updatedClaim) {
            res.status(500);
            throw new Error('Claim update failed');
        }

        // Populate references before returning
        const populatedClaim = await Claim.findById((updatedClaim as any)._id)
            .populate('customerRef', 'name phone')
            .populate('userRef', 'username')
            .populate('supplierRef', 'name')
            .populate('items.productRef', 'sku name');

        res.json(populatedClaim);

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Edit failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// @desc    Delete Claim
export const deleteClaim = asyncHandler(async (req: Request, res: Response) => { 
    // @ts-ignore
    const userId = req.user._id;
    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            const claim = await Claim.findById(req.params.id).session(session);
            if (!claim) throw new Error('Claim not found');

            if (claim.status === 'resolved') {
                throw new Error("Cannot delete a Resolved claim directly. Please 'Revert' it to Pending first (to restore stock).");
            }

            const fee = claim.claimFee || 0;
            const paid = claim.claimFeePaid;

            if (fee > 0 && !paid) {
                const customer = await Customer.findById(claim.customerRef).session(session);
                if (customer) {
                    customer.currentBalance -= fee;
                    await customer.save({ session });

                    // ✅ Safe ID access
                    const claimIdStr = (claim._id as Types.ObjectId).toString().slice(-6);
                    await CustomerTransaction.create([{
                        customer: customer._id,
                        user: userId,
                        type: 'Adjustment',
                        description: `Claim Deleted (Reversal) #${claimIdStr}`,
                        debit: 0,
                        credit: fee, 
                        balance: customer.currentBalance,
                        transactionDate: new Date()
                    }], { session });
                }
            }

            await Claim.findByIdAndDelete(req.params.id).session(session);
        });

        res.json({ message: "Claim deleted successfully and financials reverted" }); 

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Delete failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// ... Standard functions ...
export const sendClaimsToSupplier = asyncHandler(async (req: Request, res: Response) => {
    const { claimIds, targetSupplierId } = req.body; 
    if (!Array.isArray(claimIds) || claimIds.length === 0) { res.status(400); throw new Error("No claims selected"); }
    const updateData: any = { supplierStatus: 'sent_to_supplier' };
    if (targetSupplierId) { updateData.supplierRef = targetSupplierId; }
    await Claim.updateMany({ _id: { $in: claimIds } }, { $set: updateData });
    res.status(200).json({ message: `Successfully sent ${claimIds.length} claims to supplier` });
});
export const getClaimById = asyncHandler(async (req: Request, res: Response) => {
    const claim = await Claim.findById(req.params.id).populate('customerRef', 'name phone').populate('supplierRef', 'name');
    if (!claim) { res.status(404); throw new Error('Claim not found'); }
    res.json(claim);
});
export const updateClaim = asyncHandler(async (req: Request, res: Response) => {
    const claim = await Claim.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!claim) { res.status(404); throw new Error('Claim not found'); }
    res.json(claim);
});
export const getClaimLedgerPdf = asyncHandler(async (req: Request, res: Response) => {
    const { entityId, type, startDate, endDate } = req.query;
    if (!entityId || !type) { res.status(400); throw new Error("Entity ID and Type required"); }
    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate as string) : new Date();
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    let entity;
    let filter: any = {
        $or: [
            { claimDate: { $gte: start, $lte: end } },
            { claimDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
            { claimDate: null, createdAt: { $gte: start, $lte: end } }
        ]
    };
    if (type === 'customer') { entity = await Customer.findById(entityId); filter.customerRef = entityId; } 
    else { entity = await Supplier.findById(entityId); filter.supplierRef = entityId; }
    if (!entity) { res.status(404); throw new Error(`${type} not found`); }
    const claims = await Claim.find(filter).sort({ createdAt: 1 });
    // @ts-ignore
    generateClaimLedgerPDF(res, entity, claims, start, end, type);
});
export const sendClaimLedgerWhatsApp = asyncHandler(async (req: Request, res: Response) => {
    const { entityId, type, startDate, endDate } = req.body;
    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date();
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    let entity;
    let filter: any = {
        $or: [
            { claimDate: { $gte: start, $lte: end } },
            { claimDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
            { claimDate: null, createdAt: { $gte: start, $lte: end } }
        ]
    };
    if (type === 'customer') { entity = await Customer.findById(entityId); filter.customerRef = entityId; } 
    else { entity = await Supplier.findById(entityId); filter.supplierRef = entityId; }
    if (!entity) { res.status(404); throw new Error(`${type} not found`); }
    // @ts-ignore
    if (!entity.phone) { res.status(400); throw new Error("Phone number missing"); }
    const claims = await Claim.find(filter).sort({ createdAt: 1 });
    try {
        const baseUrl = process.env.BASE_URL || 'https://your-app.vercel.app';
        const pdfUrl = `${baseUrl}/api/claims/ledger/pdf?entityId=${entityId}&type=${type}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
        // @ts-ignore
        const filename = `Claim_History_${entity.name.replace(/\s+/g,'_')}.pdf`;
        // @ts-ignore
        const sent = await sendDocumentWhatsApp(
            entity.phone,
            pdfUrl,
            // @ts-ignore
            entity.name,
            'Claim History',
            filename
        );
        if (sent) res.json({ message: "Claim Ledger sent via WhatsApp!" });
        else throw new Error("Failed to send");
    } catch (error) { console.error("WhatsApp Error:", error); res.status(500).json({ message: "WhatsApp failed" }); }
});