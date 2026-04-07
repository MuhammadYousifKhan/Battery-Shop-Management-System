import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import CustomerInvoice from '../../models/CustomerInvoice';
import Billing from '../../models/Billing';
import Customer from '../../models/Customer';
import CustomerTransaction from '../../models/CustomerTransaction';
import { generateCustomerInvoicePDF } from '../../utils/epsonPdfGenerator'; 
import { sendDocumentWhatsApp } from '../../utils/whatsappService';

// 1. Create Invoice (No PDF Generation here)
export const createCustomerInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { customerId, items, previousBalance, subtotal, totalAmount, status } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Fetch Customer Name
        const customer = await Customer.findById(customerId).session(session);
        if (!customer) { res.status(404); throw new Error("Customer not found"); }

        const newInvoice = new CustomerInvoice({
            customerRef: customerId,
            customerName: customer.name,
            items,
            previousBalance,
            subtotal,
            totalAmount,
            status: status || 'draft'
        });

        await newInvoice.save({ session });
        
        // Update Bills to 'invoiced'
        const billIds = items.map((i: any) => i.billRef);
        await Billing.updateMany(
            { _id: { $in: billIds } },
            { $set: { status: 'invoiced', customerInvoiceRef: newInvoice._id } },
            { session }
        );

        // Create ledger entry for the invoice
        // Update customer balance (invoice adds to balance)
        const updatedCustomer = await Customer.findByIdAndUpdate(
            customerId,
            { $inc: { currentBalance: totalAmount } },
            { new: true, session }
        );

        if (updatedCustomer) {
            await CustomerTransaction.create([{
                customer: customerId,
                user: userId,
                type: 'Invoice',
                description: `Invoice #${newInvoice.invoiceNumber || String((newInvoice as any)._id).slice(-6)}`,
                debit: totalAmount,
                credit: 0,
                balance: updatedCustomer.currentBalance,
                invoiceRef: (newInvoice as any)._id
            }], { session });
        }

        await session.commitTransaction();
        res.status(201).json(newInvoice);
    } catch (error) {
        await session.abortTransaction();
        const message = (error instanceof Error) ? error.message : "Invoice creation failed";
        res.status(500).json({ message });
    } finally {
        session.endSession();
    }
});

// 2. Get All Invoices
export const getAllCustomerInvoices = async (req: Request, res: Response) => {
    try {
        const invoices = await CustomerInvoice.find().sort({ date: -1 });
        res.status(200).json(invoices);
    } catch (error) { res.status(500).json({ message: "Error fetching invoices" }); }
};

// 3. Get Unbilled Items
export const getUnbilledBillsForCustomer = async (req: Request, res: Response) => {
    try {
        const { customerId } = req.params;
        const customer = await Customer.findById(customerId);
        if (!customer) return res.status(404).json({ message: "Customer not found" });
        
        // Find bills that are 'paid' but not yet 'invoiced'
        const unbilledBills = await Billing.find({ 
            customerRef: customerId, 
            $or: [{ customerInvoiceRef: null }, { status: 'paid' }] 
        });
        
        res.status(200).json({ customer, unbilledBills });
    } catch (error) { res.status(500).json({ message: "Error fetching bills" }); }
};

// 4. STREAM PDF (This fixes the type error)
export const getCustomerInvoicePdf = async (req: Request, res: Response) => {
    try {
        const invoice = await CustomerInvoice.findById(req.params.id).populate('customerRef', 'phone').lean();
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });

        // Attach customer phone for PDF
        // @ts-ignore
        if (invoice.customerRef?.phone) invoice.customerPhone = invoice.customerRef.phone;

        // @ts-ignore
        generateCustomerInvoicePDF(res, invoice);

    } catch (error) {
        console.error(error);
        if (!res.headersSent) res.status(500).send("Server Error");
    }
};

// 5. Send WhatsApp
export const sendInvoiceWhatsApp = async (req: Request, res: Response) => {
    try {
        // Fetch Invoice & Populate Customer to get Phone
        const invoice = await CustomerInvoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        
        const customer = await Customer.findById(invoice.customerRef);
        if (!customer || !customer.phone) {
            return res.status(400).json({ message: "Customer phone number not found." });
        }

        // Use Vercel URL for publicly accessible PDF
        const baseUrl = process.env.BASE_URL || 'https://your-app.vercel.app';
        const pdfUrl = `${baseUrl}/api/customer-invoices/${invoice._id}/pdf`;

        const sent = await sendDocumentWhatsApp(
            customer.phone,
            pdfUrl,
            customer.name,
            'Invoice',
            `Invoice_${invoice.invoiceNumber}.pdf`
        );
        
        if(sent) {
            res.status(200).json({ message: "Invoice Sent Successfully" });
        } else {
            res.status(500).json({ message: "Failed to send WhatsApp message" });
        }

    } catch (err: any) { 
        res.status(500).json({ message: err.message }); 
    }
};