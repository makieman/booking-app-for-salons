import express from 'express';
import { requireOwnerAuth } from '../middleware/authMiddleware';
import { upload } from '../config/cloudinary';
import { smsTestLimiter } from '../middleware/rateLimiters';
import {
  getTenantSettings,
  updateTenantSettings,
  uploadLogo,
  uploadFavicon,
  getPublicTenant,
  sendTestSmsHandler,
} from '../controllers/tenantController';

const router = express.Router();

// GET /api/tenant/public — Client-facing branding/settings (no owner auth)
router.get('/public', getPublicTenant);

// Settings management (Owner only)
router.get('/settings', requireOwnerAuth, getTenantSettings);
router.patch('/settings', requireOwnerAuth, updateTenantSettings);

// Send a test SMS to the owner's own phone (Owner only, rate limited)
router.post('/sms/test', requireOwnerAuth, smsTestLimiter, sendTestSmsHandler);

// Branding upload (Owner only)
router.post('/branding/logo', requireOwnerAuth, upload.single('logo'), uploadLogo);
router.post('/branding/favicon', requireOwnerAuth, upload.single('favicon'), uploadFavicon);

export default router;
