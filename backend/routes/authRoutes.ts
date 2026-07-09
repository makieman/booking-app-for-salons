import express from 'express';
import rateLimit from 'express-rate-limit';
import { loginAttendant, loginOwner, registerTenant } from '../controllers/authController';

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

// PUBLIC — no tenant resolution middleware applied to these routes
// (enforced in server.ts where resolveTenant is applied selectively)

// POST /api/auth/tenant/register — create a new salon account
router.post('/tenant/register', registerLimiter, registerTenant);

// POST /api/auth/owner/login — owner email + password login
router.post('/owner/login', loginLimiter, loginOwner);

// POST /api/auth/attendant/login — staff PIN login (goes through resolveTenant in server.ts)
router.post('/attendant/login', loginLimiter, loginAttendant);

export default router;
