import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';

/**
 * GET /api/push/vapid-key
 * Returns the VAPID public key so the frontend can subscribe to push notifications.
 */
export const getVapidKey = (_req: Request, res: Response): void => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    res.status(500).json({ error: 'VAPID_PUBLIC_KEY is not configured on the server' });
    return;
  }
  res.json({ publicKey });
};

/**
 * POST /api/push/subscribe
 * Upserts a push subscription for a customer identified by phone number.
 * Body: { endpoint, keys: { p256dh, auth }, customerPhone }
 */
export const subscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys, customerPhone } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth || !customerPhone) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, keys.auth, and customerPhone are required' });
      return;
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, customerPhone },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('[pushController] subscribe error:', error);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
};

/**
 * DELETE /api/push/unsubscribe
 * Removes a push subscription by endpoint.
 * Body: { endpoint }
 */
export const unsubscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }

    await PushSubscription.deleteOne({ endpoint });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
};
