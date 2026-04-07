import mongoose, { Schema, Document } from "mongoose";

export interface ISalesReport extends Document {
  reportDate: Date;
  totalSales: number;
  totalRevenue: number;
  totalBills: number;
  summary: string;
}

const SalesReportSchema: Schema = new Schema({
  reportDate: { type: Date, default: Date.now },
  totalSales: { type: Number, required: true },
  totalRevenue: { type: Number, required: true },
  totalBills: { type: Number, required: true },
  summary: { type: String }
});

export default mongoose.model<ISalesReport>("SalesReport", SalesReportSchema);