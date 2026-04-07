import mongoose, { Schema, Document, Types } from 'mongoose';
import { ICustomer } from './Customer';
import { IProduct } from './Product';
import { IUser } from './User';
import { ISupplier } from './Supplier';

export interface IClaimItem { 
  productRef: Types.ObjectId | IProduct; 
  productName: string; 
  quantity: number; 
  serialNumber: string; 
  sku?: string; 
}

export interface IReplacementItem {
  productRef: Types.ObjectId;
  productName: string;
  serialNumber: string;
  sku?: string; 
}

export interface IClaim extends Document {
  customerRef: Types.ObjectId | ICustomer; 
  userRef: Types.ObjectId | IUser; 
  
  supplierRef?: Types.ObjectId | ISupplier; 
  supplierStatus: 'none' | 'sent_to_supplier' | 'received_from_supplier' | 'rejected_by_supplier';

  items: IClaimItem[]; 
  status: "pending" | "received" | "rejected" | "resolved"; 
  description?: string; 
  
  resolution?: string; 
  resolutionDate?: Date; 
  replacementItem?: IReplacementItem; 
  
  // --- NEW PAYMENT FIELDS ---
  claimFee: number;
  claimFeeComment?: string;
  claimFeePaid: boolean; // true = Cash, false = Added to Ledger (Debit)
  resolutionType: 'exchange' | 'ledger_deduction';
  deductionAmount: number;
  // --------------------------

  claimDate: Date;
  createdAt: Date;
}

const ClaimItemSchema = new Schema<IClaimItem>({
  productRef: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  serialNumber: { type: String, required: true }, 
  sku: { type: String } 
});

const ReplacementItemSchema = new Schema<IReplacementItem>({
  productRef: { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  serialNumber: { type: String },
  sku: { type: String } 
});

const ClaimSchema: Schema = new Schema<IClaim>({
  customerRef: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  userRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  
  supplierRef: { type: Schema.Types.ObjectId, ref: 'Supplier' }, 
  supplierStatus: { 
      type: String, 
      enum: ['none', 'sent_to_supplier', 'received_from_supplier', 'rejected_by_supplier'], 
      default: 'none' 
  },

  items: [ClaimItemSchema], 
  description: { type: String }, 
  status: { type: String, enum: ["pending", "received", "rejected", "resolved"], default: "pending" },
  
  resolution: { type: String },
  resolutionDate: { type: Date }, 
  replacementItem: ReplacementItemSchema, 
  
  // --- NEW FIELDS IMPLEMENTATION ---
  claimFee: { type: Number, default: 0 },
  claimFeeComment: { type: String },
  claimFeePaid: { type: Boolean, default: false },
  resolutionType: { type: String, enum: ['exchange', 'ledger_deduction'], default: 'exchange' },
  deductionAmount: { type: Number, default: 0 },
  // --------------------------------

  claimDate: { type: Date, default: Date.now }
}, {
  timestamps: true 
});

export default mongoose.model<IClaim>("Claim", ClaimSchema);