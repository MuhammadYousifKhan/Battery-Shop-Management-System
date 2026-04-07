import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  password: string;
  role: string;
  status: 'active' | 'inactive';
  email?: string; 
  phone?: string; 
  
  // --- Recovery Fields (Optional for Managers) ---
  securityQuestion?: string;
  securityAnswer?: string;
}

const UserSchema: Schema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false }, // Hidden by default
    role: { type: String, required: true },
    
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    
    email: { type: String },
    phone: { type: String },

    // --- New Recovery Fields ---
    // Changed to required: false so Managers can be created without them
    securityQuestion: { 
      type: String, 
      required: false 
    },
    securityAnswer: { 
      type: String, 
      required: false, 
      select: false // Crucial: Hide the answer from API responses
    },
  },
  {
    timestamps: true 
  }
);

export default mongoose.model<IUser>("User", UserSchema);