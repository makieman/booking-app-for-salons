import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';

/**
 * GET /api/push/vapid-key
 * Returns the VAPID public key — no auth required.
 */
export const getVapidKey = (_req: Request, res: Response): void => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) { res.status(500).json({ error: 'VAPID_PUBLIC_KEY is not configured' }); return; }
  res.json({ publicKey });
};

/**
 * POST /api/push/subscribe
 * Upserts a customer push subscription scoped to this tenant.
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
      { endpoint, keys, customerPhone, role: 'customer', tenantId: req.tenant!._id },
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
 */
export const unsubscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) { res.status(400).json({ error: 'endpoint is required' }); return; }
    await PushSubscription.deleteOne({ endpoint, tenantId: req.tenant!._id });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
};

/**
 * POST /api/push/subscribe-admin
 * Upserts an admin push subscription scoped to this tenant.
 */
export const subscribeAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys, employeeId, soundPreference } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
      return;
    }
    const updateObj: any = { endpoint, keys, role: 'admin', tenantId: req.tenant!._id };
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
 */
export const unsubscribeAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) { res.status(400).json({ error: 'endpoint is required' }); return; }
    await PushSubscription.deleteOne({ endpoint, role: 'admin', tenantId: req.tenant!._id });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribeAdmin error:', error);
    res.status(500).json({ error: 'Failed to remove admin push subscription' });
  }
};

/**
 * PATCH /api/push/preferences
 */
export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, soundPreference } = req.body;
    if (!endpoint || !soundPreference) {
      res.status(400).json({ error: 'endpoint and soundPreference are required' });
      return;
    }
    const sub = await PushSubscription.findOneAndUpdate(
      { endpoint, tenantId: req.tenant!._id },
      { soundPreference },
      { new: true, runValidators: true }
    );
    if (!sub) { res.status(404).json({ error: 'Push subscription not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] updatePreferences error:', error);
    res.status(500).json({ error: 'Failed to update push subscription preferences' });
  }
};

/**
 * POST /api/push/subscribe-attendant
 * Upserts an attendant push subscription scoped to this tenant.
 */
export const subscribeAttendant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys } = req.body;
    const attendantId = req.attendant?.id;
    if (!attendantId) { res.status(401).json({ error: 'Attendant authentication required' }); return; }
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
      return;
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, role: 'attendant', attendantId, tenantId: req.tenant!._id },
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
 */
export const unsubscribeAttendant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    const attendantId = req.attendant?.id;
    if (!attendantId) { res.status(401).json({ error: 'Attendant authentication required' }); return; }
    if (!endpoint) { res.status(400).json({ error: 'endpoint is required' }); return; }
    await PushSubscription.deleteOne({ endpoint, role: 'attendant', attendantId, tenantId: req.tenant!._id });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribeAttendant error:', error);
    res.status(500).json({ error: 'Failed to remove attendant push subscription' });
  }
};
