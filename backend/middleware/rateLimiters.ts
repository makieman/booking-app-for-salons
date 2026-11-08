import rateLimit from 'express-rate-limit';

/**
 * ── Rate Limiter: Booking Creation ──────────────────────────────────────────
 * Prevents automated appointment spamming or slot denial-of-service.
 * Limit: 10 booking attempts per hour per client IP.
 */
export const bookingCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking requests from this IP. Please try again after an hour.' },
});

/**
 * ── Rate Limiter: Booking Lookup ────────────────────────────────────────────
 * Prevents brute-forcing booking references and phone numbers.
 * Limit: 20 lookup attempts per 15 minutes per client IP.
 */
export const bookingLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookup requests. Please try again later.' },
});

/**
 * ── Rate Limiter: Customer Cancel & Reschedule ──────────────────────────────
 * Prevents repeated modification attempts on appointments.
 * Limit: 10 modification attempts per 15 minutes per client IP.
 */
export const bookingModifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many cancellation/reschedule attempts. Please try again later.' },
});

/**
 * ── Rate Limiter: Push Subscription Endpoints ──────────────────────────────
 * Prevents endpoint exhaustion and subscription flood attacks.
 * Limit: 30 subscription requests per hour per client IP.
 */
export const pushSubscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many subscription requests from this IP. Please try again later.' },
});

/**
 * ── Rate Limiter: Push Notification Test Endpoint ──────────────────────────
 * Stricter limit for sending live test push notifications.
 * Limit: 5 test push requests per hour per client IP.
 */
export const pushTestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many test push notifications sent. Please try again later.' },
});

/**
 * ── Rate Limiter: Test SMS Endpoint ────────────────────────────────────────
 * Every test SMS costs money, so keep this tight.
 * Limit: 5 test SMS requests per hour per client IP.
 */
export const smsTestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many test SMS requests. Please try again later.' },
});

/**
 * ── Rate Limiter: Platform Admin API ───────────────────────────────────────
 * Throttles guessing of the platform admin key and accidental grant loops.
 * Limit: 30 requests per 15 minutes per client IP.
 */
export const platformAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many platform admin requests. Please try again later.' },
});
