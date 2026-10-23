import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';
import { sendDirectTestPush } from '../services/pushService';

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
 * Upserts a customer push subscription scoped to this tenant and role='customer'.
 */
export const subscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys, customerPhone } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth || !customerPhone) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, keys.auth, and customerPhone are required' });
      return;
    }

    const normalizedPhone = normalizeKenyanPhone(customerPhone) || customerPhone.trim();

    await PushSubscription.findOneAndUpdate(
      { endpoint, role: 'customer', attendantId: null },
      {
        endpoint,
        keys,
        customerPhone: normalizedPhone,
        role: 'customer',
        attendantId: null,
        tenantId: req.tenant!._id,
      },
      { upsert: true, new: true, runValidators: true },
    );
    res.status(201).json({ success: true, phone: normalizedPhone });
  } catch (error) {
    console.error('[pushController] subscribe error:', error);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
};

/**
 * DELETE /api/push/unsubscribe
 * Removes only the customer push subscription for this endpoint.
 */
export const unsubscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) { res.status(400).json({ error: 'endpoint is required' }); return; }
    await PushSubscription.deleteOne({ endpoint, role: 'customer', tenantId: req.tenant!._id });
    res.json({ success: true });
  } catch (error) {
    console.error('[pushController] unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
};

/**
 * POST /api/push/subscribe-admin
 * Upserts an admin push subscription scoped to this tenant and role='admin'.
 */
export const subscribeAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys, employeeId, soundPreference } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
      return;
    }
    const updateObj: any = {
      endpoint,
      keys,
      role: 'admin',
      attendantId: null,
      tenantId: req.tenant!._id,
    };
    if (employeeId !== undefined) updateObj.employeeId = employeeId;
    if (soundPreference !== undefined) updateObj.soundPreference = soundPreference;

    await PushSubscription.findOneAndUpdate(
      { endpoint, role: 'admin', attendantId: null },
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
 * Removes only the admin push subscription for this endpoint.
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
    const { endpoint, soundPreference, role } = req.body;
    if (!endpoint || !soundPreference) {
      res.status(400).json({ error: 'endpoint and soundPreference are required' });
      return;
    }
    const filter: any = { endpoint, tenantId: req.tenant!._id };
    if (role) filter.role = role;

    const sub = await PushSubscription.findOneAndUpdate(
      filter,
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
 * Upserts an attendant push subscription scoped to this tenant and attendantId.
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
      { endpoint, role: 'attendant', attendantId },
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

/**
 * POST /api/push/test
 * Authenticated test push endpoint. Sends a test push to the caller's subscription or specified endpoint.
 * Returns per-subscription delivery results.
 */
export const testPush = async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;
    const tenantOid = req.tenant!._id;

    const query: any = { tenantId: tenantOid };
    if (endpoint) {
      query.endpoint = endpoint;
    } else if (req.attendant) {
      query.role = 'attendant';
      query.attendantId = req.attendant.id;
    } else if (req.owner) {
      query.role = 'admin';
    }

    const subscriptions = await PushSubscription.find(query);
    if (subscriptions.length === 0) {
      res.status(404).json({
        error: 'No active push subscriptions found for this account/endpoint',
        results: [],
      });
      return;
    }

    const testPayload = {
      title: 'Flo Sisterlocks Test',
      body: 'Push notification received successfully! Sound & delivery verified.',
      url: req.owner ? `/${req.tenant!.slug}/admin` : req.attendant ? `/${req.tenant!.slug}/staff` : '/',
      sound: (subscriptions[0].soundPreference || 'default') as any,
    };

    const results = await Promise.all(
      subscriptions.map((sub) =>
        sendDirectTestPush(
          { endpoint: sub.endpoint, keys: sub.keys, soundPreference: sub.soundPreference },
          testPayload
        )
      )
    );

    res.json({
      success: results.some((r) => r.status === 'delivered'),
      results,
    });
  } catch (error) {
    console.error('[pushController] testPush error:', error);
    res.status(500).json({ error: 'Failed to send test push notification' });
  }
};
