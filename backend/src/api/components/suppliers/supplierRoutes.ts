import express from 'express';
import { 
    getSuppliers, 
    createSupplier, 
    updateSupplier, 
    deleteSupplier,
    addSupplierPayment, 
    getSupplierLedger, 
    getSupplierLedgerPdf, 
    getPaymentPdf 
} from './supplierController';
import { protect, admin, adminOrManager } from '../../middleware/authMiddleware';

const router = express.Router();

// --- MANAGER ACCESS ---
// Managers need to fetch the list of suppliers for dropdowns in Claims/Products
router.get('/', protect, getSuppliers); 

// Managers usually need to check ledgers
router.get('/:id/ledger', protect, getSupplierLedger); 
router.get('/:id/ledger/pdf', protect, getSupplierLedgerPdf);
router.get('/payment/:paymentId/pdf', protect, getPaymentPdf);

// --- ADMIN ONLY ACTIONS ---
router.post('/', protect, adminOrManager, createSupplier);
router.route('/:id')
    .put(protect, admin, updateSupplier)
    .delete(protect, admin, deleteSupplier);

router.post('/:id/payment', protect, admin, addSupplierPayment);

export default router;