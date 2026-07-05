import { Request, Response } from 'express';
import Notification from '../models/Notification';

// Helper to determine the recipient details from request auth headers
export function getRecipientInfo(req: Request): { recipientId: string; recipientType: 'admin' | 'attendant' } | null {
  // Check if owner pin matches
  const pin = req.headers['x-owner-pin'] as string | undefined;
  const validPin = process.env.OWNER_PIN ?? '1234';
  if (pin && pin === validPin) {
    return { recipientId: 'admin', recipientType: 'admin' };
  }

  // Check if attendant session exists
  if (req.attendant?.id) {
    return { recipientId: req.attendant.id, recipientType: 'attendant' };
  }

  return null;
}

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { recipientId, recipientType } = recipient;
    const list = await Notification.find({ recipientId, recipientType })
      .sort({ createdAt: -1 })
      .limit(50); // SaaS-grade limit

    res.json(list);
  } catch (error) {
    console.error('[NotificationController] getNotifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const notif = await Notification.findOneAndUpdate(
      { _id: id, recipientId: recipient.recipientId, recipientType: recipient.recipientType },
      { read: true },
      { new: true }
    );

    if (!notif) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true, notification: notif });
  } catch (error) {
    console.error('[NotificationController] markAsRead error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
};

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { recipientId, recipientType } = recipient;
    await Notification.updateMany({ recipientId, recipientType, read: false }, { read: true });

    res.json({ success: true });
  } catch (error) {
    console.error('[NotificationController] markAllRead error:', error);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const result = await Notification.deleteOne({
      _id: id,
      recipientId: recipient.recipientId,
      recipientType: recipient.recipientType
    });

    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[NotificationController] deleteNotification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

export const clearAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = getRecipientInfo(req);
    if (!recipient) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { recipientId, recipientType } = recipient;
    await Notification.deleteMany({ recipientId, recipientType });

    res.json({ success: true });
  } catch (error) {
    console.error('[NotificationController] clearAll error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
};
