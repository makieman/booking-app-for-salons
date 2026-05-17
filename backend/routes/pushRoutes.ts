import { Router } from 'express';
import { getVapidKey, subscribe, unsubscribe, subscribeAdmin, unsubscribeAdmin } from '../controllers/pushController';

const router = Router();

// GET  /api/push/vapid-key        — returns the VAPID public key for the frontend
router.get('/vapid-key', getVapidKey);

// POST   /api/push/subscribe        — saves a customer push subscription
router.post('/subscribe', subscribe);

// DELETE /api/push/unsubscribe      — removes a customer push subscription
router.delete('/unsubscribe', unsubscribe);

// POST   /api/push/subscribe-admin  — saves an admin push subscription
router.post('/subscribe-admin', subscribeAdmin);

// DELETE /api/push/unsubscribe-admin — removes an admin push subscription
router.delete('/unsubscribe-admin', unsubscribeAdmin);

export default router;

