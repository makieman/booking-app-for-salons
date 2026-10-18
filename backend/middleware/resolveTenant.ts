import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant';

/**
 * resolveTenant middleware
 *
 * Reads the X-Tenant-Slug header, looks up the matching active Tenant in the
 * database, and attaches it to req.tenant for downstream controllers.
 *
 * Returns:
 *  400 — if the X-Tenant-Slug header is missing
 *  404 — if no active tenant matches the slug
 *  500 — on unexpected DB errors
 *
 * This middleware is applied to all /api routes EXCEPT:
 *  - POST /api/auth/tenant/register  (public signup)
 *  - POST /api/auth/owner/login      (public login)
 *  - GET  /api/health                (public health check)
 * Those exclusions are enforced in server.ts.
 */
// ── In-Memory Tenant Cache (5 min TTL) ──────────────────────────────────
// Avoids repeated ~300ms remote DB round-trips on every single HTTP request.
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const tenantCache = new Map<string, { tenant: any; expiresAt: number }>();

export function invalidateTenantCache(slug?: string): void {
  if (slug) {
    tenantCache.delete(slug.toLowerCase().trim());
  } else {
    tenantCache.clear();
  }
}

export async function resolveTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const slug = req.headers['x-tenant-slug'];

  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'X-Tenant-Slug header is required' });
    return;
  }

  const normalizedSlug = slug.toLowerCase().trim();

  // Check in-memory cache first
  const cached = tenantCache.get(normalizedSlug);
  if (cached && cached.expiresAt > Date.now()) {
    req.tenant = cached.tenant;
    return next();
  }

  try {
    const tenant = await Tenant.findOne({ slug: normalizedSlug, isActive: true });

    if (!tenant) {
      res.status(404).json({ error: `Salon "${slug}" not found or is inactive` });
      return;
    }

    tenantCache.set(normalizedSlug, {
      tenant,
      expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
    });

    req.tenant = tenant;
    next();
  } catch (err) {
    console.error('[resolveTenant] DB error:', err);
    res.status(500).json({ error: 'Failed to resolve tenant' });
  }
}
