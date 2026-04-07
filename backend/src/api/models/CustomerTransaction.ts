import mongoose from 'mongoose';

const customerTransactionSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Make sure this is not strict if user ID isn't always passed
  },
  // --- UPDATE THIS SECTION ---
  type: {
    type: String,
    required: true,
    enum: ['Invoice', 'Payment', 'Adjustment', 'Initial Balance', 'Return'], // <--- ADD 'Return' HERE
  },
  // ---------------------------
  description: {
    type: String,
    required: true,
  },
  orderRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  billRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Billing',
  },
  invoiceRef: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'CustomerInvoice' 
  },
  debit: {
    type: Number,
    default: 0,
  },
  credit: {
    type: Number,
    default: 0,
  },
  balance: {
    type: Number,
    required: true,
  },
  transactionDate: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

const CustomerTransaction = mongoose.model('CustomerTransaction', customerTransactionSchema);
export default CustomerTransaction;