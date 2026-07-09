import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { ITenant } from '../models/Tenant';

// ── JWT payload shapes ────────────────────────────────────────────────────────

export interface AttendantJwtPayload {
  sub: string;        // attendant MongoDB ObjectId
  role: 'attendant';
  name: string;
  tenantId: string;   // tenant ObjectId as string
  iat: number;
  exp: number;
}

export interface OwnerJwtPayload {
  tenantId: string;   // tenant ObjectId as string
  role: 'owner';
  iat: number;
  exp: number;
}

// ── Extend Express Request ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      attendant?: { id: string; name: string; role: 'attendant'; tenantId: string };
      owner?: { tenantId: string; role: 'owner' };
      tenant?: ITenant;
    }
  }
}

// ── Shared helper ─────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

// ════════════════════════════════════════════════════════════════════════════
// requireOwnerAuth
// Validates a Bearer JWT with role='owner' and checks that the token's
// tenantId matches the tenant resolved by resolveTenant middleware.
// This is the primary security boundary — never bypass this check.
// ════════════════════════════════════════════════════════════════════════════
export function requireOwnerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Owner authentication required' });
    return;
  }

  const token = authHeader.slice(7);

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as OwnerJwtPayload;

    if (payload.role !== 'owner') {
      res.status(403).json({ error: 'Forbidden — owner token required' });
      return;
    }

    // ── Security boundary: token tenant must match the resolved tenant ──────
    if (payload.tenantId !== req.tenant!._id.toString()) {
      res.status(403).json({ error: 'Forbidden — token does not belong to this tenant' });
      return;
    }

    req.owner = { tenantId: payload.tenantId, role: 'owner' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// requireAttendantAuth
// Validates a Bearer JWT with role='attendant' and checks that the token's
// tenantId matches the tenant resolved by resolveTenant middleware.
// ════════════════════════════════════════════════════════════════════════════
export function requireAttendantAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AttendantJwtPayload;

    if (payload.role !== 'attendant') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // ── Security boundary: token tenant must match the resolved tenant ──────
    if (payload.tenantId !== req.tenant!._id.toString()) {
      res.status(403).json({ error: 'Forbidden — token does not belong to this tenant' });
      return;
    }

    req.attendant = { id: payload.sub, name: payload.name, role: 'attendant', tenantId: payload.tenantId };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
