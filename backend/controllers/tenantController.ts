import { Request, Response } from 'express';
import Tenant from '../models/Tenant';
import { invalidateTenantCache } from '../middleware/resolveTenant';
import { isSmsConfigured, sendTestSms } from '../services/smsService';
import { getCreditSummary } from '../services/smsCreditService';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';

/** Owner-only SMS info for the dashboard. Never throws: a lookup failure must not break settings. */
async function smsDashboardInfo(tenantId: string) {
  const base = {
    // smsAvailable tells the dashboard whether the server has an SMS provider set up at all.
    smsAvailable: isSmsConfigured(),
    smsTopUpContact: process.env.SMS_TOPUP_CONTACT?.trim() || undefined,
  };
  try {
    const { credits, lowBalance } = await getCreditSummary(tenantId);
    return { ...base, smsCredits: credits, smsLowBalance: lowBalance };
  } catch (err) {
    console.error('[tenantController] SMS credit summary failed:', err);
    return base;
  }
}

export const getTenantSettings = async (req: Request, res: Response) => {
  try {
    const tenant = await Tenant.findById(req.tenant!._id).select('-ownerPasswordHash');
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    return res.json({ ...tenant.toObject(), ...(await smsDashboardInfo(String(tenant._id))) });
  } catch (error) {
    console.error('[tenantController] getTenantSettings error:', error);
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

export const getPublicTenant = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant;
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    return res.json({
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      workingHours: tenant.workingHours,
      branding: {
        logoUrl: tenant.branding?.logoUrl,
        faviconUrl: tenant.branding?.faviconUrl,
        primaryColor: tenant.branding?.primaryColor,
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
      },
      locale: tenant.locale,
      bookingRules: tenant.bookingRules || {
        slotInterval: 30,
        bufferMinutes: 0,
        minNoticeHours: 2,
        holidays: [],
      },
      supportPhone: tenant.supportPhone,
      supportEmail: tenant.supportEmail,
    });
  } catch (error) {
    console.error('[tenantController] getPublicTenant error:', error);
    return res.status(500).json({ error: 'Failed to fetch public tenant details' });
  }
};

export const updateTenantSettings = async (req: Request, res: Response) => {
  try {
    const {
      name,
      timezone,
      workingHours,
      bookingRules,
      branding, // primaryColor, emailFromName, emailReplyTo, whatsappSenderNumber
      locale,
      mpesaTillNumber,
      mpesaPaybillNumber,
      supportPhone,
      supportEmail,
      smsEnabled,
      whatsappPhoneNumberId,
    } = req.body;

    const tenant = await Tenant.findById(req.tenant!._id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (whatsappPhoneNumberId !== undefined) tenant.whatsappPhoneNumberId = whatsappPhoneNumberId;

    if (name !== undefined) tenant.name = name;
    if (timezone !== undefined) tenant.timezone = timezone;
    if (workingHours !== undefined) tenant.workingHours = workingHours;
    if (bookingRules !== undefined) {
      tenant.bookingRules = {
        ...(tenant.bookingRules || { slotInterval: 30, bufferMinutes: 0, minNoticeHours: 2, holidays: [] }),
        ...bookingRules,
      };
    }
    if (locale !== undefined) tenant.locale = locale;
    if (mpesaTillNumber !== undefined) tenant.mpesaTillNumber = mpesaTillNumber;
    if (mpesaPaybillNumber !== undefined) tenant.mpesaPaybillNumber = mpesaPaybillNumber;
    if (supportPhone !== undefined) tenant.supportPhone = supportPhone;
    if (supportEmail !== undefined) tenant.supportEmail = supportEmail;
    if (typeof smsEnabled === 'boolean') tenant.smsEnabled = smsEnabled;

    if (branding !== undefined) {
      tenant.branding = {
        ...tenant.branding,
        ...branding,
      };
    }

    await tenant.save();
    invalidateTenantCache(tenant.slug);

    const safeTenant = await Tenant.findById(tenant._id).select('-ownerPasswordHash');
    return res.json({ ...safeTenant!.toObject(), ...(await smsDashboardInfo(String(tenant._id))) });
  } catch (error) {
    console.error('[tenantController] updateTenantSettings error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
};

export const uploadLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const logoUrl = (req.file as any).path;

    const tenant = await Tenant.findById(req.tenant!._id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    tenant.branding.logoUrl = logoUrl;
    await tenant.save();
    invalidateTenantCache(tenant.slug);

    return res.json({ success: true, logoUrl, branding: tenant.branding });
  } catch (error) {
    console.error('[tenantController] uploadLogo error:', error);
    return res.status(500).json({ error: 'Failed to upload logo' });
  }
};

export const uploadFavicon = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const faviconUrl = (req.file as any).path;

    const tenant = await Tenant.findById(req.tenant!._id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    tenant.branding.faviconUrl = faviconUrl;
    await tenant.save();
    invalidateTenantCache(tenant.slug);

    return res.json({ success: true, faviconUrl, branding: tenant.branding });
  } catch (error) {
    console.error('[tenantController] uploadFavicon error:', error);
    return res.status(500).json({ error: 'Failed to upload favicon' });
  }
};

/**
 * POST /api/tenant/sms/test  (owner only, rate limited)
 * Sends one test SMS to the number the owner types in, so they can confirm SMS works
 * before switching it on for customers. Always sent to the owner's own number.
 */
export const sendTestSmsHandler = async (req: Request, res: Response) => {
  try {
    if (!isSmsConfigured()) {
      return res.status(503).json({ error: 'SMS is not configured on the server yet.' });
    }
    const phone = normalizeKenyanPhone(String(req.body?.phone ?? ''));
    if (!phone) {
      return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' });
    }
    const tenant = await Tenant.findById(req.tenant!._id).select('_id name smsEnabled supportPhone');
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const result = await sendTestSms(tenant, phone);
    if (!result.sent) {
      if (result.reason === 'insufficient_credits') {
        return res.status(402).json({ error: 'Not enough SMS credits. Top up to send messages.', reason: result.reason });
      }
      let message = 'The SMS provider rejected the message. Check the server logs.';
      if (result.reason === 'phone_limit' || result.reason === 'tenant_limit') {
        message = 'Daily SMS limit reached. Try again tomorrow.';
      } else if (result.error) {
        if (result.error.includes('406') || /blacklist/i.test(result.error)) {
          message = `Recipient rejected: ${result.error}. This number has blocked promotional SMS (e.g. Safaricom *456*9*5# DND) or is on the AT blacklist.`;
        } else {
          message = `SMS provider error: ${result.error}`;
        }
      }
      return res.status(502).json({ error: message, reason: result.reason, details: result.error });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[tenantController] sendTestSms error:', error);
    return res.status(500).json({ error: 'Failed to send test SMS' });
  }
};
