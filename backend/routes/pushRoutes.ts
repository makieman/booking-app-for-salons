import { Router } from 'express';
import { getVapidKey, subscribe, unsubscribe } from '../controllers/pushController';

const router = Router();

// GET  /api/push/vapid-key   — returns the VAPID public key for the frontend
router.get('/vapid-key', getVapidKey);

// POST /api/push/subscribe   — saves a new or updated push subscription
router.post('/subscribe', subscribe);

// DELETE /api/push/unsubscribe — removes a push subscription
router.delete('/unsubscribe', unsubscribe);

export default router;
