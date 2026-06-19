import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Attendant from '../models/Attendant';

// ── Account lockout settings ─────────────────────────────────────────────────
/** Maximum consecutive failed login attempts before the account is locked */
const MAX_FAILED_ATTEMPTS = 5;
/** How long an account stays locked after exceeding the limit (ms) */
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/auth/attendant/login
 * Validates username + PIN, returns a signed JWT on success.
 *
 * Security:
 *  - After MAX_FAILED_ATTEMPTS consecutive failures the account is locked
 *    for LOCK_DURATION_MS. The response deliberately does not reveal
 *    whether the account exists or is locked (always "Invalid credentials").
 *  - A successful login resets the failure counter.
 *
 * Body: { username: string; pin: string }
 * Response 200: { token: string; attendant: { _id, name, serviceIds } }
 * Response 401: { error: 'Invalid credentials' }
 * Response 429: { error: 'Account temporarily locked …' }
 */
export const loginAttendant = async (req: Request, res: Response) => {
  try {
    const { username, pin } = req.body as { username?: string; pin?: string };

    if (!username || !pin) {
      return res.status(400).json({ error: 'username and pin are required' });
    }

    // Find by username (stored lowercase)
    const attendant = await Attendant.findOne({
      username: username.toLowerCase().trim(),
    });

    // Use a constant-time comparison (bcrypt handles timing safety)
    if (!attendant || !attendant.isActive) {
      // Still call compare to prevent username-enumeration timing attacks
      await bcrypt.compare(pin, '$2b$10$invalidhashpaddingtomakeitconstanttime');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ── Account lockout check ───────────────────────────────────────────────
    if (attendant.isLocked()) {
      const remainingMs = (attendant.lockUntil as Date).getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60_000);
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${remainingMin} minute${remainingMin === 1 ? '' : 's'}.`,
      });
    }

    const isMatch = await bcrypt.compare(pin, attendant.pinHash);

    if (!isMatch) {
      // ── Increment failure counter, lock if threshold exceeded ────────────
      const attempts = (attendant.failedLoginAttempts ?? 0) + 1;
      const updates: Record<string, unknown> = { failedLoginAttempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        console.warn(
          `[authController] Account "${attendant.username}" locked after ${attempts} failed attempts`,
        );
      }

      await Attendant.updateOne({ _id: attendant._id }, { $set: updates });

      // Remaining attempts hint (only when not yet locked)
      const remaining = MAX_FAILED_ATTEMPTS - attempts;
      if (remaining > 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          remainingAttempts: remaining,
        });
      }

      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
      });
    }

    // ── Success: reset lockout state ──────────────────────────────────────
    if (attendant.failedLoginAttempts > 0 || attendant.lockUntil) {
      await Attendant.updateOne(
        { _id: attendant._id },
        { $set: { failedLoginAttempts: 0, lockUntil: null } },
      );
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[authController] JWT_SECRET not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { sub: attendant._id.toString(), role: 'attendant', name: attendant.name },
      secret,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      attendant: {
        _id: attendant._id,
        name: attendant.name,
        serviceIds: attendant.serviceIds,
      },
    });
  } catch (error) {
    console.error('[authController] loginAttendant error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};
