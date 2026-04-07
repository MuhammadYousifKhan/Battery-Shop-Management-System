import express from 'express';
import { handleWhatsAppWebhook, verifyWebhook } from './webhookController';

const router = express.Router();

router.get('/whatsapp', verifyWebhook);
router.post('/whatsapp', express.json(), handleWhatsAppWebhook);

export default router;
