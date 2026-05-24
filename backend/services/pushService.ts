import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';

// ── VAPID lazy initialisation ─────────────────────────────────────────────────
// We set VAPID details on first use so a missing key doesn't crash startup.
let _vapidInitialised = false;

function ensureVapid(): void {
  if (_vapidInitialised) return;

  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const mailto     = process.env.VAPID_MAILTO;

  if (!publicKey || !privateKey || !mailto) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_MAILTO must all be set in .env');
  }

  webpush.setVapidDetails(mailto, publicKey, privateKey);
  _vapidInitialised = true;
}

// ── Push payload type ─────────────────────────────────────────────────────────
interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  sound?: 'default' | 'chime' | 'bell' | 'ding' | 'silent';
}

// ── Shared push sender ────────────────────────────────────────────────────────
async function sendToSubscriptions(
  subscriptions: Awaited<ReturnType<typeof PushSubscription.find>>,
  payload: PushPayload,
): Promise<void> {
  const staleEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        const subscriptionPayload = {
          ...payload,
          sound: sub.soundPreference || 'default',
        };
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify(subscriptionPayload),
        );
        console.log(`[pushService] ✅ Push sent → ${sub.endpoint.slice(0, 60)}…`);
      } catch (err: any) {
        const status: number = err?.statusCode ?? err?.status ?? 0;
        if (status === 410 || status === 404) {
          staleEndpoints.push(sub.endpoint);
          console.log(`[pushService] Removing stale subscription (${status}): ${sub.endpoint.slice(0, 60)}…`);
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
 * Send a push notification to every subscribed device for a given customer phone.
 * Expired subscriptions (410 / 404) are automatically cleaned up.
 */
export async function sendPushToPhone(
  phone:   string,
  payload: PushPayload,
): Promise<void> {
  if (!phone) {
    console.warn('[pushService] Skipping push — no phone number provided');
    return;
  }

  try { ensureVapid(); } catch (err) {
    console.error('[pushService] VAPID init failed:', err);
    return;
  }

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({ customerPhone: phone, role: 'customer' });
  } catch (err) {
    console.error('[pushService] Failed to query subscriptions:', err);
    return;
  }

  if (subscriptions.length === 0) {
    console.log(`[pushService] No push subscriptions found for phone ${phone}`);
    return;
  }

  await sendToSubscriptions(subscriptions, payload);
}

/**
 * Send a push notification to ALL subscribed admin devices (or filtered by employeeId).
 * Used to alert the admin when a new booking comes in.
 */
export async function sendPushToAdmins(
  payload: PushPayload,
  employeeId?: string
): Promise<void> {
  try { ensureVapid(); } catch (err) {
    console.error('[pushService] VAPID init failed:', err);
    return;
  }

  let subscriptions;
  try {
    const query: any = { role: 'admin' };
    if (employeeId) {
      query.employeeId = employeeId;
    }
    subscriptions = await PushSubscription.find(query);
  } catch (err) {
    console.error('[pushService] Failed to query admin subscriptions:', err);
    return;
  }

  if (subscriptions.length === 0) {
    console.log('[pushService] No matching admin push subscriptions registered');
    return;
  }

  await sendToSubscriptions(subscriptions, payload);
}

/**
 * Send a push notification to a specific attendant's subscribed devices.
 * Used to notify an attendant when a booking assigned to them is confirmed/cancelled.
 */
export async function sendPushToAttendant(
  attendantId: string,
  payload: PushPayload,
): Promise<void> {
  if (!attendantId) {
    console.warn('[pushService] Skipping push — no attendantId provided');
    return;
  }

  try { ensureVapid(); } catch (err) {
    console.error('[pushService] VAPID init failed:', err);
    return;
  }

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({ attendantId, role: 'attendant' });
  } catch (err) {
    console.error('[pushService] Failed to query attendant subscriptions:', err);
    return;
  }

  if (subscriptions.length === 0) {
    console.log(`[pushService] No push subscriptions found for attendant ${attendantId}`);
    return;
  }

  await sendToSubscriptions(subscriptions, payload);
}
