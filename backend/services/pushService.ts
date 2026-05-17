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
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify(payload),
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
 * Send a push notification to ALL subscribed admin devices.
 * Used to alert the admin when a new booking comes in.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  try { ensureVapid(); } catch (err) {
    console.error('[pushService] VAPID init failed:', err);
    return;
  }

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({ role: 'admin' });
  } catch (err) {
    console.error('[pushService] Failed to query admin subscriptions:', err);
    return;
  }

  if (subscriptions.length === 0) {
    console.log('[pushService] No admin push subscriptions registered');
    return;
  }

  await sendToSubscriptions(subscriptions, payload);
}

