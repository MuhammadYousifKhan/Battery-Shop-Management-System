import { Schema, model, Document, Types } from 'mongoose';

// --- Interface: Stock Batch ---
export interface IStockBatch {
  _id?: Types.ObjectId;
  quantity: number;   // Quantity received
  costPrice: number;  // Cost per unit for this batch
  receivedDate: Date; // For FIFO logic
  supplierInvoiceRef?: Types.ObjectId;
  source?: string;    // <--- ADDED: To track origin (Purchase, Return, etc.)
}

// --- Product Document Interface ---
export interface IProduct extends Document {
  sku: string;
  name: string;
  category: string;
  description?: string;
  price: number; // Selling price
  supplier?: string; 
  unit?: string; 

  stock: number; // Total stock count
  minStockLevel?: number;
  batches: IStockBatch[]; // Array of batches
  
  createdAt: Date;
  updatedAt: Date;

  // --- Virtual Fields ---
  totalStock: number;
  averageCost: number;
  totalValue: number;
}

// --- Sub-schema for Stock Batches ---
const stockBatchSchema = new Schema<IStockBatch>({
  quantity: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  receivedDate: { type: Date, default: Date.now },
  supplierInvoiceRef: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  source: { type: String, default: 'Purchase' } // <--- ADDED SOURCE FIELD
});

// --- Product Schema ---
const productSchema = new Schema<IProduct>(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    category: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true },
    supplier: { type: String },
    unit: { type: String, default: 'pcs' },
    
    stock: { type: Number, default: 0 }, 
    minStockLevel: { type: Number, default: 5 },
    batches: [stockBatchSchema]
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// --- VIRTUAL: totalStock ---
productSchema.virtual('totalStock').get(function(this: IProduct) {
  return this.stock; 
});

// --- VIRTUAL: averageCost ---
productSchema.virtual('averageCost').get(function(this: IProduct) {
  if (this.stock === 0 || !this.batches || this.batches.length === 0) return 0;
  
  const totalValue = this.batches.reduce((acc, batch) => acc + (batch.quantity * batch.costPrice), 0);
  // Calculate based on actual batches sum to be precise
  const totalQty = this.batches.reduce((acc, batch) => acc + batch.quantity, 0);
  
  return totalQty > 0 ? totalValue / totalQty : 0;
});

// --- VIRTUAL: totalValue ---
productSchema.virtual('totalValue').get(function(this: IProduct) {
    return (this.averageCost || 0) * (this.stock || 0);
});

const Product = model<IProduct>('Product', productSchema);
export default Product;