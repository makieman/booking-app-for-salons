import express from 'express';
import rateLimit from 'express-rate-limit';
import { loginAttendant } from '../controllers/authController';

const router = express.Router();

// ── IP-based rate limiter for login ──────────────────────────────────────────
// First line of defence: limits each IP to 10 attempts per 15-minute window.
// Works alongside the per-account lockout in authController for defence-in-depth.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window per IP
  standardHeaders: true,     // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,      // Disable `X-RateLimit-*` headers
  message: {
    error: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
});

// POST /api/auth/attendant/login — public login, returns JWT
router.post('/attendant/login', loginLimiter, loginAttendant);

export default router;
