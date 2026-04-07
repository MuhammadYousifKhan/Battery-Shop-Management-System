import express from 'express';
import { 
    createBill, 
    getBills, 
    getBillPdf, 
    cancelBill, 
    updateBill, 
    markAsPaid, 
    markAsUnpaid, 
    addBillPayment, 
    getPaymentReminders,
    sendBillWhatsApp
} from './billingController';
import { protect } from '../../middleware/authMiddleware';

const router = express.Router();

// @route   GET /api/billing
// @desc    Get all bills
// @access  Private
router.get('/', protect, getBills);

// @route   GET /api/billing/reminders
// @desc    Get bills with pending balance & due dates
// @access  Private
router.get('/reminders', protect, getPaymentReminders);

// @route   POST /api/billing
// @desc    Create a new bill (Supports Partial Payment & Due Date)
// @access  Private
router.post('/', protect, createBill);

// @route   PUT /api/billing/:id
// @desc    Update a bill
// @access  Private
router.put('/:id', protect, updateBill);

// @route   GET /api/billing/:id/pdf
// @desc    Download Bill PDF
// @access  Public (no auth — required for WAB2C to fetch PDF via link)
router.get('/:id/pdf', getBillPdf);

// @route   PUT /api/billing/:id/cancel
// @desc    Cancel a bill and revert stock
// @access  Private
router.put('/:id/cancel', protect, cancelBill);

// @route   PUT /api/billing/:id/payment
// @desc    Add a generic payment (Installment/Remaining Balance)
// @access  Private
router.put('/:id/payment', protect, addBillPayment);

// @route   PUT /api/billing/:id/paid
// @desc    Quickly mark as Fully Paid
// @access  Private
router.put('/:id/paid', protect, markAsPaid);

// @route   PUT /api/billing/:id/unpaid
// @desc    Mark as Unpaid
// @access  Private
router.put('/:id/unpaid', protect, markAsUnpaid);

// @route   POST /api/billing/:id/send-whatsapp
// @desc    Send bill via WhatsApp
router.post('/:id/send-whatsapp', protect, sendBillWhatsApp);

export default router;