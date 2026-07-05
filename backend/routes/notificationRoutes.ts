import { Router, Request, Response, NextFunction } from 'express';
import { getNotifications, markAsRead, markAllRead, deleteNotification, clearAll } from '../controllers/notificationController';
import { requireAttendantAuth, requireOwnerAuth } from '../middleware/authMiddleware';

const router = Router();

// Middleware to authorize either Attendants (via JWT token) or Owners (via PIN header)
function requireNotificationAuth(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-owner-pin'];
  if (pin) {
    return requireOwnerAuth(req, res, next);
  }
  return requireAttendantAuth(req, res, next);
}

router.get('/', requireNotificationAuth, getNotifications);
router.patch('/:id/read', requireNotificationAuth, markAsRead);
router.post('/read-all', requireNotificationAuth, markAllRead);
router.delete('/:id', requireNotificationAuth, deleteNotification);
router.delete('/', requireNotificationAuth, clearAll);

export default router;
