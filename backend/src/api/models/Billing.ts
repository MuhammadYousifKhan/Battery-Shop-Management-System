import mongoose, { Schema, Document, Types } from 'mongoose';
import { IProduct } from './Product';
import { ICustomer } from './Customer';

export interface IBillingItem {
  productRef: Types.ObjectId | IProduct;
  productName: string;
  category?: string;
  quantity: number;
  price: number; 
  cost: number;  
  batchCostAllocations?: {
    quantity: number;
    costPrice: number;
    receivedDate?: Date;
  }[];
  sku?: string;
  model?: string;
  color?: string;
  chassisNumber?: string;
  engineNumber?: string;
}

export interface IPaymentRecord {
    amount: number;
    date: Date;
    note?: string;
}

export interface IBilling extends Document {
  customerRef?: Types.ObjectId | ICustomer;
  customerName: string;
  customerPhone?: string; 
  nic?: string;           
  items: IBillingItem[];
  
  amount: number;      
  scrapWeight: number; 
  scrapPricePerKg: number; 
  scrapAmount: number; 
  paidAmount: number;  
  balance: number;     
  
  dueDate?: Date;      

  paymentHistory: IPaymentRecord[]; 

  status: 'paid' | 'pending' | 'partial' | 'cancelled' | 'invoiced';
  customerInvoiceRef?: Types.ObjectId; 
  scrapRef?: Types.ObjectId; 

  address?: string;
  createdAt: Date;
}

const BillingSchema: Schema = new Schema<IBilling>({
  customerRef: { type: Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  customerPhone: { type: String }, 
  nic: { type: String }, 
  
  items: [{
    productRef: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    category: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, required: true }, 
    batchCostAllocations: [{
      quantity: { type: Number, required: true },
      costPrice: { type: Number, required: true },
      receivedDate: { type: Date }
    }],
    sku: { type: String },
    model: { type: String },
    color: { type: String },
    chassisNumber: { type: String },
    engineNumber: { type: String }
  }],
  
  amount: { type: Number, required: true },
  scrapWeight: { type: Number, default: 0 },
  scrapPricePerKg: { type: Number, default: 0 },
  scrapAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  
  dueDate: { type: Date }, 
  
  paymentHistory: [{
      amount: { type: Number, required: true },
      date: { type: Date, default: Date.now },
      note: { type: String }
  }],

  status: { 
      type: String, 
      enum: ['paid', 'pending', 'partial', 'cancelled', 'invoiced'], 
      default: 'paid' 
  },
  
  customerInvoiceRef: { type: Schema.Types.ObjectId, ref: 'CustomerInvoice' },
  scrapRef: { type: Schema.Types.ObjectId, ref: 'ScrapBattery' }, 
  
  address: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IBilling>("Billing", BillingSchema);