import express from 'express';
import { requirePlatformAdmin } from '../middleware/platformAuth';
import { platformAdminLimiter } from '../middleware/rateLimiters';
import { grantSmsCreditsHandler, getSmsCreditsHandler } from '../controllers/platformController';

const router = express.Router();

// Rate limit first so a wrong-key guessing attack is throttled before the key is even checked.
router.use(platformAdminLimiter, requirePlatformAdmin);

router.post('/sms-credits/grant', grantSmsCreditsHandler);
router.get('/sms-credits/:slug', getSmsCreditsHandler);

export default router;
