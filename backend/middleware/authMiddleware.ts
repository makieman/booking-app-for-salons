import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Shape of the JWT payload we issue for attendants.
 */
export interface AttendantJwtPayload {
  sub: string;   // attendant MongoDB ObjectId
  role: 'attendant';
  name: string;
  iat: number;
  exp: number;
}

/**
 * Extend Express Request so downstream handlers can read req.attendant.
 */
declare global {
  namespace Express {
    interface Request {
      attendant?: { id: string; name: string; role: 'attendant' };
    }
  }
}

/**
 * requireAttendantAuth — validates the Bearer JWT issued at login.
 * Attaches req.attendant = { id, name, role } on success.
 * Returns 401 for missing, malformed, or expired tokens.
 */
export function requireAttendantAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('[authMiddleware] JWT_SECRET is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AttendantJwtPayload;

    if (payload.role !== 'attendant') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    req.attendant = { id: payload.sub, name: payload.name, role: 'attendant' };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireOwnerAuth — validates the X-Owner-Pin header against OWNER_PIN env var.
 * Falls back to the legacy hardcoded '1234' if OWNER_PIN is not set.
 * Used to protect the attendant CRUD routes.
 */
export function requireOwnerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const pin = req.headers['x-owner-pin'] as string | undefined;
  const validPin = process.env.OWNER_PIN ?? '1234';

  if (!pin || pin !== validPin) {
    res.status(403).json({ error: 'Owner PIN required' });
    return;
  }

  next();
}
