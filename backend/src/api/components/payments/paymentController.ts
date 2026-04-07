import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Customer from '../../models/Customer';
import CustomerTransaction from '../../models/CustomerTransaction';
import mongoose from 'mongoose';

// @desc    Receive a new payment from a customer
// @route   POST /api/payments
export const receivePayment = asyncHandler(async (req: Request, res: Response) => {
  const { customerId, amount, description, date } = req.body;
  // @ts-ignore
  const userId = req.user._id; 

  if (!customerId || !amount || !date) {
    res.status(400); throw new Error('Please provide customerId, amount, and date');
  }
  
  const paymentAmount = parseFloat(amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    res.status(400); throw new Error('Invalid payment amount');
  }

  // --- TIME FIX START ---
  const transactionDate = new Date(date);
  const now = new Date();
  transactionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  // --- TIME FIX END ---

  const session = await mongoose.startSession();
  try {
    let resultTx;

    await session.withTransaction(async () => {
        const customer = await Customer.findById(customerId).session(session);
        if (!customer) { throw new Error('Customer not found'); }

        // 1. Update Customer Balance (Payment reduces debt)
        const oldBalance = customer.currentBalance || 0;
        const newBalance = oldBalance - paymentAmount;
        customer.currentBalance = newBalance;
        await customer.save({ session });

        // 2. Log Transaction
        const transaction = new CustomerTransaction({
            customer: customerId,
            user: userId,
            type: 'Payment',
            description: description || 'Payment Received',
            debit: 0,
            credit: paymentAmount, 
            balance: newBalance,   
            transactionDate: transactionDate,
        });
        resultTx = await transaction.save({ session });
    });

    res.status(201).json(resultTx);

  } catch (error) {
    const message = (error instanceof Error) ? error.message : "Payment failed";
    res.status(500).json({ message });
  } finally {
    session.endSession();
  }
});

// @desc    Update an existing payment
// @route   PUT /api/payments/:id
export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { amount, date, description } = req.body;

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const transaction = await CustomerTransaction.findById(id).session(session);
            if (!transaction) { throw new Error('Transaction not found'); }
            if (transaction.type !== 'Payment') { throw new Error('Only Payment transactions can be edited here'); }

            const customer = await Customer.findById(transaction.customer).session(session);
            if (!customer) { throw new Error('Customer not found'); }

            const oldAmount = transaction.credit;
            const newAmount = parseFloat(amount);

            // 1. Revert old amount, apply new amount
            // Logic: Balance = Balance + OldPayment (Revert) - NewPayment (Apply)
            // Simplified: Balance = Balance - (New - Old)
            const diff = newAmount - oldAmount;
            customer.currentBalance -= diff;
            
            await customer.save({ session });

            // 2. Update Transaction
            transaction.credit = newAmount;
            transaction.description = description;
            
            // Update Date (Keep time if date hasn't changed drastically, else use provided)
            const newDate = new Date(date);
            const now = new Date();
            newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
            transaction.transactionDate = newDate;

            // Note: We are NOT recalculating the 'balance' snapshot of this specific transaction row 
            // or subsequent rows to avoid massive complexity. 
            // We rely on the Customer's Global Current Balance being correct.
            
            await transaction.save({ session });
        });

        res.status(200).json({ message: 'Payment updated successfully' });

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Update failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// @desc    Delete a payment
// @route   DELETE /api/payments/:id
export const deletePayment = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const transaction = await CustomerTransaction.findById(id).session(session);
            if (!transaction) { throw new Error('Transaction not found'); }
            if (transaction.type !== 'Payment') { throw new Error('Only Payment transactions can be deleted here'); }

            const customer = await Customer.findById(transaction.customer).session(session);
            if (!customer) { throw new Error('Customer not found'); }

            // 1. Revert Customer Balance (Add the money back to debt)
            customer.currentBalance += transaction.credit;
            await customer.save({ session });

            // 2. Delete Transaction
            await transaction.deleteOne({ session });
        });

        res.status(200).json({ message: 'Payment deleted successfully' });

    } catch (error) {
        const message = (error instanceof Error) ? error.message : "Delete failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// @desc    Get ledger (transaction history) for a customer
export const getCustomerLedger = asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    
    const customer = await Customer.findById(customerId);
    if (!customer) { res.status(404); throw new Error('Customer not found'); }

    // Fetch transactions sorted OLDEST first so we can recalculate running balance
    const transactions = await CustomerTransaction.find({ customer: customerId })
        .sort({ transactionDate: 1, createdAt: 1 })
        .populate('user', 'username') 
        .populate('invoiceRef', 'invoiceNumber'); 

    // Recalculate running balance from scratch (same logic as PDF generator)
    // This ensures balances are always correct even after payment edits/deletes
    let runningBalance = 0;
    const recalculatedLedger = transactions.map(tx => {
        const txObj = tx.toObject();
        const isInitial = txObj.type === 'Initial Balance';

        if (isInitial) {
            // For initial balance entries, the debit IS the opening balance
            runningBalance += (txObj.debit || 0);
            runningBalance -= (txObj.credit || 0);
        } else if (txObj.debit > 0) {
            runningBalance += txObj.debit;
        } else if (txObj.credit > 0) {
            runningBalance -= txObj.credit;
        }

        txObj.balance = runningBalance;
        return txObj;
    });

    // Return newest first for the frontend display
    recalculatedLedger.reverse();
        
    res.status(200).json({ customer, ledger: recalculatedLedger });
});