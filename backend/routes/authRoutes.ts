import express from 'express';
import rateLimit from 'express-rate-limit';
import { loginAttendant, loginOwner, registerTenant, changeOwnerPassword, forgotOwnerPassword, resetOwnerPassword } from '../controllers/authController';
import { requireOwnerAuth } from '../middleware/authMiddleware';

const router = express.Router();

// ── IP-based rate limiter for login endpoints ─────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP. Please try again after 15 minutes.' },
});

// ── Rate limiter for registration (stricter — 5 per hour) ───────────────────
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts from this IP. Please try again later.' },
});

// ── Rate limiter for password reset requests (5 per hour) ────────────────────
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again later.' },
});

// PUBLIC — no tenant resolution middleware applied to these routes
// (enforced in server.ts where resolveTenant is applied selectively)

// POST /api/auth/tenant/register — create a new salon account
router.post('/tenant/register', registerLimiter, registerTenant);

// POST /api/auth/owner/login — owner email + password login
router.post('/owner/login', loginLimiter, loginOwner);

// POST /api/auth/attendant/login — staff PIN login (goes through resolveTenant in server.ts)
router.post('/attendant/login', loginLimiter, loginAttendant);

// POST /api/auth/owner/forgot-password — request a password reset email (PUBLIC, safe response)
router.post('/owner/forgot-password', passwordResetLimiter, forgotOwnerPassword);

// POST /api/auth/owner/reset-password — set new password using emailed token (PUBLIC)
router.post('/owner/reset-password', passwordResetLimiter, resetOwnerPassword);

// POST /api/auth/owner/change-password — change password while logged in (PROTECTED)
// Note: resolveTenant is NOT needed here because we look up by req.owner.tenantId (from the JWT)
router.post('/owner/change-password', requireOwnerAuth, changeOwnerPassword);

export default router;

