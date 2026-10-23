import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { IBooking } from '../models/Booking';
import { IService } from '../models/Service';
import { ITenant } from '../models/Tenant';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Resend client (lazy initialised so missing key doesn't crash startup)
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set in environment variables');
    _resend = new Resend(key);
  }
  return _resend;
}

// ── Config
const FROM = process.env.FROM_EMAIL ?? 'onboarding@resend.dev';
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL ?? 'https://booking-app-for-salons.vercel.app').replace(/\/$/, '');

// Supports multiple admin emails separated by commas
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAIL ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

// ── Helper Utilities ──────────────────────────────────────────────────────────

function formatBookingDate(dateStr: string, timezone: string = 'Africa/Nairobi'): string {
  try {
    const dt = DateTime.fromISO(dateStr, { zone: timezone });
    if (dt.isValid) {
      return dt.toFormat('cccc, d MMMM yyyy');
    }
  } catch {}
  return dateStr;
}

function formatDuration(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${hrs} hr${hrs > 1 ? 's' : ''} ${rem} mins`;
}

function generateWhatsAppUrl(phone?: string, text?: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '254' + clean.slice(1);
  }
  if (!clean) return '';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${clean}${query}`;
}

function getBookingViewUrl(tenant: ITenant, booking: IBooking): string {
  return `${FRONTEND_BASE_URL}/${tenant.slug}?ref=${booking.reference}`;
}

function getSalonUrl(tenant: ITenant): string {
  return `${FRONTEND_BASE_URL}/${tenant.slug}`;
}

function getAdminUrl(tenant: ITenant): string {
  return `${FRONTEND_BASE_URL}/${tenant.slug}/admin`;
}

export function generateGoogleCalendarUrl(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
): string {
  try {
    const tz = tenant.timezone || 'Africa/Nairobi';
    const dateStr = (booking.date || '').trim();
    const startTimeStr = (booking.startTime || '').trim();
    const endTimeStr = (booking.endTime || '').trim();

    if (!dateStr || !startTimeStr) return '';

    const startDt = DateTime.fromISO(`${dateStr}T${startTimeStr}`, { zone: tz });
    if (!startDt.isValid) return '';

    let endDt: DateTime;
    if (endTimeStr) {
      endDt = DateTime.fromISO(`${dateStr}T${endTimeStr}`, { zone: tz });
    } else {
      endDt = startDt.plus({ minutes: (service as any).duration || 60 });
    }

    if (!endDt.isValid || endDt <= startDt) {
      endDt = startDt.plus({ minutes: (service as any).duration || 60 });
    }

    const startUtc = startDt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    const endUtc = endDt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

    const summary = `${service.name} — ${tenant.name}`;
    const descriptionLines = [
      `Appointment at ${tenant.name}`,
      `Service: ${service.name}`,
      attendantName ? `Stylist: ${attendantName}` : null,
      `Booking Reference: #${booking.reference}`,
      `Client: ${booking.customerName}`,
      tenant.supportPhone ? `Salon Phone: ${tenant.supportPhone}` : null,
      tenant.supportEmail ? `Salon Email: ${tenant.supportEmail}` : null,
      `Manage appointment: ${getBookingViewUrl(tenant, booking)}`,
    ].filter(Boolean);

    const location = tenant.name + (tenant.supportPhone ? ` (${tenant.supportPhone})` : '');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: summary,
      dates: `${startUtc}/${endUtc}`,
      details: descriptionLines.join('\n'),
      location,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  } catch (err) {
    console.error('[emailService] Failed to build Google Calendar URL:', err);
    return '';
  }
}

// ── Template renderer
function renderTemplate(templateName: string, context: any): string {
  const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.hbs`);
  const layoutPath = path.join(__dirname, '..', 'templates', 'layout.hbs');

  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');

  const template = Handlebars.compile(templateSource);
  const layout = Handlebars.compile(layoutSource);

  const bodyHtml = template(context);
  return layout({ ...context, body: bodyHtml });
}

// ── Email send helper (non-throwing — logs errors, never crashes the request)
async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from: string;
  replyTo?: string;
}): Promise<void> {
  if (!opts.to || (Array.isArray(opts.to) && opts.to.length === 0)) {
    console.warn('[emailService] Skipping send — no recipient address provided');
    return;
  }
  try {
    const resend = getResend();
    const mailOptions: any = {
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.replyTo) {
      mailOptions.replyTo = opts.replyTo;
    }

    const { error } = await resend.emails.send(mailOptions);
    if (error) {
      console.error('[emailService] Resend API error:', error);
    } else {
      console.log(`[emailService] ✅ Email sent → ${opts.to} | Subject: "${opts.subject}"`);
    }
  } catch (err) {
    console.error('[emailService] Failed to send email:', err);
  }
}

// Helper to determine the From and Reply-To headers from tenant branding
function getEmailHeaders(tenant: ITenant) {
  const fromEmailOnly = FROM.includes('<') ? FROM.split('<')[1].replace('>', '').trim() : FROM;
  const fromName = tenant.branding?.emailFromName || tenant.name;
  const from = `"${fromName}" <${fromEmailOnly}>`;
  const replyTo = tenant.branding?.emailReplyTo || undefined;
  return { from, replyTo };
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC EMAIL FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Sent to the CUSTOMER immediately after they submit a booking.
 */
export async function sendBookingRequestReceived(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
): Promise<void> {
  if (!booking.email) return;

  const brandColor = tenant.branding?.primaryColor || '#0F172A';
  const formattedDate = formatBookingDate(booking.date, tenant.timezone);
  const formattedPrice = `KES ${Number(service.price || 0).toLocaleString('en-KE')}`;
  const durationLabel = formatDuration((service as any).duration);
  const whatsAppPhone = tenant.branding?.whatsappSenderNumber || tenant.supportPhone;
  const whatsAppUrl = generateWhatsAppUrl(
    whatsAppPhone,
    `Hi ${tenant.name}, I have a question regarding my booking #${booking.reference}`
  );
  const bookingViewUrl = getBookingViewUrl(tenant, booking);
  const salonUrl = getSalonUrl(tenant);

  const html = renderTemplate('booking_request_received', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
    durationLabel,
    brandColor,
    whatsAppUrl,
    bookingViewUrl,
    salonUrl,
    previewText: `Your booking request for ${service.name} at ${tenant.name} has been received.`,
  });

  const { from, replyTo } = getEmailHeaders(tenant);

  await sendEmail({
    to: booking.email,
    subject: `⏳ Booking Request Received — ${tenant.name}`,
    html,
    from,
    replyTo,
  });
}

/**
 * Sent to the CUSTOMER when the admin confirms their booking.
 */
export async function sendBookingConfirmedToCustomer(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
): Promise<void> {
  if (!booking.email) return;

  const brandColor = tenant.branding?.primaryColor || '#0F172A';
  const formattedDate = formatBookingDate(booking.date, tenant.timezone);
  const formattedPrice = `KES ${Number(service.price || 0).toLocaleString('en-KE')}`;
  const durationLabel = formatDuration((service as any).duration);
  const googleCalendarUrl = generateGoogleCalendarUrl(tenant, booking, service, attendantName);
  const whatsAppPhone = tenant.branding?.whatsappSenderNumber || tenant.supportPhone;
  const whatsAppUrl = generateWhatsAppUrl(
    whatsAppPhone,
    `Hi ${tenant.name}, regarding my confirmed appointment #${booking.reference}`
  );
  const bookingViewUrl = getBookingViewUrl(tenant, booking);
  const salonUrl = getSalonUrl(tenant);

  const html = renderTemplate('booking_confirmed', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
    durationLabel,
    googleCalendarUrl,
    brandColor,
    whatsAppUrl,
    bookingViewUrl,
    salonUrl,
    previewText: `✓ Your appointment for ${service.name} at ${tenant.name} is confirmed!`,
  });

  const { from, replyTo } = getEmailHeaders(tenant);

  await sendEmail({
    to: booking.email,
    subject: `✅ Appointment Confirmed — ${tenant.name}`,
    html,
    from,
    replyTo,
  });
}

/**
 * Sent to the CUSTOMER when their appointment is rescheduled.
 */
export async function sendBookingRescheduledToCustomer(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
): Promise<void> {
  if (!booking.email) return;

  const brandColor = tenant.branding?.primaryColor || '#0F172A';
  const formattedDate = formatBookingDate(booking.date, tenant.timezone);
  const formattedPrice = `KES ${Number(service.price || 0).toLocaleString('en-KE')}`;
  const durationLabel = formatDuration((service as any).duration);
  const googleCalendarUrl = generateGoogleCalendarUrl(tenant, booking, service, attendantName);
  const whatsAppPhone = tenant.branding?.whatsappSenderNumber || tenant.supportPhone;
  const whatsAppUrl = generateWhatsAppUrl(
    whatsAppPhone,
    `Hi ${tenant.name}, regarding my rescheduled appointment #${booking.reference}`
  );
  const bookingViewUrl = getBookingViewUrl(tenant, booking);
  const salonUrl = getSalonUrl(tenant);

  const html = renderTemplate('booking_rescheduled', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
    durationLabel,
    googleCalendarUrl,
    brandColor,
    whatsAppUrl,
    bookingViewUrl,
    salonUrl,
    previewText: `📅 Your appointment at ${tenant.name} has been rescheduled to ${formattedDate} at ${booking.startTime}.`,
  });

  const { from, replyTo } = getEmailHeaders(tenant);

  await sendEmail({
    to: booking.email,
    subject: `📅 Appointment Rescheduled — ${tenant.name}`,
    html,
    from,
    replyTo,
  });
}

/**
 * Sent to the CUSTOMER when the admin cancels their booking.
 */
export async function sendBookingCancelledToCustomer(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
  reason?: string,
): Promise<void> {
  if (!booking.email) return;

  const brandColor = tenant.branding?.primaryColor || '#0F172A';
  const formattedDate = formatBookingDate(booking.date, tenant.timezone);
  const formattedPrice = `KES ${Number(service.price || 0).toLocaleString('en-KE')}`;
  const whatsAppPhone = tenant.branding?.whatsappSenderNumber || tenant.supportPhone;
  const whatsAppUrl = generateWhatsAppUrl(
    whatsAppPhone,
    `Hi ${tenant.name}, regarding my cancelled booking #${booking.reference}`
  );
  const salonUrl = getSalonUrl(tenant);

  const html = renderTemplate('booking_cancelled', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
    reason,
    brandColor,
    whatsAppUrl,
    salonUrl,
    previewText: `Your booking at ${tenant.name} has been cancelled.`,
  });

  const { from, replyTo } = getEmailHeaders(tenant);

  await sendEmail({
    to: booking.email,
    subject: `❌ Booking Cancelled — ${tenant.name}`,
    html,
    from,
    replyTo,
  });
}

/**
 * Internal alert sent to the ADMIN whenever a new booking is submitted.
 */
export async function sendAdminNewBookingAlert(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
): Promise<void> {
  if (ADMIN_EMAILS.length === 0) {
    console.warn('[emailService] ADMIN_EMAIL not set — skipping admin alert');
    return;
  }

  const brandColor = tenant.branding?.primaryColor || '#0F172A';
  const formattedDate = formatBookingDate(booking.date, tenant.timezone);
  const formattedPrice = `KES ${Number(service.price || 0).toLocaleString('en-KE')}`;
  const durationLabel = formatDuration((service as any).duration);
  const adminUrl = getAdminUrl(tenant);
  const customerWhatsAppUrl = generateWhatsAppUrl(
    booking.phone,
    `Hi ${booking.customerName}, regarding your booking request with ${tenant.name}`
  );

  const html = renderTemplate('admin_new_booking', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
    durationLabel,
    brandColor,
    adminUrl,
    customerWhatsAppUrl,
    previewText: `New booking request from ${booking.customerName} for ${service.name}.`,
  });

  const { from, replyTo } = getEmailHeaders(tenant);

  await sendEmail({
    to: ADMIN_EMAILS,
    subject: `🔔 New Booking — ${booking.customerName} | ${service.name}`,
    html,
    from,
    replyTo,
  });
}

/**
 * Sends the owner a password-reset link.
 */
export async function sendPasswordResetEmail(
  tenant: ITenant,
  resetUrl: string,
): Promise<void> {
  const brandColor = tenant.branding?.primaryColor || '#0F172A';
  const salonUrl = getSalonUrl(tenant);

  const html = renderTemplate('password_reset', {
    tenant,
    salonName: tenant.name,
    ownerEmail: tenant.ownerEmail,
    resetUrl,
    expiresInMinutes: 60,
    brandColor,
    salonUrl,
    previewText: `Reset your admin password for ${tenant.name}`,
  });

  const { from } = getEmailHeaders(tenant);

  await sendEmail({
    to: tenant.ownerEmail,
    subject: `🔐 Reset your ${tenant.name} admin password`,
    html,
    from,
  });
}
