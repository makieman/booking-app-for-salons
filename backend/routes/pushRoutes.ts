import { Router } from 'express';
import { getVapidKey, subscribe, unsubscribe, subscribeAdmin, unsubscribeAdmin, updatePreferences, subscribeAttendant, unsubscribeAttendant } from '../controllers/pushController';
import { requireAttendantAuth } from '../middleware/authMiddleware';

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

// PATCH  /api/push/preferences      — updates the sound preference of an existing subscription
router.patch('/preferences', updatePreferences);

// POST   /api/push/subscribe-attendant  — saves an attendant push subscription
router.post('/subscribe-attendant', requireAttendantAuth, subscribeAttendant);

// DELETE /api/push/unsubscribe-attendant — removes an attendant push subscription
router.delete('/unsubscribe-attendant', requireAttendantAuth, unsubscribeAttendant);

export default router;
