import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import InventoryItem from "../../models/InventoryItem";
import mongoose from 'mongoose';

export const addInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const { product, location, quantity, minStock, maxStock } = req.body;
    
    const session = await mongoose.startSession();
    try {
        let resultItem;
        await session.withTransaction(async () => {
            let item = await InventoryItem.findOne({ product, location }).session(session);
            if (item) {
                item.quantity += quantity;
                item.minStock = minStock ?? item.minStock;
                item.maxStock = maxStock ?? item.maxStock;
                item.updatedAt = new Date();
                resultItem = await item.save({ session });
            } else {
                item = new InventoryItem({ product, location, quantity, minStock, maxStock });
                resultItem = await item.save({ session });
            }
        });
        res.status(201).json(resultItem);
    } catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : "Failed" });
    } finally {
        session.endSession();
    }
});

export const getInventoryItems = asyncHandler(async (req: Request, res: Response) => {
    const list = await InventoryItem.find();
    res.json(list);
});

export const updateInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const { quantity } = req.body;
    if (quantity === undefined) { res.status(400); throw new Error('Quantity is required'); }
    
    const item = await InventoryItem.findByIdAndUpdate(
        req.params.id, 
        { quantity: Number(quantity), updatedAt: new Date() }, 
        { new: true }
    );
    if (item) res.json(item);
    else { res.status(404); throw new Error('Inventory item not found'); }
});

export const deleteInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryItem.findByIdAndDelete(req.params.id);
    if (item) res.json({ message: 'Inventory item removed' });
    else { res.status(404); throw new Error('Inventory item not found'); }
});