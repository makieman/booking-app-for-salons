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
      { endpoint, keys, customerPhone, role: 'customer' },
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

/**
 * POST /api/push/subscribe-admin
 * Upserts a push subscription for an admin device.
 * Body: { endpoint, keys: { p256dh, auth }, employeeId?, soundPreference? }
 */
export const subscribeAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys, employeeId, soundPreference } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
      return;
    }

    const updateObj: any = { endpoint, keys, role: 'admin' };
    if (employeeId !== undefined) updateObj.employeeId = employeeId;
    if (soundPreference !== undefined) updateObj.soundPreference = soundPreference;

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      updateObj,
      { upsert: true, new: true, runValidators: true },
    );

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('[pushController] subscribeAdmin error:', error);
    res.status(500).json({ error: 'Failed to save admin push subscription' });
  }
};

/**
 * DELETE /api/push/unsubscribe-admin
 * Removes an admin push subscription by endpoint.
 * Body: { endpoint }
 */
export const unsubscribeAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }

    await PushSubscription.deleteOne({ endpoint, role: 'admin' });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribeAdmin error:', error);
    res.status(500).json({ error: 'Failed to remove admin push subscription' });
  }
};

/**
 * PATCH /api/push/preferences
 * Body: { endpoint, soundPreference }
 */
export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, soundPreference } = req.body;

    if (!endpoint || !soundPreference) {
      res.status(400).json({ error: 'endpoint and soundPreference are required' });
      return;
    }

    const sub = await PushSubscription.findOneAndUpdate(
      { endpoint },
      { soundPreference },
      { new: true, runValidators: true }
    );

    if (!sub) {
      res.status(404).json({ error: 'Push subscription not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] updatePreferences error:', error);
    res.status(500).json({ error: 'Failed to update push subscription preferences' });
  }
};

/**
 * POST /api/push/subscribe-attendant
 * Upserts a push subscription for an attendant.
 * Body: { endpoint, keys: { p256dh, auth } }
 * Requires req.attendant to be set by authMiddleware.
 */
export const subscribeAttendant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys } = req.body;
    const attendantId = req.attendant?.id;

    if (!attendantId) {
      res.status(401).json({ error: 'Attendant authentication required' });
      return;
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
      return;
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, role: 'attendant', attendantId },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('[pushController] subscribeAttendant error:', error);
    res.status(500).json({ error: 'Failed to save attendant push subscription' });
  }
};

/**
 * DELETE /api/push/unsubscribe-attendant
 * Removes an attendant push subscription by endpoint.
 * Body: { endpoint }
 * Requires req.attendant to be set by authMiddleware.
 */
export const unsubscribeAttendant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    const attendantId = req.attendant?.id;

    if (!attendantId) {
      res.status(401).json({ error: 'Attendant authentication required' });
      return;
    }

    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }

    await PushSubscription.deleteOne({ endpoint, role: 'attendant', attendantId });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribeAttendant error:', error);
    res.status(500).json({ error: 'Failed to remove attendant push subscription' });
  }
};
