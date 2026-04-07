import { Schema, model, Document } from 'mongoose';

export interface ICustomer extends Document {
    name: string;
    email?: string;
    phone: string;
    address?: string;
    type: 'retail' | 'wholesale';
    shopName?: string;
    shopAddress?: string;
    
    initialBalance: number; 
    currentBalance: number;
    
    status: 'active' | 'inactive';
    createdAt: Date;
    updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>({
    name: { type: String, required: true, trim: true },
    // ✅ Unique: true ensures database-level protection against duplicates
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, sparse: true, trim: true },
    address: { type: String },
    type: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
    
    shopName: { type: String },
    shopAddress: { type: String },
    
    initialBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, {
    timestamps: true
});

const Customer = model<ICustomer>('Customer', customerSchema);
export default Customer;