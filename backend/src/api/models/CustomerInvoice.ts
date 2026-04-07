// src/api/models/CustomerInvoice.ts (FIXED: Removed 'required: true' from invoiceNumber)
import mongoose, { Schema, model, Document, Types } from 'mongoose';

export interface ICustomerInvoiceItem { 
  productName: string;
  quantity: number;
  price: number;
  total: number;
  billRef: Types.ObjectId; 
}

export interface ICustomerInvoice extends Document {
  customerRef: Types.ObjectId; 
  customerName: string; 
  invoiceNumber: string; 
  date: Date;
  
  items: ICustomerInvoiceItem[];
  
  previousBalance: number; 
  subtotal: number;       
  totalAmount: number;    
  
  status: 'draft' | 'sent' | 'paid';
  
  createdAt: Date;
  updatedAt: Date;
}

const customerInvoiceSchema = new Schema<ICustomerInvoice>(
  {
    customerRef: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true },
    
    // --- FIX: Removed 'required: true' ---
    // It is auto-generated in the pre-save hook, so we don't require it from the client.
    invoiceNumber: { type: String, unique: true }, 

    date: { type: Date, default: Date.now },
    
    items: [{
      productName: { type: String, required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      total: { type: Number, required: true },
      billRef: { type: Schema.Types.ObjectId, ref: 'Billing', required: true } 
    }],
    
    previousBalance: { type: Number, default: 0 },
    subtotal: { type: Number, required: true }, 
    totalAmount: { type: Number, required: true }, 
    
    status: { type: String, enum: ['draft', 'sent', 'paid'], default: 'draft' },
  },
  { timestamps: true }
);

// Auto-Generate Invoice Number
customerInvoiceSchema.pre('save', async function (next) {
    if (this.isNew && !this.invoiceNumber) {
        const Model = this.constructor as mongoose.Model<ICustomerInvoice>;
        const lastInvoice = await Model.findOne().sort({ createdAt: -1 });
        
        let nextNum = 1;
        if (lastInvoice && lastInvoice.invoiceNumber) {
            const numPart = lastInvoice.invoiceNumber.split('-')[1];
            if (numPart) {
                nextNum = parseInt(numPart) + 1;
            }
        }
        this.invoiceNumber = `CINV-${String(nextNum).padStart(4, '0')}`;
    }
    next();
});

const CustomerInvoice = model<ICustomerInvoice>('CustomerInvoice', customerInvoiceSchema);
export default CustomerInvoice;