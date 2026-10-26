import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import SmsLog from '../models/SmsLog';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';
import type { IBooking } from '../models/Booking';
import type { IService } from '../models/Service';

/**
 * SMS notifications.
 *
 * Works WITHOUT a registered sender ID: when SMS_SENDER_ID is not set, no `from`
 * value is sent and the provider uses its default sender. Because the customer
 * will not see the salon name as the sender, every message starts with the
 * salon name. Set SMS_SENDER_ID later (once approved by the provider) and the
 * same code starts using it, nothing else changes.
 *
 * Provider-specific code lives in a small adapter (see createAfricasTalkingProvider),
 * so switching provider means writing one more adapter, not touching callers.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type SmsType =
  | 'booking_received'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'appointment_reminder'
  | 'test';

export interface SmsProviderResult {
  ok: boolean;
  providerMessageId?: string;
  cost?: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  send(to: string, message: string): Promise<SmsProviderResult>;
}

export interface SmsLogEntry {
  tenantId: string;
  to: string;
  type: SmsType;
  status: 'sent' | 'failed' | 'skipped';
  segments: number;
  reference?: string;
  provider?: string;
  providerMessageId?: string;
  cost?: string;
  error?: string;
}

export interface SmsStore {
  /** Number of successfully sent messages since `since`, optionally for one phone. */
  countSent(tenantId: string, since: Date, to?: string): Promise<number>;
  record(entry: SmsLogEntry): Promise<void>;
}

export interface SmsLimits {
  perPhonePerDay: number;
  perTenantPerDay: number;
}

export interface SmsDeps {
  provider: SmsProvider | null;
  store: SmsStore;
  limits: SmsLimits;
  now?: () => Date;
}

export interface SendSmsOptions {
  tenantId: string;
  to: string;
  message: string;
  type: SmsType;
  reference?: string;
}

export interface SmsSendResult {
  sent: boolean;
  reason?: 'not_configured' | 'invalid_phone' | 'empty_message' | 'phone_limit' | 'tenant_limit' | 'provider_error';
  error?: string;
}

/** The parts of a tenant document SMS needs. */
export interface SmsTenant {
  _id: unknown;
  name: string;
  smsEnabled?: boolean;
  supportPhone?: string;
}

type SmsBooking = Pick<IBooking, 'customerName' | 'phone' | 'date' | 'startTime' | 'reference'>;
type SmsService = Pick<IService, 'name'>;

// ── Text helpers (GSM-7 safe so one SMS segment stays 160 characters) ───────

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = '^{}\\[~]|€'; // each counts as 2 characters

/**
 * Replaces characters that would force the slower 70-character encoding
 * (emoji, curly quotes, the trademark sign, etc.) with safe equivalents or removes them.
 */
export function toGsmSafe(text: string): string {
  const replaced = text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2007\u2009\u202F\u200A]/g, ' ')
    .replace(/[\u2122\u00AE\u00A9]/g, '');

  let out = '';
  for (const ch of replaced) {
    if (GSM_BASIC.includes(ch) || GSM_EXTENDED.includes(ch)) {
      out += ch;
      continue;
    }
    // Try to keep the base letter of accented characters (ô -> o); drop everything else.
    const base = ch.normalize('NFD')[0];
    if (base && base !== ch && GSM_BASIC.includes(base)) out += base;
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Number of billable SMS segments for a GSM-safe message (160 single, 153 per part when joined). */
export function smsSegments(text: string): number {
  let units = 0;
  for (const ch of text) units += GSM_EXTENDED.includes(ch) ? 2 : 1;
  if (units === 0) return 0;
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function firstName(name: string): string {
  return clip((name || '').trim().split(/\s+/)[0] || 'there', 20);
}

function shortDate(date: string): string {
  const d = DateTime.fromISO(date, { locale: 'en' });
  return d.isValid ? d.toFormat('ccc d LLL') : date;
}

function shortTime(time: string): string {
  const d = DateTime.fromFormat(time, 'HH:mm', { locale: 'en' });
  return d.isValid ? d.toFormat('h:mm a') : time;
}

function maskForLog(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 5)}•••${phone.slice(-3)}` : '•••';
}

// ── Message builders (pure, so they are easy to test) ───────────────────────

export interface SmsMessageContext {
  tenantName: string;
  booking: SmsBooking;
  serviceName: string;
  attendantName?: string;
  reason?: string;
  supportPhone?: string;
}

/**
 * Every message starts with the salon name because, without a registered sender ID,
 * that is the only place the customer sees who is texting them.
 */
export function buildSmsMessage(kind: Exclude<SmsType, 'test'>, ctx: SmsMessageContext): string {
  const salon = clip(ctx.tenantName, 30);
  const name = firstName(ctx.booking.customerName);
  const service = clip(ctx.serviceName, 40);
  const date = shortDate(ctx.booking.date);
  const time = shortTime(ctx.booking.startTime);
  const ref = ctx.booking.reference;
  const withStaff = ctx.attendantName ? ` with ${clip(ctx.attendantName, 20)}` : '';

  let text: string;
  switch (kind) {
    case 'booking_received':
      text = `${salon}: Hi ${name}, we received your request for ${service} on ${date} at ${time}. Ref ${ref}. We will confirm shortly.`;
      break;
    case 'booking_confirmed':
      text = `${salon}: Hi ${name}, your ${service}${withStaff} is confirmed for ${date} at ${time}. Ref ${ref}.`;
      break;
    case 'booking_cancelled': {
      const reason = ctx.reason ? ` Reason: ${clip(ctx.reason, 40)}.` : '';
      text = `${salon}: Hi ${name}, your ${service} booking on ${date} (Ref ${ref}) has been cancelled.${reason}`;
      break;
    }
    case 'booking_rescheduled':
      text = `${salon}: Hi ${name}, your ${service} has been moved to ${date} at ${time}. Ref ${ref}.`;
      break;
    case 'appointment_reminder': {
      const call = ctx.supportPhone ? ` Call ${ctx.supportPhone} to change.` : '';
      text = `${salon}: Reminder - Hi ${name}, your ${service}${withStaff} is tomorrow at ${time}.${call}`;
      break;
    }
  }
  return toGsmSafe(text);
}

// ── Provider: Africa's Talking ──────────────────────────────────────────────

const AT_LIVE_URL = 'https://api.africastalking.com/version1/messaging';
const AT_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging';

export interface AfricasTalkingConfig {
  username: string;
  apiKey: string;
  /** Optional. Omit it to send without a registered sender ID. */
  senderId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Africa's Talking REST adapter.
 *  - username "sandbox" uses their free sandbox (messages do not reach real phones).
 *  - Success is statusCode 100-102 (Processed / Sent / Queued) or status "Success".
 * Verify this adapter against the sandbox before relying on it in production.
 */
export function createAfricasTalkingProvider(cfg: AfricasTalkingConfig): SmsProvider {
  const url = cfg.username === 'sandbox' ? AT_SANDBOX_URL : AT_LIVE_URL;
  const doFetch = cfg.fetchImpl ?? fetch;

  return {
    name: 'africastalking',
    async send(to: string, message: string): Promise<SmsProviderResult> {
      const body = new URLSearchParams({ username: cfg.username, to, message });
      if (cfg.senderId) body.set('from', cfg.senderId);

      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: {
            apiKey: cfg.apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
        });

        const raw = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {
          /* non-JSON error page */
        }

        if (!res.ok || !data) {
          return { ok: false, error: `HTTP ${res.status}: ${raw.slice(0, 200)}` };
        }

        const recipient = data?.SMSMessageData?.Recipients?.[0];
        if (!recipient) {
          return { ok: false, error: data?.SMSMessageData?.Message || 'No recipients in provider response' };
        }

        const code = Number(recipient.statusCode);
        const ok = (code >= 100 && code <= 102) || /^(success|sent|queued|processed)$/i.test(String(recipient.status));
        if (!ok) {
          return { ok: false, error: `${recipient.status ?? 'Failed'} (${recipient.statusCode ?? 'n/a'})` };
        }
        return { ok: true, providerMessageId: recipient.messageId, cost: recipient.cost };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Configuration ───────────────────────────────────────────────────────────

let warnedMisconfigured = false;

/** Returns the configured provider, or null when SMS is not set up on this server. */
export function getConfiguredProvider(): SmsProvider | null {
  const name = (process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
  if (name !== 'africastalking') return null;

  const username = process.env.AT_USERNAME?.trim();
  const apiKey = process.env.AT_API_KEY?.trim();
  if (!username || !apiKey) {
    if (!warnedMisconfigured) {
      warnedMisconfigured = true;
      console.warn('[smsService] SMS_PROVIDER=africastalking but AT_USERNAME or AT_API_KEY is missing. SMS disabled.');
    }
    return null;
  }
  return createAfricasTalkingProvider({
    username,
    apiKey,
    senderId: process.env.SMS_SENDER_ID?.trim() || undefined,
  });
}

export function isSmsConfigured(): boolean {
  return getConfiguredProvider() !== null;
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const mongoStore: SmsStore = {
  async countSent(tenantId, since, to) {
    const filter: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: 'sent',
      createdAt: { $gte: since },
    };
    if (to) filter.to = to;
    return SmsLog.countDocuments(filter);
  },
  async record(entry) {
    await SmsLog.create({ ...entry, tenantId: new mongoose.Types.ObjectId(entry.tenantId) });
  },
};

function defaultDeps(): SmsDeps {
  return {
    provider: getConfiguredProvider(),
    store: mongoStore,
    limits: {
      // Spend protection: public booking forms can trigger SMS, so cap what one phone
      // number or one salon can cost per rolling 24 hours.
      perPhonePerDay: envInt('SMS_MAX_PER_PHONE_PER_DAY', 8),
      perTenantPerDay: envInt('SMS_MAX_PER_TENANT_PER_DAY', 300),
    },
  };
}

// ── Core send ───────────────────────────────────────────────────────────────

/** Sends one SMS. Never throws: failures are logged and reported in the result. */
export async function sendSms(opts: SendSmsOptions, deps: SmsDeps = defaultDeps()): Promise<SmsSendResult> {
  const { provider, store, limits } = deps;
  if (!provider) return { sent: false, reason: 'not_configured' };

  const to = normalizeKenyanPhone(opts.to);
  const message = toGsmSafe(opts.message);
  const segments = smsSegments(message);

  const skip = async (reason: NonNullable<SmsSendResult['reason']>, error?: string): Promise<SmsSendResult> => {
    try {
      await store.record({
        tenantId: opts.tenantId,
        to: to ?? 'invalid',
        type: opts.type,
        status: reason === 'provider_error' ? 'failed' : 'skipped',
        segments,
        reference: opts.reference,
        provider: provider.name,
        error: error ?? reason,
      });
    } catch (err) {
      console.error('[smsService] Failed to record SMS log:', err);
    }
    return { sent: false, reason, error };
  };

  if (!to) return skip('invalid_phone');
  if (!message) return skip('empty_message');

  // Spend protection. If the log store is down we continue rather than block bookings.
  try {
    const since = new Date((deps.now?.() ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
    const [tenantCount, phoneCount] = await Promise.all([
      store.countSent(opts.tenantId, since),
      store.countSent(opts.tenantId, since, to),
    ]);
    if (tenantCount >= limits.perTenantPerDay) {
      console.warn(`[smsService] Salon daily SMS limit reached (${limits.perTenantPerDay}). Skipping ${opts.type}.`);
      return skip('tenant_limit');
    }
    if (phoneCount >= limits.perPhonePerDay) {
      console.warn(`[smsService] Per-phone daily limit reached for ${maskForLog(to)}. Skipping ${opts.type}.`);
      return skip('phone_limit');
    }
  } catch (err) {
    console.error('[smsService] Limit check failed, continuing:', err);
  }

  const result = await provider.send(to, message);
  try {
    await store.record({
      tenantId: opts.tenantId,
      to,
      type: opts.type,
      status: result.ok ? 'sent' : 'failed',
      segments,
      reference: opts.reference,
      provider: provider.name,
      providerMessageId: result.providerMessageId,
      cost: result.cost,
      error: result.error,
    });
  } catch (err) {
    console.error('[smsService] Failed to record SMS log:', err);
  }

  if (!result.ok) {
    console.error(`[smsService] ❌ ${opts.type} → ${maskForLog(to)} failed: ${result.error}`);
    return { sent: false, reason: 'provider_error', error: result.error };
  }
  console.log(`[smsService] ✅ ${opts.type} → ${maskForLog(to)} | ${segments} segment(s) | cost ${result.cost ?? 'n/a'}`);
  return { sent: true };
}

// ── Public notification helpers (each respects the salon's on/off switch) ───

async function dispatch(
  kind: Exclude<SmsType, 'test'>,
  tenant: SmsTenant,
  booking: SmsBooking,
  service: SmsService,
  extras: { attendantName?: string; reason?: string } = {},
): Promise<void> {
  try {
    if (!tenant.smsEnabled) return;
    const message = buildSmsMessage(kind, {
      tenantName: tenant.name,
      booking,
      serviceName: service.name,
      attendantName: extras.attendantName,
      reason: extras.reason,
      supportPhone: tenant.supportPhone,
    });
    await sendSms({
      tenantId: String(tenant._id),
      to: booking.phone,
      message,
      type: kind,
      reference: booking.reference,
    });
  } catch (err) {
    console.error(`[smsService] ${kind} dispatch failed:`, err);
  }
}

export const sendBookingReceivedSms = (t: SmsTenant, b: SmsBooking, s: SmsService, attendantName?: string) =>
  dispatch('booking_received', t, b, s, { attendantName });

export const sendBookingConfirmedSms = (t: SmsTenant, b: SmsBooking, s: SmsService, attendantName?: string) =>
  dispatch('booking_confirmed', t, b, s, { attendantName });

export const sendBookingCancelledSms = (t: SmsTenant, b: SmsBooking, s: SmsService, reason?: string) =>
  dispatch('booking_cancelled', t, b, s, { reason });

export const sendBookingRescheduledSms = (t: SmsTenant, b: SmsBooking, s: SmsService, attendantName?: string) =>
  dispatch('booking_rescheduled', t, b, s, { attendantName });

export const sendAppointmentReminderSms = (t: SmsTenant, b: SmsBooking, s: SmsService, attendantName?: string) =>
  dispatch('appointment_reminder', t, b, s, { attendantName });

/** Owner "send test SMS" button. Works even when the salon switch is off, so setup can be tested first. */
export async function sendTestSms(tenant: SmsTenant, to: string): Promise<SmsSendResult> {
  const message = toGsmSafe(`${clip(tenant.name, 30)}: This is a test SMS from your booking system. If you can read this, SMS is working.`);
  return sendSms({ tenantId: String(tenant._id), to, message, type: 'test' });
}
