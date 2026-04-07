import express from 'express';
import { 
    createOrder, 
    getOrders, 
    getOrderById, 
    getOrderPdf, 
    updateOrder, 
    completeOrder,
    sendGatePassWhatsApp,
    sendBillWhatsApp,
    cancelOrder 
} from './orderController';
  import { protect, adminOrManager } from '../../middleware/authMiddleware';

const router = express.Router();

// Base Order Routes
router.route('/')
  .post(protect, createOrder)
  .get(protect, getOrders);

// PDF Generation Route
// Kept unprotected or carefully protected to allow external access via link if needed
router.route('/:id/pdf')
  .get(getOrderPdf);

// State Change Routes
router.route('/:id/complete')
    .patch(protect, completeOrder);

router.route('/:id/cancel')
  .patch(protect, adminOrManager, cancelOrder);

// WhatsApp Integration Routes
router.route('/:id/send-gatepass')
    .post(protect, sendGatePassWhatsApp);

router.route('/:id/send-bill')
    .post(protect, sendBillWhatsApp);

// Single Order Operations (Must be defined last to prevent conflicts)
router.route('/:id')
  .get(protect, getOrderById)
  .put(protect, adminOrManager, updateOrder);

export default router;