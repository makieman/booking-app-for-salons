import { IBooking } from '../models/Booking';
import { IService } from '../models/Service';

// ── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

  if (!token) {
    console.warn('[whatsappService] WHATSAPP_TOKEN is not set — skipping');
    return null;
  }
  if (!phoneId) {
    console.warn('[whatsappService] WHATSAPP_PHONE_NUMBER_ID is not set — skipping');
    return null;
  }

  return {
    token,
    phoneId,
    url: `https://graph.facebook.com/${version}/${phoneId}/messages`,
  };
}

import { normalizeKenyanPhone } from '../utils/phoneNormalizer';
export { normalizeKenyanPhone };

// ── Core HTTP Sender ─────────────────────────────────────────────────────────

interface TemplateParam { type: 'text'; text: string; }

interface SendTemplateOpts {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{ type: 'body' | 'header' | 'button'; parameters: TemplateParam[] }>;
  fallbackText?: string;
}

async function sendTemplate(opts: SendTemplateOpts): Promise<boolean> {
  const to = normalizeKenyanPhone(opts.to);
  if (!to) return false;

  const config = getConfig();
  if (!config) return false;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode ?? 'en' },
      components: opts.components ?? [],
    },
  };

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      const errCode = data?.error?.code;
      console.error(`[whatsappService] ❌ API error "${opts.templateName}" → ${to}:`, JSON.stringify(data?.error ?? data));
      // If template is still pending Meta review (#132001) and fallbackText is provided, try 24h window free-text
      if ((errCode === 132001 || errCode === 132000) && opts.fallbackText) {
        console.log(`[whatsappService] ℹ️ Template "${opts.templateName}" pending approval — attempting free-text fallback → ${to}`);
        return await sendWhatsAppFreeText(to, opts.fallbackText);
      }
      return false;
    }

    console.log(`[whatsappService] ✅ Sent "${opts.templateName}" → ${to} | msgId: ${data?.messages?.[0]?.id}`);
    return true;
  } catch (err) {
    console.error(`[whatsappService] ❌ Network error "${opts.templateName}":`, err);
    return false;
  }
}

// ── Free-text sender (24-hour customer-service window only) ──────────────────

/**
 * Send a plain-text message to a phone number.
 * Only works within the 24-hour customer-initiated messaging window.
 * Use templates (sendTemplate) for proactive outbound messages.
 */
export async function sendWhatsAppFreeText(to: string, text: string): Promise<boolean> {
  const normalized = normalizeKenyanPhone(to);
  if (!normalized) return false;

  const config = getConfig();
  if (!config) return false;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalized,
    type: 'text',
    text: { body: text },
  };

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as any;
    if (!response.ok) {
      console.error('[whatsappService] ❌ Free-text send error:', JSON.stringify(data?.error ?? data));
      return false;
    }
    console.log(`[whatsappService] ✅ Free-text → ${normalized} | msgId: ${data?.messages?.[0]?.id}`);
    return true;
  } catch (err) {
    console.error('[whatsappService] ❌ Free-text network error:', err);
    return false;
  }
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

// ── Public Notification Functions ─────────────────────────────────────────────

export async function sendWhatsAppBookingReceived(booking: IBooking, service: IService, attendantName?: string): Promise<void> {
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  const formattedDate = formatDate(booking.date);
  const formattedTime = formatTime(booking.startTime);
  await sendTemplate({
    to: booking.phone,
    templateName: 'booking_request_received',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formattedDate },
      { type: 'text', text: formattedTime },
      { type: 'text', text: booking.reference },
    ]}],
    fallbackText: `Hi ${booking.customerName}, we have received your booking request for ${serviceName} on ${formattedDate} at ${formattedTime}. Your booking reference is ${booking.reference}. Reply CONFIRM, RESCHEDULE, or CANCEL anytime.`,
  });
}

export async function sendWhatsAppBookingConfirmed(booking: IBooking, service: IService, attendantName?: string): Promise<void> {
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  const formattedDate = formatDate(booking.date);
  const formattedTime = formatTime(booking.startTime);
  await sendTemplate({
    to: booking.phone,
    templateName: 'booking_confirmed',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formattedDate },
      { type: 'text', text: formattedTime },
      { type: 'text', text: booking.reference },
    ]}],
    fallbackText: `Hi ${booking.customerName}, your booking for ${serviceName} on ${formattedDate} at ${formattedTime} has been confirmed! Booking reference: ${booking.reference}. See you soon!`,
  });
}

export async function sendWhatsAppBookingCancelled(
  booking: IBooking,
  service: IService,
  reason?: string
): Promise<void> {
  const formattedDate = formatDate(booking.date);
  const sent = await sendTemplate({
    to: booking.phone,
    templateName: 'booking_cancelled',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: service.name },
      { type: 'text', text: formattedDate },
      { type: 'text', text: booking.reference },
    ]}],
    fallbackText: `Hi ${booking.customerName}, your booking for ${service.name} on ${formattedDate} (Ref: ${booking.reference}) has been cancelled. Please contact us if you have any questions.`,
  });

  if (sent && reason) {
    await sendWhatsAppFreeText(booking.phone, `Cancellation reason: ${reason}`);
  }
}

export async function sendWhatsAppReminder(booking: IBooking, service: IService, attendantName?: string): Promise<void> {
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  const formattedTime = formatTime(booking.startTime);
  await sendTemplate({
    to: booking.phone,
    templateName: 'appointment_reminder',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formattedTime },
    ]}],
    fallbackText: `Hi ${booking.customerName}, this is a reminder for your upcoming appointment for ${serviceName} tomorrow at ${formattedTime}. Reply CONFIRM, RESCHEDULE, or CANCEL if your plans have changed.`,
  });
}

export async function sendWhatsAppRescheduled(
  booking: IBooking,
  service: IService,
  attendantName?: string,
): Promise<void> {
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  const formattedDate = formatDate(booking.date);
  const formattedTime = formatTime(booking.startTime);
  await sendTemplate({
    to: booking.phone,
    templateName: 'booking_rescheduled',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formattedDate },
      { type: 'text', text: formattedTime },
      { type: 'text', text: booking.reference },
    ]}],
    fallbackText: `Hi ${booking.customerName}, your booking for ${serviceName} has been rescheduled to ${formattedDate} at ${formattedTime}. Your booking reference is ${booking.reference}. See you then!`,
  });
}
