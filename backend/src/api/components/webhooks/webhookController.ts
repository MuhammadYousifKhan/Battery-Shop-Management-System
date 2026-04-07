import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import MessageLog from '../../models/MessageLog';

// POST webhook receiver for WhatsApp status updates
export const handleWhatsAppWebhook = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;

  // Meta-style nested structure: entry[].changes[].value.statuses[]
  if (body && body.entry && Array.isArray(body.entry)) {
    try {
      for (const entry of body.entry) {
        if (!entry.changes || !Array.isArray(entry.changes)) continue;
        for (const change of entry.changes) {
          const val = change.value;
          if (!val || !val.statuses || !Array.isArray(val.statuses)) continue;
          for (const statusObj of val.statuses) {
            const messageId = statusObj.id || statusObj.message_id || statusObj.messageId;
            let status = (statusObj.status || '').toString();
            let errorMessage = '';

            // Try to extract phone/wa_id from payload: prefer contacts[].wa_id, then recipient_id
            let phone: string | undefined;
            try {
              phone = (
                (val && (val.contacts && val.contacts[0] && val.contacts[0].wa_id)) ||
                statusObj.recipient_id ||
                statusObj.recipient ||
                undefined
              );
            } catch (e) {
              phone = undefined;
            }

            if (status === 'failed') {
              const error = statusObj.errors ? statusObj.errors[0] : null;
              errorMessage = error ? (error.title || error.message || JSON.stringify(error)) : 'Unknown error';
              // Map provider blocking codes/messages to 'blocked'
              if (error?.code === 131047 || (errorMessage && errorMessage.toLowerCase().includes('spam'))) {
                status = 'blocked';
              }
            }

            if (messageId) {
              const update: any = { status, errorMessage };
              if (phone) update.phone = phone;

              await MessageLog.findOneAndUpdate(
                { messageId },
                { $set: update },
                { upsert: true }
              );
            }
          }
        }
      }
    } catch (err) {
      console.error('Webhook processing error:', err);
    }
  }

  // Respond quickly with 200 so provider doesn't retry
  res.status(200).send('EVENT_RECEIVED');
});

export const verifyWebhook = (req: Request, res: Response) => {
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'battery_store_webhook_123';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge as any);
  } else {
    res.sendStatus(403);
  }
};
