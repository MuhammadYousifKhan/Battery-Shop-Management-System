import express from 'express';
import { 
    createInvoice, 
    getInvoices, 
    updateInvoiceToPaid, 
    updateInvoice,
    completeInvoice, 
    cancelInvoice, // <--- Import this
    getInvoicePdf 
} from './invoiceController'; 
import { protect, admin, adminOrManager } from '../../middleware/authMiddleware';

const router = express.Router();

router.route('/')
    .get(protect, adminOrManager, getInvoices)
    .post(protect, adminOrManager, createInvoice);

// PDF Route
router.route('/:id/pdf')
    .get(protect, adminOrManager, getInvoicePdf);

// Actions
router.patch('/:id/complete', protect, adminOrManager, completeInvoice);
router.patch('/:id/cancel', protect, adminOrManager, cancelInvoice); // <--- Add this Route

router.route('/:id') 
    .put(protect, adminOrManager, updateInvoice);

router.patch('/:id/pay', protect, admin, updateInvoiceToPaid);

export default router;