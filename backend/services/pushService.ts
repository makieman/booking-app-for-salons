import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';
import NotificationModel from '../models/Notification';
import mongoose from 'mongoose';

// ── VAPID lazy initialisation ─────────────────────────────────────────────────
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

interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  sound?: 'default' | 'chime' | 'bell' | 'ding' | 'silent';
}

async function sendToSubscriptions(
  subscriptions: Awaited<ReturnType<typeof PushSubscription.find>>,
  payload: PushPayload,
): Promise<void> {
  const staleEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        const subscriptionPayload = { ...payload, sound: sub.soundPreference || 'default' };
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify(subscriptionPayload),
        );
      } catch (err: any) {
        const status: number = err?.statusCode ?? err?.status ?? 0;
        if (status === 410 || status === 404) {
          staleEndpoints.push(sub.endpoint);
          console.log(`[pushService] Removing stale subscription (${status})`);
        } else {
          console.error('[pushService] Failed to send push notification:', err);
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

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      customerPhone: phone,
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

  if (subscriptions.length === 0) return;
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
