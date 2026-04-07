import express from 'express';
import { 
    createCustomerInvoice, 
    getAllCustomerInvoices, 
    getUnbilledBillsForCustomer,
    sendInvoiceWhatsApp,
    getCustomerInvoicePdf // <--- This must be imported
} from './customerInvoiceController';

const router = express.Router();

router.post('/', createCustomerInvoice);
router.get('/', getAllCustomerInvoices);
router.get('/unbilled/:customerId', getUnbilledBillsForCustomer);
router.post('/:id/send-whatsapp', sendInvoiceWhatsApp);

// This is the route the Frontend calls to print
router.get('/:id/pdf', getCustomerInvoicePdf); 

export default router;