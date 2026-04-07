import mongoose, { Schema, Document, Types } from "mongoose";
import { ICustomer } from "./Customer";
import { IProduct } from "./Product";
import { IBilling } from "./Billing";

export interface IOrderItem {
  productRef: Types.ObjectId | IProduct;
  productName: string;
  quantity: number;
  price: number;
  cost: number;           // <--- ADDED: Cost Price per unit
  batchCostAllocations?: {
    quantity: number;
    costPrice: number;
    receivedDate?: Date;
  }[];
  sku?: string;
  chassisNumber?: string; 
}

export interface IOrder {
  _id: Types.ObjectId;
  customerRef: Types.ObjectId | ICustomer;
  customerName: string;
  items: IOrderItem[];
  
  totalAmount: number;
  totalCost: number;      // <--- ADDED: Total Cost of Order
  
  status: "processing" | "completed" | "cancelled";
  productType?: string;
  type?: "retail" | "wholesale";
  gatePass?: boolean;
  billRef?: Types.ObjectId | IBilling | null;
  
  nic?: string;       
  address?: string;   
  
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = IOrder & Document;

const OrderSchema = new Schema<OrderDocument>(
  {
    customerRef: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    customerName: { type: String, required: true },
    
    nic: { type: String },
    address: { type: String },

    items: [
      {
        productRef: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        productName: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        cost: { type: Number, required: true }, // <--- SAVES HISTORICAL COST
        batchCostAllocations: [
          {
            quantity: { type: Number, required: true },
            costPrice: { type: Number, required: true },
            receivedDate: { type: Date },
          },
        ],
        sku: { type: String },
        chassisNumber: { type: String } 
      },
    ],

    totalAmount: { type: Number, required: true },
    totalCost: { type: Number, default: 0 },    // <--- SAVES TOTAL COST

    status: { type: String, enum: ["processing", "completed", "cancelled"], default: "processing" },
    productType: { type: String },
    type: { type: String, enum: ["retail", "wholesale"] },
    gatePass: { type: Boolean, default: false },
    billRef: { type: Schema.Types.ObjectId, ref: "Billing", default: null },
  },
  { timestamps: true }
);

export default mongoose.model<OrderDocument>("Order", OrderSchema);