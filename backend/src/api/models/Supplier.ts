import { Schema, model, Document } from 'mongoose';

export interface ISupplier extends Document {
    name: string;
    contactPerson?: string;
    phone: string;
    address?: string;
    status: 'active' | 'inactive';
    
    // --- ADDED LEDGER FIELDS ---
    initialBalance: number; 
    currentBalance: number; // Positive means we owe them money
    // ---------------------------

    createdAt: Date;
    updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    contactPerson: { type: String, trim: true },
    phone: { type: String, required: true },
    address: { type: String },
    
    // --- ADDED ---
    initialBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    // -------------

    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true
});

const Supplier = model<ISupplier>('Supplier', supplierSchema);
export default Supplier;