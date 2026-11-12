import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Guards the platform-owner API (granting SMS credits, etc.).
 *
 * This is NOT a salon owner: it is you, the platform operator. There is no platform login
 * in the app, so access is a long secret in the PLATFORM_ADMIN_KEY env var, sent in the
 * `x-platform-admin-key` header. The API stays completely disabled until that key is set
 * (and is at least 24 characters), so an unconfigured server can never be talked into
 * handing out credits.
 */
const MIN_KEY_LENGTH = 24;

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.PLATFORM_ADMIN_KEY?.trim();
  if (!configured || configured.length < MIN_KEY_LENGTH) {
    res.status(503).json({ error: 'Platform admin API is not enabled on this server.' });
    return;
  }

  const supplied = req.header('x-platform-admin-key') ?? '';
  // Hash both sides so the comparison is constant-time regardless of input length.
  if (!crypto.timingSafeEqual(sha256(supplied), sha256(configured))) {
    res.status(401).json({ error: 'Invalid platform admin key.' });
    return;
  }

  next();
}
