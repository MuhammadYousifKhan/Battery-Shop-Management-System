import mongoose, { Schema, Document } from 'mongoose';

export interface IStoreSettings extends Document {
  storeName: string;
  systemName: string;
  address: string;
  phone: string;
  watermarkName: string;
  logoDataUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSettingsSchema = new Schema<IStoreSettings>(
  {
    storeName: { type: String, default: 'My Store', trim: true },
    systemName: { type: String, default: 'Store Management System', trim: true },
    address: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    watermarkName: { type: String, default: '', trim: true },
    logoDataUrl: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model<IStoreSettings>('StoreSettings', StoreSettingsSchema);