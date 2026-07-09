import { Request, Response } from 'express';
import Tenant from '../models/Tenant';

export const getTenantSettings = async (req: Request, res: Response) => {
  try {
    const tenant = await Tenant.findById(req.tenant!._id).select('-ownerPasswordHash');
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    return res.json(tenant);
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
        logoUrl: tenant.branding.logoUrl,
        faviconUrl: tenant.branding.faviconUrl,
        primaryColor: tenant.branding.primaryColor,
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
      },
      locale: tenant.locale,
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
      branding, // primaryColor, emailFromName, emailReplyTo, whatsappSenderNumber
      locale,
      mpesaTillNumber,
      mpesaPaybillNumber,
      supportPhone,
      supportEmail,
    } = req.body;

    const tenant = await Tenant.findById(req.tenant!._id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (name !== undefined) tenant.name = name;
    if (timezone !== undefined) tenant.timezone = timezone;
    if (workingHours !== undefined) tenant.workingHours = workingHours;
    if (locale !== undefined) tenant.locale = locale;
    if (mpesaTillNumber !== undefined) tenant.mpesaTillNumber = mpesaTillNumber;
    if (mpesaPaybillNumber !== undefined) tenant.mpesaPaybillNumber = mpesaPaybillNumber;
    if (supportPhone !== undefined) tenant.supportPhone = supportPhone;
    if (supportEmail !== undefined) tenant.supportEmail = supportEmail;

    if (branding !== undefined) {
      tenant.branding = {
        ...tenant.branding,
        ...branding,
      };
    }

    await tenant.save();

    const safeTenant = await Tenant.findById(tenant._id).select('-ownerPasswordHash');
    return res.json(safeTenant);
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

    return res.json({ success: true, faviconUrl, branding: tenant.branding });
  } catch (error) {
    console.error('[tenantController] uploadFavicon error:', error);
    return res.status(500).json({ error: 'Failed to upload favicon' });
  }
};
