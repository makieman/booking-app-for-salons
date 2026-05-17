import { Resend } from 'resend';
import { IBooking } from '../models/Booking';
import { IService } from '../models/Service';

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
// e.g. ADMIN_EMAIL=flo@salon.com,assistant@salon.com
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAIL ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

// ── Shared brand styles ───────────────────────────────────────────────────────
const BRAND = {
  black: '#0a0a0a',
  white: '#ffffff',
  gray: '#6b6b6b',
  lightGray: '#f5f5f5',
  accent: '#1a1a1a',
};

function baseTemplate(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flo Sisterlocks</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.lightGray};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:${BRAND.white};border:2px solid ${BRAND.black};">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND.black};padding:32px 40px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:4px;">Certified Consultant · Eldoret</p>
              <h1 style="margin:0;font-size:28px;color:${BRAND.white};font-style:italic;font-weight:900;letter-spacing:-0.5px;">flo sisterlocks</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BRAND.lightGray};padding:24px 40px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:11px;color:${BRAND.gray};letter-spacing:0.1em;">
                Flo Sisterlocks Studio · Eldoret, Kenya<br>
                <a href="tel:0721530120" style="color:${BRAND.gray};text-decoration:none;">0721 530 120</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function bookingDetailsTable(booking: IBooking, service: IService): string {
  const formattedDate = new Date(booking.date).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedPrice = `KES ${service.price.toLocaleString('en-KE')}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:${BRAND.lightGray};border:1px solid #e5e5e5;margin-top:24px;">
      <tr>
        <td style="padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
                <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Service</span>
              </td>
              <td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
                <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${service.name}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
                <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Date</span>
              </td>
              <td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
                <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${formattedDate}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
                <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Time</span>
              </td>
              <td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
                <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${booking.startTime} – ${booking.endTime}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;">
                <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Price</span>
              </td>
              <td align="right" style="padding:8px 0;">
                <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${formattedPrice}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// ── Email send helper (non-throwing — logs errors, never crashes the request) ─
async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  if (!opts.to || (Array.isArray(opts.to) && opts.to.length === 0)) {
    console.warn('[emailService] Skipping send — no recipient address provided');
    return;
  }
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.error('[emailService] Resend API error:', error);
    } else {
      console.log(`[emailService] ✅ Email sent → ${opts.to} | Subject: "${opts.subject}"`);
    }
  } catch (err) {
    console.error('[emailService] Failed to send email:', err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC EMAIL FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Sent to the CUSTOMER immediately after they submit a booking.
 * Status at this point is still "pending" (awaiting admin approval).
 */
export async function sendBookingRequestReceived(
  booking: IBooking,
  service: IService,
): Promise<void> {
  if (!booking.email) return;

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${BRAND.black};">
      Booking Request Received
    </h2>
    <div style="width:48px;height:3px;background:${BRAND.black};margin-bottom:20px;"></div>
    <p style="margin:0 0 8px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      Hi <strong style="color:${BRAND.black};">${booking.customerName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      We've received your appointment request and it is currently <strong style="color:${BRAND.black};">pending review</strong>.
      You'll receive a confirmation email once it's approved. Please do not pay until you receive confirmation.
    </p>
    ${bookingDetailsTable(booking, service)}
    <p style="margin:24px 0 0;font-size:12px;color:${BRAND.gray};line-height:1.6;">
      Questions? Call or WhatsApp us at <strong>0721 530 120</strong>.
    </p>
  `);

  await sendEmail({
    to: booking.email,
    subject: '📋 Booking Request Received — Flo Sisterlocks',
    html,
  });
}

/**
 * Sent to the CUSTOMER when the admin confirms their booking.
 */
export async function sendBookingConfirmedToCustomer(
  booking: IBooking,
  service: IService,
): Promise<void> {
  if (!booking.email) return;

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${BRAND.black};">
      Appointment Confirmed ✓
    </h2>
    <div style="width:48px;height:3px;background:${BRAND.black};margin-bottom:20px;"></div>
    <p style="margin:0 0 8px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      Hi <strong style="color:${BRAND.black};">${booking.customerName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      Great news — your appointment has been <strong style="color:${BRAND.black};">confirmed</strong>!
      We look forward to seeing you at the studio.
    </p>
    ${bookingDetailsTable(booking, service)}
    <p style="margin:24px 0 0;font-size:12px;color:${BRAND.gray};line-height:1.6;">
      Please arrive 5–10 minutes before your appointment time. 
      Need to reschedule? Call us at <strong>0721 530 120</strong>.
    </p>
  `);

  await sendEmail({
    to: booking.email,
    subject: '✅ Appointment Confirmed — Flo Sisterlocks',
    html,
  });
}

/**
 * Sent to the CUSTOMER when the admin cancels their booking.
 */
export async function sendBookingCancelledToCustomer(
  booking: IBooking,
  service: IService,
): Promise<void> {
  if (!booking.email) return;

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${BRAND.black};">
      Booking Update
    </h2>
    <div style="width:48px;height:3px;background:${BRAND.black};margin-bottom:20px;"></div>
    <p style="margin:0 0 8px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      Hi <strong style="color:${BRAND.black};">${booking.customerName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      Unfortunately your booking has been <strong style="color:${BRAND.black};">cancelled</strong>.
      We apologise for any inconvenience. Please book a new slot or get in touch with us directly.
    </p>
    ${bookingDetailsTable(booking, service)}
    <p style="margin:24px 0 0;font-size:12px;color:${BRAND.gray};line-height:1.6;">
      To rebook, visit our website or call/WhatsApp <strong>0721 530 120</strong>.
    </p>
  `);

  await sendEmail({
    to: booking.email,
    subject: '❌ Booking Cancelled — Flo Sisterlocks',
    html,
  });
}

/**
 * Internal alert sent to the ADMIN whenever a new booking is submitted.
 */
export async function sendAdminNewBookingAlert(
  booking: IBooking,
  service: IService,
): Promise<void> {
  if (ADMIN_EMAILS.length === 0) {
    console.warn('[emailService] ADMIN_EMAIL not set — skipping admin alert');
    return;
  }

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${BRAND.black};">
      New Booking Request 🔔
    </h2>
    <div style="width:48px;height:3px;background:${BRAND.black};margin-bottom:20px;"></div>
    <p style="margin:0 0 20px;font-size:14px;color:${BRAND.gray};line-height:1.6;">
      A new booking request has arrived and is <strong style="color:${BRAND.black};">awaiting your approval</strong>.
    </p>
    ${bookingDetailsTable(booking, service)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
          <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Customer</span>
        </td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
          <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${booking.customerName}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
          <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Phone</span>
        </td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
          <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${booking.phone}</span>
        </td>
      </tr>
      ${booking.email ? `
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.2em;color:${BRAND.gray};">Email</span>
        </td>
        <td align="right" style="padding:8px 0;">
          <span style="font-size:13px;font-weight:900;color:${BRAND.black};">${booking.email}</span>
        </td>
      </tr>` : ''}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:${BRAND.gray};">Log in to the admin panel to approve or decline this request.</p>
  `);

  await sendEmail({
    to: ADMIN_EMAILS,
    subject: `🔔 New Booking — ${booking.customerName} | ${service.name}`,
    html,
  });
}
