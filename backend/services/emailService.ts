import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'url';
import { IBooking } from '../models/Booking';
import { IService } from '../models/Service';
import { ITenant } from '../models/Tenant';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Resend client (lazy initialised so missing key doesn't crash startup) ──────
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set in environment variables');
    _resend = new Resend(key);
  }
  return _resend;
}

// ── Config ───────────────────────────────────────────────────────────────────
const FROM = process.env.FROM_EMAIL ?? 'onboarding@resend.dev';

// Supports multiple admin emails separated by commas
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAIL ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

// ── Template renderer ────────────────────────────────────────────────────────
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

// ── Email send helper (non-throwing — logs errors, never crashes the request) ─
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

  const formattedDate = new Date(booking.date).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedPrice = `KES ${service.price.toLocaleString('en-KE')}`;

  const html = renderTemplate('booking_request_received', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
  });

  const { from, replyTo } = getEmailHeaders(tenant);

  await sendEmail({
    to: booking.email,
    subject: `📋 Booking Request Received — ${tenant.name}`,
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

  const formattedDate = new Date(booking.date).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedPrice = `KES ${service.price.toLocaleString('en-KE')}`;

  const html = renderTemplate('booking_confirmed', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
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
 * Sent to the CUSTOMER when the admin cancels their booking.
 */
export async function sendBookingCancelledToCustomer(
  tenant: ITenant,
  booking: IBooking,
  service: IService,
  attendantName?: string,
): Promise<void> {
  if (!booking.email) return;

  const formattedDate = new Date(booking.date).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedPrice = `KES ${service.price.toLocaleString('en-KE')}`;

  const html = renderTemplate('booking_cancelled', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
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

  const formattedDate = new Date(booking.date).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedPrice = `KES ${service.price.toLocaleString('en-KE')}`;

  const html = renderTemplate('admin_new_booking', {
    tenant,
    booking,
    service,
    attendantName,
    formattedDate,
    formattedPrice,
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
