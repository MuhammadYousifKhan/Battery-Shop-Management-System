import express from 'express';
import { receivePayment, getCustomerLedger, updatePayment, deletePayment } from './paymentController';
import { protect, admin } from '../../middleware/authMiddleware';

const router = express.Router();

router.route('/')
    .post(protect, receivePayment);

router.route('/:id')
    .put(protect, updatePayment)
    .delete(protect, deletePayment);

router.route('/ledger/:customerId')
    .get(protect, getCustomerLedger);

export default router;