import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Customer from '../../models/Customer';
import CustomerTransaction from '../../models/CustomerTransaction';
import Billing from '../../models/Billing'; 
import Order from '../../models/Order';     
import { sendWelcomeWhatsApp } from '../../utils/whatsappService';

// --- Strict Phone Normalizer (Pakistan mobile only) ---
const normalizePakistaniPhone = (phone: string | undefined): string | null => {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('92') && clean.length === 12) return clean;
    if (clean.startsWith('03') && clean.length === 11) return `92${clean.substring(1)}`;
    if (clean.startsWith('3') && clean.length === 10) return `92${clean}`;
    return null;
};

// @desc    Get all customers (With Search & Filter)
export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { type, search } = req.query;
  
  let filter: any = {};

  // 1. Filter by Type (if provided)
  if (type) {
      filter.type = type;
  }

  // 2. Search by Name or Phone (if provided)
  if (search) {
      const searchRegex = { $regex: search, $options: 'i' }; // Case insensitive
      filter.$or = [
          { name: searchRegex },
          { phone: searchRegex }
      ];
  }

  // Fetch customers based on the combined filter
  const customers = await Customer.find(filter).sort({ createdAt: -1 }); 
  res.status(200).json(customers);
});

export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
    const customer = await Customer.findById(req.params.id);
    if (customer) {
        res.json(customer);
    } else {
        res.status(404);
        throw new Error('Customer not found');
    }
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, email, type, address, shopName, shopAddress, openingBalance } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const normalizedPhone = normalizePakistaniPhone(phone);
        if (!normalizedPhone) {
            await session.abortTransaction();
            session.endSession();
            res.status(400).json({
                message: 'Invalid phone number. Use Pakistan mobile format (03XXXXXXXXX).'
            });
            return;
        }

        const phoneQuery = { phone: normalizedPhone };

        const customerExists = await Customer.findOne(phoneQuery).session(session);
        if (customerExists) {
            await session.abortTransaction();
            session.endSession();
            res.status(409).json({
                message: 'Customer with this phone number already exists',
                duplicateOf: {
                    name: customerExists.name,
                    phone: customerExists.phone,
                    type: customerExists.type,
                    address: customerExists.address || '',
                    currentBalance: customerExists.currentBalance || 0,
                }
            });
            return;
        }

        const initialBal = openingBalance ? parseFloat(openingBalance) : 0;

        const customer = new Customer({
            name, phone: normalizedPhone, email, type, address,
            shopName: type === 'wholesale' ? shopName : undefined, 
            shopAddress: type === 'wholesale' ? shopAddress : undefined,
            initialBalance: initialBal, 
            currentBalance: initialBal 
        });

        const createdCustomer = await customer.save({ session });

        // Create Ledger Entry for Opening Balance
        if (initialBal !== 0) {
            await CustomerTransaction.create([{
                customer: createdCustomer._id,
                user: userId,
                type: 'Initial Balance', 
                description: 'Initial Balance', 
                debit: initialBal > 0 ? initialBal : 0,  
                credit: initialBal < 0 ? Math.abs(initialBal) : 0, 
                balance: initialBal,
                transactionDate: new Date()
            }], { session });
        }

        await session.commitTransaction();

        // --- 🚀 AUTOMATIC WELCOME MESSAGE (WHOLESALE ONLY) ---
        if (createdCustomer.type === 'wholesale' && createdCustomer.phone) {
            sendWelcomeWhatsApp(createdCustomer.phone, createdCustomer.name)
                .catch((err: any) => console.error("Failed to send welcome WhatsApp:", err.message));
        }
        // ----------------------------------------------------

        res.status(201).json(createdCustomer);

    } catch (error: any) {
        await session.abortTransaction();
        // Handle MongoDB duplicate key error (E11000)
        if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
            const match = error.message?.match(/dup key: \{ (.+?) \}/);
            res.status(409).json({
                message: `Customer with this phone number already exists. ${match ? match[1] : ''}`,
                duplicateOf: null
            });
            return;
        }
        throw error;
    } finally {
        session.endSession();
    }
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, email, type, address, shopName, shopAddress, openingBalance } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const customer = await Customer.findById(req.params.id).session(session);
        if (!customer) {
            res.status(404); throw new Error('Customer not found');
        }

        // ✅ SAFETY CHECK: If phone is changing, validate and ensure unique
        const hasPhoneInPayload = phone !== undefined;
        const normalizedPhone = hasPhoneInPayload ? normalizePakistaniPhone(phone) : null;

        if (hasPhoneInPayload && !normalizedPhone) {
            await session.abortTransaction();
            session.endSession();
            res.status(400).json({
                message: 'Invalid phone number. Use Pakistan mobile format (03XXXXXXXXX).'
            });
            return;
        }

        const isSamePhone = normalizedPhone ? normalizedPhone === customer.phone : true;

        if (normalizedPhone && !isSamePhone) {
            const updatePhoneQuery = { phone: normalizedPhone, _id: { $ne: customer._id } };

            const phoneExists = await Customer.findOne(updatePhoneQuery).session(session);
            if (phoneExists) {
                await session.abortTransaction();
                session.endSession();
                res.status(409).json({
                    message: 'This phone number is already in use by another customer',
                    duplicateOf: {
                        name: phoneExists.name,
                        phone: phoneExists.phone,
                        type: phoneExists.type,
                        address: phoneExists.address || '',
                        currentBalance: phoneExists.currentBalance || 0,
                    }
                });
                return;
            }
        }

        // --- 1. HANDLE INITIAL BALANCE UPDATE (The "Udhaar" Fix) ---
        if (openingBalance !== undefined && openingBalance !== null && openingBalance !== '') {
            const newOpeningBal = parseFloat(openingBalance);
            const oldOpeningBal = customer.initialBalance || 0;

            if (newOpeningBal !== oldOpeningBal) {
                const initTx = await CustomerTransaction.findOne({
                    customer: customer._id,
                    $or: [
                        { type: 'Initial Balance' },
                        { description: 'Initial Balance' },
                        { description: 'Opening Balance' },
                        { description: 'Opening Balance (Legacy Fix)' }
                    ]
                }).session(session);

                if (initTx) {
                    initTx.debit = newOpeningBal > 0 ? newOpeningBal : 0;
                    initTx.credit = newOpeningBal < 0 ? Math.abs(newOpeningBal) : 0;
                    initTx.balance = newOpeningBal;
                    initTx.description = 'Initial Balance'; 
                    initTx.type = 'Initial Balance';
                    
                    if (customer.createdAt) {
                        initTx.transactionDate = customer.createdAt;
                    }
                    
                    await initTx.save({ session });
                    customer.currentBalance = (customer.currentBalance || 0) - oldOpeningBal + newOpeningBal;
                } else {
                    const allTx = await CustomerTransaction.find({ customer: customer._id }).session(session);
                    const ledgerSum = allTx.reduce((acc, tx) => acc + (tx.debit || 0) - (tx.credit || 0), 0);

                    if (newOpeningBal !== 0) {
                        await CustomerTransaction.create([{
                            customer: customer._id,
                            user: userId,
                            type: 'Initial Balance',
                            description: 'Initial Balance', 
                            debit: newOpeningBal > 0 ? newOpeningBal : 0,
                            credit: newOpeningBal < 0 ? Math.abs(newOpeningBal) : 0,
                            balance: newOpeningBal,
                            transactionDate: customer.createdAt || new Date() 
                        }], { session });
                    }
                    customer.currentBalance = ledgerSum + newOpeningBal;
                }
                customer.initialBalance = newOpeningBal;
            }
        }

        // --- 2. UPDATE OTHER FIELDS ---
        customer.name = name || customer.name;
        if (hasPhoneInPayload && normalizedPhone) customer.phone = normalizedPhone;
        customer.email = email !== undefined ? email : customer.email;
        customer.type = type || customer.type;
        customer.address = address !== undefined ? address : customer.address;

        if (customer.type === 'wholesale') {
            customer.shopName = shopName || customer.shopName;
            customer.shopAddress = shopAddress || customer.shopAddress;
        } else {
            customer.shopName = undefined;
            customer.shopAddress = undefined;
        }

        const updatedCustomer = await customer.save({ session });
        await session.commitTransaction();
        res.json(updatedCustomer);

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// 🚀 UPDATED: Delete Customer with Safety Check
export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
        res.status(404);
        throw new Error('Customer not found');
    }

    // SAFETY CHECK: Prevent deleting if they owe money or have credit
    if (customer.currentBalance !== 0) {
        res.status(400);
        throw new Error(`Cannot delete. Customer has a balance of Rs ${customer.currentBalance}. Clear balance first.`);
    }

    await customer.deleteOne();
    
    // Cleanup: Optionally delete their transactions if you want a clean slate
    await CustomerTransaction.deleteMany({ customer: customer._id });

    res.json({ message: 'Customer removed successfully' });
});

export const getPurchasedItems = asyncHandler(async (req: Request, res: Response) => {
    const customerId = req.params.id;
    const customer = await Customer.findById(customerId);
    if (!customer) { res.status(404); throw new Error('Customer not found'); }

    const orders = await Order.find({ customerRef: customerId }).select('items createdAt _id');
    const bills = await Billing.find({
        $or: [{ customerRef: customerId }, { customerName: customer.name }]
    }).select('items createdAt _id');

    let allItems: any[] = [];
    orders.forEach(order => {
        order.items.forEach(item => {
            allItems.push({ source: 'Order', sourceId: order._id, date: order.createdAt, productRef: item.productRef, productName: item.productName, quantity: item.quantity, serialNumber: item.chassisNumber || '' });
        });
    });
    bills.forEach(bill => {
        bill.items.forEach(item => {
            allItems.push({ source: 'Bill', sourceId: bill._id, date: bill.createdAt, productRef: item.productRef, productName: item.productName, quantity: item.quantity, serialNumber: item.chassisNumber || '' });
        });
    });
    allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(allItems);
});