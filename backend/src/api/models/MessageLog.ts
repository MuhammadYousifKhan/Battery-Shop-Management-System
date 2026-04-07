import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageLog extends Document {
  messageId: string;
  phone: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'blocked';
  errorMessage?: string;
  createdAt: Date;
}

const MessageLogSchema: Schema = new Schema(
  {
    messageId: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed', 'blocked'],
      default: 'sent'
    },
    errorMessage: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IMessageLog>('MessageLog', MessageLogSchema);
