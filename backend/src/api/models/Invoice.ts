import mongoose, { Schema, Document, Types } from 'mongoose';
import { ISupplier } from './Supplier';

interface IInvoiceItem {
  productRef: Types.ObjectId;
  productName: string;
  quantity: number;
  price: number; 
}

export interface IInvoice extends Document {
  supplier: Types.ObjectId | ISupplier;
  invoiceNumber: string;
  items: IInvoiceItem[];
  totalAmount: number;
  // UPDATE: Added 'cancelled'
  status: 'draft' | 'pending' | 'paid' | 'cancelled'; 
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema = new Schema({
    productRef: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true }, 
    price: { type: Number, required: true } 
});

const InvoiceSchema: Schema = new Schema<IInvoice>({
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  invoiceNumber: { type: String, unique: true, sparse: true }, 
  items: [InvoiceItemSchema],
  totalAmount: { type: Number, required: true },
  
  // UPDATE: Added 'cancelled' to enum
  status: { type: String, enum: ['draft', 'pending', 'paid', 'cancelled'], default: 'pending' },
}, { timestamps: true });

InvoiceSchema.pre('save', async function (next) {
    if (this.isNew && !this.invoiceNumber) {
        const lastInvoice = await mongoose.model('Invoice').findOne().sort({ createdAt: -1 });
        let nextNum = 1;
        if (lastInvoice && (lastInvoice as IInvoice).invoiceNumber) {
            const parts = (lastInvoice as IInvoice).invoiceNumber.split('-');
            if (parts.length > 1) nextNum = parseInt(parts[1]) + 1;
        }
        this.invoiceNumber = `SINV-${String(nextNum).padStart(4, '0')}`;
    }
    next();
});

export default mongoose.model<IInvoice>('Invoice', InvoiceSchema);