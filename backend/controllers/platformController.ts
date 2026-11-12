import { Request, Response } from 'express';
import Tenant from '../models/Tenant';
import SmsCreditTx from '../models/SmsCreditTx';
import { grantCredits, getCreditSummary } from '../services/smsCreditService';

const MAX_GRANT = 10_000;

async function findTenantBySlug(raw: unknown) {
  const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return Tenant.findOne({ slug }).select('_id slug name');
}

/**
 * POST /api/platform/sms-credits/grant   (platform admin only)
 * Body: { tenantSlug, credits, reference?, note? }
 * Use after receiving an M-Pesa payment from a salon. `reference` should be the M-Pesa code
 * so every credit in the ledger can be traced back to a payment.
 */
export const grantSmsCreditsHandler = async (req: Request, res: Response) => {
  try {
    const credits = Number(req.body?.credits);
    if (!Number.isInteger(credits) || credits < 1 || credits > MAX_GRANT) {
      return res.status(400).json({ error: `credits must be a whole number between 1 and ${MAX_GRANT}.` });
    }

    const tenant = await findTenantBySlug(req.body?.tenantSlug);
    if (!tenant) return res.status(404).json({ error: 'Salon not found.' });

    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 60) : undefined;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : undefined;

    const balance = await grantCredits(String(tenant._id), credits, { kind: 'grant', reference, note });
    console.log(`[platform] Granted ${credits} SMS credits to "${tenant.slug}" (ref ${reference ?? 'n/a'}). Balance: ${balance}`);
    return res.json({ success: true, tenantSlug: tenant.slug, granted: credits, balance });
  } catch (error) {
    console.error('[platformController] grantSmsCredits error:', error);
    return res.status(500).json({ error: 'Failed to grant credits.' });
  }
};

/** GET /api/platform/sms-credits/:slug  (platform admin only) — balance and recent ledger. */
export const getSmsCreditsHandler = async (req: Request, res: Response) => {
  try {
    const tenant = await findTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Salon not found.' });

    const [summary, recent] = await Promise.all([
      getCreditSummary(String(tenant._id)),
      SmsCreditTx.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    return res.json({
      tenantSlug: tenant.slug,
      name: tenant.name,
      balance: summary.credits,
      lowBalance: summary.lowBalance,
      recent: recent.map((t) => ({
        kind: t.kind,
        delta: t.delta,
        balanceAfter: t.balanceAfter,
        reference: t.reference,
        note: t.note,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('[platformController] getSmsCredits error:', error);
    return res.status(500).json({ error: 'Failed to load credits.' });
  }
};
