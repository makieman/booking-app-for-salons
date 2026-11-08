import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import SmsCreditTx, { SmsCreditTxKind } from '../models/SmsCreditTx';

/**
 * Prepaid SMS credits. 1 credit = 1 SMS segment (a normal message is one segment).
 *
 * All balance changes are single atomic updates ($inc with a >= guard), so two
 * bookings confirmed at the same moment can never spend the same credit and the
 * balance can never go negative. Every change is also written to SmsCreditTx.
 */

/** What smsService needs from the credit system (kept tiny so tests can fake it). */
export interface SmsCredits {
  /** Atomically takes `units` credits. Returns false when the salon cannot afford it. */
  reserve(tenantId: string, units: number, reference?: string): Promise<boolean>;
  /** Gives credits back (used when the provider failed to send). */
  refund(tenantId: string, units: number, reference?: string): Promise<void>;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Free credits every salon gets once, so they can try SMS before paying. */
export function starterCredits(): number {
  return envNonNegativeInt('SMS_STARTER_CREDITS', 20);
}

/** Balance at or below this shows a "running low" warning in the dashboard. */
export function lowBalanceThreshold(): number {
  return envNonNegativeInt('SMS_LOW_BALANCE', 10);
}

async function logTx(
  tenantId: mongoose.Types.ObjectId,
  kind: SmsCreditTxKind,
  delta: number,
  balanceAfter: number,
  extra: { reference?: string; note?: string } = {},
): Promise<void> {
  try {
    await SmsCreditTx.create({ tenantId, kind, delta, balanceAfter, ...extra });
  } catch (err) {
    // The balance already changed atomically; a missing audit row must not break sending.
    console.error('[smsCredits] Failed to write ledger entry:', err);
  }
}

/**
 * Grants the one-time starter credits. Lazy and idempotent: the first call for a salon
 * wins the atomic update, every later call is a no-op. Works for salons created before
 * credits existed, with no migration script.
 */
export async function ensureStarterCredits(tenantId: string): Promise<void> {
  const id = new mongoose.Types.ObjectId(tenantId);
  const amount = starterCredits();

  if (amount === 0) {
    await Tenant.updateOne({ _id: id, smsStarterGranted: { $ne: true } }, { $set: { smsStarterGranted: true } });
    return;
  }

  const updated = await Tenant.findOneAndUpdate(
    { _id: id, smsStarterGranted: { $ne: true } },
    { $set: { smsStarterGranted: true }, $inc: { smsCredits: amount } },
    { new: true },
  ).select('smsCredits');

  if (updated) {
    await logTx(id, 'starter', amount, updated.smsCredits ?? amount, { note: 'Free starter credits' });
  }
}

export interface CreditSummary {
  credits: number;
  lowBalance: boolean;
}

export async function getCreditSummary(tenantId: string): Promise<CreditSummary> {
  await ensureStarterCredits(tenantId);
  const tenant = await Tenant.findById(tenantId).select('smsCredits');
  const credits = tenant?.smsCredits ?? 0;
  return { credits, lowBalance: credits <= lowBalanceThreshold() };
}

/** Adds credits (platform admin grant, or a confirmed payment later). Returns the new balance. */
export async function grantCredits(
  tenantId: string,
  credits: number,
  opts: { kind?: Extract<SmsCreditTxKind, 'grant' | 'purchase'>; reference?: string; note?: string } = {},
): Promise<number> {
  if (!Number.isInteger(credits) || credits <= 0) throw new Error('credits must be a positive whole number');
  const id = new mongoose.Types.ObjectId(tenantId);

  const updated = await Tenant.findByIdAndUpdate(id, { $inc: { smsCredits: credits } }, { new: true }).select('smsCredits');
  if (!updated) throw new Error('Tenant not found');

  const balance = updated.smsCredits ?? credits;
  await logTx(id, opts.kind ?? 'grant', credits, balance, { reference: opts.reference, note: opts.note });
  return balance;
}

export const mongoCredits: SmsCredits = {
  async reserve(tenantId, units, reference) {
    if (units <= 0) return true;
    await ensureStarterCredits(tenantId);
    const id = new mongoose.Types.ObjectId(tenantId);

    const updated = await Tenant.findOneAndUpdate(
      { _id: id, smsCredits: { $gte: units } },
      { $inc: { smsCredits: -units } },
      { new: true },
    ).select('smsCredits');

    if (!updated) return false;
    await logTx(id, 'usage', -units, updated.smsCredits ?? 0, { reference });
    return true;
  },

  async refund(tenantId, units, reference) {
    if (units <= 0) return;
    const id = new mongoose.Types.ObjectId(tenantId);
    const updated = await Tenant.findByIdAndUpdate(id, { $inc: { smsCredits: units } }, { new: true }).select('smsCredits');
    if (updated) await logTx(id, 'refund', units, updated.smsCredits ?? units, { reference, note: 'Provider failed to send' });
  },
};
