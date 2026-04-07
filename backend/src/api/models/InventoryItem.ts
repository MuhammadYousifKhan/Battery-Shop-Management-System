import mongoose, { Schema, Document } from "mongoose";

export interface IInventoryItem extends Document {
  product: string;         // e.g., SKU or product reference
  location: string;        // e.g., warehouse/branch name
  quantity: number;
  minStock: number;
  maxStock: number;
  updatedAt: Date;
}

const InventoryItemSchema: Schema = new Schema({
  product: { type: String, required: true },
  location: { type: String, default: "main" },
  quantity: { type: Number, required: true },
  minStock: { type: Number, default: 0 },
  maxStock: { type: Number, default: 1000 },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model<IInventoryItem>("InventoryItem", InventoryItemSchema);