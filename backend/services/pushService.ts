import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';
import NotificationModel from '../models/Notification';
import mongoose from 'mongoose';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';

// ── VAPID lazy initialisation
let _vapidInitialised = false;

function ensureVapid(): void {
  if (_vapidInitialised) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const mailto     = process.env.VAPID_MAILTO;
  if (!publicKey || !privateKey || !mailto) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_MAILTO must all be set');
  }
  webpush.setVapidDetails(mailto, publicKey, privateKey);
  _vapidInitialised = true;
}

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  sound?: 'default' | 'chime' | 'bell' | 'ding' | 'silent';
}

export interface PushResult {
  endpoint: string;
  status: 'delivered' | 'failed';
  statusCode?: number;
  error?: string;
}

/**
 * Sends a single test push to a specific subscription object and returns the result.
 */
export async function sendDirectTestPush(
  sub: { endpoint: string; keys: { p256dh: string; auth: string }; soundPreference?: any },
  payload: PushPayload,
): Promise<PushResult> {
  ensureVapid();
  let host = 'unknown';
  try {
    host = new URL(sub.endpoint).host;
  } catch {}

  try {
    const subscriptionPayload = { ...payload, sound: sub.soundPreference || 'default' };
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      JSON.stringify(subscriptionPayload),
      { TTL: 86400, urgency: 'high' },
    );
    return { endpoint: sub.endpoint, status: 'delivered', statusCode: 201 };
  } catch (err: any) {
    const status: number = err?.statusCode ?? err?.status ?? 0;
    if (status === 410 || status === 404) {
      console.log(`[pushService] Removing stale subscription (${status}) host=${host}`);
      await PushSubscription.deleteMany({ endpoint: sub.endpoint }).catch(console.error);
    } else {
      console.error(`[pushService] Failed test push notification: status=${status} host=${host}:`, err?.message || err);
    }
    return { endpoint: sub.endpoint, status: 'failed', statusCode: status, error: err?.message || 'Send failed' };
  }
}

async function sendToSubscriptions(
  subscriptions: Awaited<ReturnType<typeof PushSubscription.find>>,
  payload: PushPayload,
): Promise<PushResult[]> {
  const staleEndpoints: string[] = [];
  const results: PushResult[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      let host = 'unknown';
      try {
        host = new URL(sub.endpoint).host;
      } catch {}

      try {
        const subscriptionPayload = { ...payload, sound: sub.soundPreference || 'default' };
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify(subscriptionPayload),
          { TTL: 86400, urgency: 'high' },
        );
        results.push({ endpoint: sub.endpoint, status: 'delivered', statusCode: 201 });
      } catch (err: any) {
        const status: number = err?.statusCode ?? err?.status ?? 0;
        results.push({ endpoint: sub.endpoint, status: 'failed', statusCode: status, error: err?.message || 'Send failed' });
        if (status === 410 || status === 404) {
          staleEndpoints.push(sub.endpoint);
          console.log(`[pushService] Removing stale subscription (${status}) host=${host}`);
        } else {
          console.error(`[pushService] Failed to send push notification: status=${status} host=${host}:`, err?.message || err);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    try {
      await PushSubscription.deleteMany({ endpoint: { $in: staleEndpoints } });
    } catch (err) {
      console.error('[pushService] Failed to delete stale subscriptions:', err);
    }
  }

  return results;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Send push to a customer identified by phone.
 * Scoped to the tenant so a phone number can exist in multiple tenants.
 */
export async function sendPushToPhone(
  phone: string,
  payload: PushPayload,
  tenantId: string,
): Promise<void> {
  if (!phone) { console.warn('[pushService] Skipping — no phone'); return; }
  try { ensureVapid(); } catch (err) { console.error('[pushService] VAPID init failed:', err); return; }

  const normalizedPhone = normalizeKenyanPhone(phone) || phone;

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      customerPhone: { $in: [normalizedPhone, phone] },
      role: 'customer',
    });
  } catch (err) { console.error('[pushService] Failed to query subscriptions:', err); return; }

  if (subscriptions.length === 0) return;
  await sendToSubscriptions(subscriptions, payload);
}

/**
 * Send push to all admin devices for the given tenant.
 * Persists a Notification doc scoped to the tenant.
 */
export async function sendPushToAdmins(
  payload: PushPayload,
  tenantId: string,
  employeeId?: string,
): Promise<void> {
  try { ensureVapid(); } catch (err) { console.error('[pushService] VAPID init failed:', err); return; }

  const tenantOid = new mongoose.Types.ObjectId(tenantId);

  try {
    const notif = new NotificationModel({
      tenantId: tenantOid,
      recipientId: tenantId,   // admin recipientId = tenantId string
      recipientType: 'admin',
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      sound: payload.sound || 'default',
    });
    const saved = await notif.save();
    payload = { ...payload, id: saved._id.toString() } as any;
  } catch (err) {
    console.error('[pushService] Failed to write admin notification to DB:', err);
  }

  let subscriptions;
  try {
    const query: any = { tenantId: tenantOid, role: 'admin' };
    if (employeeId) query.employeeId = employeeId;
    subscriptions = await PushSubscription.find(query);
  } catch (err) { console.error('[pushService] Failed to query admin subscriptions:', err); return; }

  if (subscriptions.length === 0) {
    console.warn(`[pushService] No admin subscriptions found for tenant ${tenantId} — push notification dropped. Admin must enable notifications in the dashboard.`);
    return;
  }
  await sendToSubscriptions(subscriptions, payload);
}

/**
 * Send push to a specific attendant's subscribed devices.
 * Persists a Notification doc scoped to the tenant.
 */
export async function sendPushToAttendant(
  attendantId: string,
  payload: PushPayload,
  tenantId: string,
): Promise<void> {
  if (!attendantId) { console.warn('[pushService] Skipping — no attendantId'); return; }
  try { ensureVapid(); } catch (err) { console.error('[pushService] VAPID init failed:', err); return; }

  const tenantOid = new mongoose.Types.ObjectId(tenantId);

  try {
    const notif = new NotificationModel({
      tenantId: tenantOid,
      recipientId: attendantId,
      recipientType: 'attendant',
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      sound: payload.sound || 'default',
    });
    const saved = await notif.save();
    payload = { ...payload, id: saved._id.toString() } as any;
  } catch (err) {
    console.error('[pushService] Failed to write attendant notification to DB:', err);
  }

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({ tenantId: tenantOid, attendantId, role: 'attendant' });
  } catch (err) { console.error('[pushService] Failed to query attendant subscriptions:', err); return; }

  if (subscriptions.length === 0) return;
  await sendToSubscriptions(subscriptions, payload);
}
