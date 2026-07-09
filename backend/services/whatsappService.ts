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

// ── Phone Normalizer ─────────────────────────────────────────────────────────

export function normalizeKenyanPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, '');
  if (/^\+254\d{9}$/.test(cleaned)) return cleaned;
  if (/^254\d{9}$/.test(cleaned))   return `+${cleaned}`;
  if (/^07\d{8}$/.test(cleaned))    return `+254${cleaned.slice(1)}`;
  if (/^01\d{8}$/.test(cleaned))    return `+254${cleaned.slice(1)}`;
  console.warn(`[whatsappService] Could not normalize phone: "${raw}"`);
  return null;
}

// ── Core HTTP Sender ─────────────────────────────────────────────────────────

interface TemplateParam { type: 'text'; text: string; }

interface SendTemplateOpts {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{ type: 'body' | 'header' | 'button'; parameters: TemplateParam[] }>;
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
      console.error(`[whatsappService] ❌ API error "${opts.templateName}" → ${to}:`, JSON.stringify(data?.error ?? data));
      return false;
    }

    console.log(`[whatsappService] ✅ Sent "${opts.templateName}" → ${to} | msgId: ${data?.messages?.[0]?.id}`);
    return true;
  } catch (err) {
    console.error(`[whatsappService] ❌ Network error "${opts.templateName}":`, err);
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
  await sendTemplate({
    to: booking.phone,
    templateName: 'booking_request_received',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formatDate(booking.date) },
      { type: 'text', text: formatTime(booking.startTime) },
      { type: 'text', text: booking.reference },
    ]}],
  });
}

export async function sendWhatsAppBookingConfirmed(booking: IBooking, service: IService, attendantName?: string): Promise<void> {
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  await sendTemplate({
    to: booking.phone,
    templateName: 'booking_confirmed',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formatDate(booking.date) },
      { type: 'text', text: formatTime(booking.startTime) },
      { type: 'text', text: booking.reference },
    ]}],
  });
}

export async function sendWhatsAppBookingCancelled(booking: IBooking, service: IService): Promise<void> {
  await sendTemplate({
    to: booking.phone,
    templateName: 'booking_cancelled',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: service.name },
      { type: 'text', text: formatDate(booking.date) },
      { type: 'text', text: booking.reference },
    ]}],
  });
}

export async function sendWhatsAppReminder(booking: IBooking, service: IService, attendantName?: string): Promise<void> {
  const serviceName = attendantName ? `${service.name} with ${attendantName}` : service.name;
  await sendTemplate({
    to: booking.phone,
    templateName: 'appointment_reminder',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: booking.customerName },
      { type: 'text', text: serviceName },
      { type: 'text', text: formatTime(booking.startTime) },
    ]}],
  });
}
