// src/api/models/ScrapBatteries.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IScrapBattery extends Document {
  type: 'buy' | 'sell';
  customerName: string;
  customerRef?: mongoose.Types.ObjectId;
  supplierRef?: mongoose.Types.ObjectId;
  supplierTransactionRef?: mongoose.Types.ObjectId;
  customerPhone?: string;
  customerCategory?: 'walkin' | 'retail' | 'wholesale' | 'dealer';
  settlementMode?: 'deduct_balance' | 'receive_payment' | 'receive' | 'pay';
  ledgerTransactionRef?: mongoose.Types.ObjectId;
  weight: number;
  pricePerKg: number;
  totalAmount: number;
  date: Date;
}

const ScrapBatterySchema: Schema = new Schema({
  type: { 
    type: String, 
    enum: ['buy', 'sell'], 
    default: 'buy', 
    required: true 
  },
  customerName: { type: String, required: true },
  customerRef: { type: Schema.Types.ObjectId, ref: 'Customer' },
  supplierRef: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierTransactionRef: { type: Schema.Types.ObjectId, ref: 'SupplierTransaction' },
  customerPhone: { type: String },
  customerCategory: {
    type: String,
    enum: ['walkin', 'retail', 'wholesale', 'dealer'],
    default: 'walkin'
  },
  settlementMode: {
    type: String,
    enum: ['deduct_balance', 'receive_payment', 'receive', 'pay'],
    default: 'receive_payment'
  },
  ledgerTransactionRef: { type: Schema.Types.ObjectId, ref: 'CustomerTransaction' },
  weight: { type: Number, required: true },
  pricePerKg: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

export default mongoose.model<IScrapBattery>("ScrapBattery", ScrapBatterySchema);