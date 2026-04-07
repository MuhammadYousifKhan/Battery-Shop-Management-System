import mongoose from 'mongoose';

const supplierTransactionSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'Invoice',
      'Payment',
      'Initial Balance',
      'Adjustment',
      'Scrap Settlement',
      'Scrap Balance Deduction',
      'Scrap Payment Received',
      'Scrap Supplier Payment'
    ], 
  },
  description: { type: String, required: true },
  
  // References
  invoiceRef: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Invoice' 
  },

  // Accounting Logic (Accounts Payable)
  // Credit (+): We bought goods, we owe MORE.
  // Debit (-): We paid money, we owe LESS.
  debit: { type: Number, default: 0 },  // Amount Paid
  credit: { type: Number, default: 0 }, // Bill Amount
  
  balance: { type: Number, required: true }, // Running Balance
  
  transactionDate: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

const SupplierTransaction = mongoose.model('SupplierTransaction', supplierTransactionSchema);
export default SupplierTransaction;