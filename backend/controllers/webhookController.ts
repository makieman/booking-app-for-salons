import { Request, Response } from 'express';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import Tenant from '../models/Tenant';
import Booking from '../models/Booking';
import Service from '../models/Service';
import { generateAvailableSlots } from '../services/slotService';
import {
  sendWhatsAppFreeText,
  sendWhatsAppBookingConfirmed,
  sendWhatsAppBookingCancelled,
} from '../services/whatsappService';
import { sendPushToAdmins } from '../services/pushService';

// ── Meta webhook payload shape (typed just enough for our use-case) ────────────

interface WaTextMessage {
  type: 'text';
  text: { body: string };
}

interface WaButtonReply {
  id: string;    // e.g. 'CONFIRM_BOOKING' | 'CANCEL_BOOKING' | 'RESCHEDULE_BOOKING'
  title: string; // Display label shown on button
}

interface WaInteractiveMessage {
  type: 'interactive';
  interactive: {
    type: 'button_reply';
    button_reply: WaButtonReply;
  };
}

type WaMessageContent = WaTextMessage | WaInteractiveMessage;

interface WaMessage extends Record<string, unknown> {
  id: string;
  from: string; // sender's phone in E.164 without the leading '+'  e.g. '254712345678'
  timestamp: string;
  type: string;
}

interface WaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;  // ← this is how we find the tenant
      };
      messages?: Array<WaMessage & WaMessageContent>;
      statuses?: unknown[];       // delivery/read receipts — we ignore these
    };
    field: string;
  }>;
}

interface WaWebhookBody {
  object: string;
  entry: WaWebhookEntry[];
}

// ── Button ID constants (must match what you send in your template components) ─
const BTN_CONFIRM    = 'CONFIRM_BOOKING';
const BTN_CANCEL     = 'CANCEL_BOOKING';
const BTN_RESCHEDULE = 'RESCHEDULE_BOOKING';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find the next N available slots across consecutive calendar days, starting
 * from tomorrow (or the booking's own day if specified).
 * Returns at most `limit` slot strings in the form "YYYY-MM-DD HH:mm".
 */
async function findNextAvailableSlots(
  tenantId: string,
  serviceDuration: number,
  workingHours: { start: string; end: string },
  limit = 3,
): Promise<string[]> {
  const results: string[] = [];
  const today = DateTime.now().setZone('Africa/Nairobi');
  let daysChecked = 0;

  while (results.length < limit && daysChecked < 30) {
    daysChecked++;
    const checkDate = today.plus({ days: daysChecked }).toFormat('yyyy-MM-dd');

    const existingBookings = await Booking.find({
      tenantId,
      date: checkDate,
      status: { $in: ['pending', 'confirmed'] },
    });

    const slots = generateAvailableSlots(
      checkDate,
      serviceDuration,
      existingBookings as any,
      workingHours,
    );

    for (const slot of slots) {
      if (results.length < limit) {
        results.push(`${checkDate} ${slot}`);
      }
    }
  }

  return results;
}

/**
 * Format a "YYYY-MM-DD HH:mm" slot string into a human-readable label.
 * e.g. "2026-10-10 14:00" → "Fri 10 Oct at 2:00 PM"
 */
function formatSlotLabel(slot: string): string {
  const [datePart, timePart] = slot.split(' ');
  const dt = DateTime.fromISO(`${datePart}T${timePart}`, { zone: 'Africa/Nairobi' });
  return dt.toFormat("EEE d MMM 'at' h:mm a");
}

// ── Exported controller functions ─────────────────────────────────────────────

/**
 * GET /api/whatsapp/webhook
 * Meta calls this once when you first save the webhook URL in the developer
 * console. We must echo back hub.challenge if the verify token matches.
 */
export const verifyWebhook = (req: Request, res: Response): void => {
  const mode      = req.query['hub.mode']      as string | undefined;
  const token     = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge']  as string | undefined;

  const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error('[webhookController] WHATSAPP_WEBHOOK_TOKEN is not set');
    res.sendStatus(500);
    return;
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[webhookController] ✅ Webhook verified by Meta');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(challenge ?? '');
  } else {
    console.warn('[webhookController] ⚠️ Webhook verification failed — token mismatch');
    res.sendStatus(403);
  }
};

/**
 * POST /api/whatsapp/webhook
 * Receives inbound messages (and delivery receipts we can ignore).
 *
 * Security:
 *  1. Verifies X-Hub-Signature-256 using WHATSAPP_APP_SECRET over req.rawBody.
 *  2. Resolves tenant from phone_number_id in payload via Tenant.whatsappPhoneNumberId.
 *  3. Scopes customer booking lookups strictly by tenantId.
 *  4. Routes quick-reply button payloads.
 */
export const handleIncomingMessage = async (req: Request, res: Response): Promise<void> => {
  // ── 1. HMAC-SHA256 signature verification ────────────────────────────────
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[webhookController] WHATSAPP_APP_SECRET is not set — rejecting request');
    res.sendStatus(500);
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) {
    console.warn('[webhookController] Missing X-Hub-Signature-256 header');
    res.sendStatus(401);
    return;
  }

  const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  const expectedSig = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    console.warn('[webhookController] ⚠️ Signature mismatch — possible spoofed request');
    res.sendStatus(401);
    return;
  }

  // Always respond 200 immediately so Meta doesn't retry or back off.
  res.status(200).send('EVENT_RECEIVED');

  // ── 2. Parse payload ──────────────────────────────────────────────────────
  const body = req.body as WaWebhookBody;

  if (body.object !== 'whatsapp_business_account') {
    // Not a WhatsApp event (e.g. Instagram DM on same app) — silently ignore.
    return;
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue; // status updates, read receipts, etc.

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        console.warn('[webhookController] No phone_number_id in metadata — skipping');
        continue;
      }

      // ── 3. Resolve tenant ───────────────────────────────────────────────
      let tenant;
      try {
        tenant = await Tenant.findOne({ whatsappPhoneNumberId: phoneNumberId, isActive: true });
      } catch (err) {
        console.error('[webhookController] DB error resolving tenant:', err);
        continue;
      }

      if (!tenant) {
        console.warn(`[webhookController] No active tenant for phone_number_id=${phoneNumberId}`);
        continue;
      }

      // ── 4. Process each message in this change ──────────────────────────
      for (const message of value.messages) {
        await processMessage(message as WaMessage & WaMessageContent, tenant);
      }
    }
  }
};

// ── Core message processor ────────────────────────────────────────────────────

async function processMessage(
  message: WaMessage & WaMessageContent,
  tenant: InstanceType<typeof Tenant>,
): Promise<void> {
  const senderPhone = message.from; // E.164 without '+', e.g. '254712345678'
  const tenantId    = tenant._id.toString();

  // We only handle interactive button_reply messages.
  // Any other message type (text, image, audio, etc.) gets a gentle nudge.
  if (message.type !== 'interactive') {
    console.log(`[webhookController] Ignoring non-interactive message type="${message.type}" from ${senderPhone}`);
    void sendWhatsAppFreeText(
      senderPhone,
      `Hi! To manage your booking please use the buttons in our confirmation message, or visit our website. 😊`,
    );
    return;
  }

  const interactive = (message as WaInteractiveMessage).interactive;
  if (interactive?.type !== 'button_reply') {
    console.log(`[webhookController] Ignoring interactive type="${interactive?.type}" from ${senderPhone}`);
    return;
  }

  const buttonId = interactive.button_reply.id;
  console.log(`[webhookController] Button "${buttonId}" from ${senderPhone} | tenant=${tenant.slug}`);

  // ── Find customer's most recent active booking (scoped to this tenant) ──
  // Normalize: strip leading '+' so it matches the stored format
  const normalizedPhone = senderPhone.startsWith('+') ? senderPhone.slice(1) : senderPhone;
  // Also try with '+' prefix in case stored that way
  const phoneVariants = [normalizedPhone, `+${normalizedPhone}`];

  let booking;
  try {
    booking = await Booking.findOne({
      tenantId: tenant._id,
      phone: { $in: phoneVariants },
      status: { $in: ['pending', 'confirmed'] },
    })
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ createdAt: -1 }); // most recently created booking wins
  } catch (err) {
    console.error('[webhookController] DB error fetching booking:', err);
    void sendWhatsAppFreeText(senderPhone, 'Sorry, we had a problem looking up your booking. Please call us directly. 🙏');
    return;
  }

  if (!booking) {
    void sendWhatsAppFreeText(
      senderPhone,
      `We couldn't find an active booking for this number. Please contact us directly or book via our website.`,
    );
    return;
  }

  const service      = booking.serviceId as any;
  const attendantName: string | undefined = (booking.attendantId as any)?.name;

  // ── Route by button ID ──────────────────────────────────────────────────
  switch (buttonId) {
    case BTN_CONFIRM:
      await handleConfirm(booking, service, attendantName, tenantId, tenant.slug, senderPhone);
      break;

    case BTN_CANCEL:
      await handleCancel(booking, service, tenantId, tenant.slug, senderPhone);
      break;

    case BTN_RESCHEDULE:
      await handleReschedule(booking, service, tenantId, tenant, senderPhone);
      break;

    default:
      console.log(`[webhookController] Unknown button id="${buttonId}" — no action taken`);
      void sendWhatsAppFreeText(
        senderPhone,
        `We received your message but didn't recognise that action. Please call us if you need help. 😊`,
      );
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

/**
 * Customer pressed "Confirm" → set booking status to 'confirmed'.
 * Per the agreed design: customer self-confirm is allowed via WhatsApp.
 */
async function handleConfirm(
  booking: any,
  service: any,
  attendantName: string | undefined,
  tenantId: string,
  tenantSlug: string,
  senderPhone: string,
): Promise<void> {
  if (booking.status === 'confirmed') {
    void sendWhatsAppFreeText(
      senderPhone,
      `Your ${service.name} appointment on ${booking.date} at ${booking.startTime} is already confirmed. See you then! ✅`,
    );
    return;
  }

  try {
    booking.status = 'confirmed';
    await booking.save();
    console.log(`[webhookController] ✅ Booking ${booking.reference} confirmed by customer via WhatsApp`);
  } catch (err) {
    console.error('[webhookController] Failed to confirm booking:', err);
    void sendWhatsAppFreeText(senderPhone, `Sorry, we couldn't confirm your booking. Please try again or call us.`);
    return;
  }

  // Notify customer
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  void sendWhatsAppFreeText(
    senderPhone,
    `✅ Confirmed! Your ${serviceName} appointment is set for ${booking.date} at ${booking.startTime}.\nReference: ${booking.reference}\n\nSee you then! 💇`,
  );

  // Notify admin via push (fire-and-forget)
  void sendPushToAdmins(
    {
      title: '✅ Customer Self-Confirmed via WhatsApp',
      body: `${booking.customerName} confirmed ${service.name} on ${booking.date} at ${booking.startTime} (Ref: ${booking.reference})`,
      url: '/admin',
    },
    tenantId,
  );
}

/**
 * Customer pressed "Cancel" → set booking status to 'cancelled'.
 */
async function handleCancel(
  booking: any,
  service: any,
  tenantId: string,
  tenantSlug: string,
  senderPhone: string,
): Promise<void> {
  if (booking.status === 'cancelled') {
    void sendWhatsAppFreeText(senderPhone, `Your booking (Ref: ${booking.reference}) is already cancelled.`);
    return;
  }

  try {
    booking.status = 'cancelled';
    await booking.save();
    console.log(`[webhookController] ❌ Booking ${booking.reference} cancelled by customer via WhatsApp`);
  } catch (err) {
    console.error('[webhookController] Failed to cancel booking:', err);
    void sendWhatsAppFreeText(senderPhone, `Sorry, we couldn't cancel your booking. Please call us directly.`);
    return;
  }

  // Use the existing template for cancellation
  void sendWhatsAppBookingCancelled(booking, service);

  // Notify admin
  void sendPushToAdmins(
    {
      title: '❌ Customer Cancelled via WhatsApp',
      body: `${booking.customerName} cancelled ${service.name} on ${booking.date} at ${booking.startTime} (Ref: ${booking.reference})`,
      url: '/admin',
    },
    tenantId,
  );
}

/**
 * Customer pressed "Reschedule" → find next 3 available slots and list them.
 * We do NOT move the booking yet — just present options. The actual rescheduling
 * requires free-text NLP (planned for Phase 2) or a link to the booking page.
 */
async function handleReschedule(
  booking: any,
  service: any,
  tenantId: string,
  tenant: any,
  senderPhone: string,
): Promise<void> {
  let slots: string[];
  try {
    slots = await findNextAvailableSlots(
      tenantId,
      service.duration,
      tenant.workingHours,
      3,
    );
  } catch (err) {
    console.error('[webhookController] Failed to fetch slots for reschedule:', err);
    void sendWhatsAppFreeText(senderPhone, `Sorry, we couldn't check availability right now. Please call us to reschedule.`);
    return;
  }

  if (slots.length === 0) {
    void sendWhatsAppFreeText(
      senderPhone,
      `We couldn't find any available slots in the next 30 days for ${service.name}. Please call us to arrange a time. 📞`,
    );
    return;
  }

  const slotLines = slots
    .map((s, i) => `${i + 1}. ${formatSlotLabel(s)}`)
    .join('\n');

  void sendWhatsAppFreeText(
    senderPhone,
    `Hi ${booking.customerName}! 👋 Here are the next available slots for ${service.name}:\n\n${slotLines}\n\nTo reschedule, please reply with your preferred slot number, or visit our website to book directly. 🗓️`,
  );

  // Log to admin
  void sendPushToAdmins(
    {
      title: '🔄 Customer Requested Reschedule via WhatsApp',
      body: `${booking.customerName} wants to reschedule ${service.name} (Ref: ${booking.reference}). Slots offered.`,
      url: '/admin',
    },
    tenantId,
  );
}
