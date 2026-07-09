import { Request, Response } from 'express';
import Notification from '../models/Notification';

/**
 * Determines who is making the notification request from JWT-based auth.
 * - req.owner  → recipientType: 'admin',     recipientId: tenant ObjectId string
 * - req.attendant → recipientType: 'attendant', recipientId: attendant ObjectId string
 * The X-Owner-Pin fallback has been removed; all callers must use JWT auth.
 */
function getRecipientInfo(req: Request): { recipientId: string; recipientType: 'admin' | 'attendant' } | null {
  if (req.owner) {
    return { recipientId: req.tenant!._id.toString(), recipientType: 'admin' };
  }
  if (req.attendant?.id) {
    return { recipientId: req.attendant.id, recipientType: 'attendant' };
  }
  return null;
}

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) { res.status(401).json({ error: 'Authentication required' }); return; }

    const list = await Notification.find({
      tenantId: req.tenant!._id,
      recipientId: recipient.recipientId,
      recipientType: recipient.recipientType,
    }).sort({ createdAt: -1 }).limit(50);

    res.json(list);
  } catch (error) {
    console.error('[NotificationController] getNotifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) { res.status(401).json({ error: 'Authentication required' }); return; }

    const { id } = req.params;
    const notif = await Notification.findOneAndUpdate(
      { _id: id, tenantId: req.tenant!._id, recipientId: recipient.recipientId, recipientType: recipient.recipientType },
      { read: true },
      { new: true }
    );

    if (!notif) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ success: true, notification: notif });
  } catch (error) {
    console.error('[NotificationController] markAsRead error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
};

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) { res.status(401).json({ error: 'Authentication required' }); return; }

    await Notification.updateMany(
      { tenantId: req.tenant!._id, recipientId: recipient.recipientId, recipientType: recipient.recipientType, read: false },
      { read: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[NotificationController] markAllRead error:', error);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) { res.status(401).json({ error: 'Authentication required' }); return; }

    const { id } = req.params;
    const result = await Notification.deleteOne({
      _id: id,
      tenantId: req.tenant!._id,
      recipientId: recipient.recipientId,
      recipientType: recipient.recipientType,
    });

    if (result.deletedCount === 0) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    console.error('[NotificationController] deleteNotification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

export const clearAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) { res.status(401).json({ error: 'Authentication required' }); return; }

    await Notification.deleteMany({
      tenantId: req.tenant!._id,
      recipientId: recipient.recipientId,
      recipientType: recipient.recipientType,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[NotificationController] clearAll error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
};
