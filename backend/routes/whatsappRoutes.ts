import express from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/webhookController';

const router = express.Router();

/**
 * GET /api/whatsapp/webhook
 * Meta one-time verification handshake. Must echo hub.challenge if
 * hub.verify_token matches WHATSAPP_WEBHOOK_TOKEN in .env.
 */
router.get('/webhook', verifyWebhook);

/**
 * POST /api/whatsapp/webhook
 * Receives inbound messages from Meta Cloud API.
 * - X-Hub-Signature-256 is verified inside handleIncomingMessage
 * - Tenant is resolved from payload.entry[].changes[].value.metadata.phone_number_id
 * - No X-Tenant-Slug needed (this route is excluded from resolveTenant middleware)
 */
router.post('/webhook', handleIncomingMessage);

export default router;
