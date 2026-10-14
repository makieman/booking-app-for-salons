import { Router, Request, Response, NextFunction } from 'express';
import { getNotifications, markAsRead, markAllRead, deleteNotification, clearAll } from '../controllers/notificationController';
import { requireAttendantAuth, requireOwnerAuth } from '../middleware/authMiddleware';

import jwt from 'jsonwebtoken';

const router = Router();

// Middleware to authorize either Attendants or Owners (via JWT Bearer token or legacy PIN)
function requireNotificationAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.decode(token) as { role?: string } | null;
      if (decoded && decoded.role === 'owner') {
        return requireOwnerAuth(req, res, next);
      }
    } catch {
      // Fall through to requireAttendantAuth to handle standard verification/error response
    }
    return requireAttendantAuth(req, res, next);
  }

  const pin = req.headers['x-owner-pin'];
  if (pin) {
    return requireOwnerAuth(req, res, next);
  }

  res.status(401).json({ error: 'Authentication required' });
}

router.get('/', requireNotificationAuth, getNotifications);
router.patch('/:id/read', requireNotificationAuth, markAsRead);
router.post('/read-all', requireNotificationAuth, markAllRead);
router.delete('/:id', requireNotificationAuth, deleteNotification);
router.delete('/', requireNotificationAuth, clearAll);

export default router;
