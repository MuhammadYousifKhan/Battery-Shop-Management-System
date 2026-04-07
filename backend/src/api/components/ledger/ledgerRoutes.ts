import express from 'express';
import { 
    getCustomerLedgerPdf, 
    sendLedgerWhatsApp 
} from './ledgerController';
import { protect } from '../../middleware/authMiddleware';

const router = express.Router();

// PDF Generation Route
// Example URL: GET /api/ledger/:customerId/pdf?startDate=2023-01-01&endDate=2023-01-31
// Note: If you want this link to be clickable in WhatsApp without login, remove 'protect'.
// Otherwise, the user will need to be logged in to view the PDF.
router.route('/:customerId/pdf')
    .get(getCustomerLedgerPdf); 

// WhatsApp Sending Route
// Example URL: POST /api/ledger/:customerId/whatsapp
router.route('/:customerId/whatsapp')
    .post(protect, sendLedgerWhatsApp);

export default router;