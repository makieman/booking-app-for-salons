import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Attendant from '../models/Attendant';
import Tenant, { RESERVED_TENANT_SLUGS } from '../models/Tenant';
import Service from '../models/Service';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

// ── Default services seeded for every new tenant ──────────────────────────────
const DEFAULT_SERVICES = [
  {
    name: 'Sisterlocks™ Installation',
    duration: 1200,
    price: 10000,
    description: 'Professional installation by a certified consultant.',
    image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?auto=format&fit=crop&q=80&w=400',
  },
  {
    name: 'Retightening & Maintenance',
    duration: 240,
    price: 3500,
    description: 'Regular maintenance to keep your Sisterlocks neat and healthy.',
    image: 'https://images.unsplash.com/photo-1620331311520-246422fd82f9?auto=format&fit=crop&q=80&w=400',
  },
  {
    name: 'Consultation',
    duration: 60,
    price: 1000,
    description: 'Mandatory session before installation.',
    image: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?auto=format&fit=crop&q=80&w=400',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/tenant/register  (PUBLIC — no tenant resolution applied)
// Creates a new salon tenant and seeds 3 default services.
// Uses a Mongoose session transaction so an orphaned tenant is never left
// behind if service seeding fails.
// ════════════════════════════════════════════════════════════════════════════
export const registerTenant = async (req: Request, res: Response) => {
  const { salonName, slug, ownerEmail, ownerPassword } = req.body as {
    salonName?: string;
    slug?: string;
    ownerEmail?: string;
    ownerPassword?: string;
  };

  // ── Input validation (run before touching the DB) ───────────────────────
  if (!salonName || !slug || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ error: 'salonName, slug, ownerEmail, and ownerPassword are required' });
  }

  const normalizedSlug = slug.toLowerCase().trim();

  if (!isValidSlug(normalizedSlug)) {
    return res.status(400).json({
      error: 'Slug may only contain lowercase letters, numbers, and hyphens (e.g. "my-salon")',
    });
  }

  if (RESERVED_TENANT_SLUGS.includes(normalizedSlug)) {
    return res.status(400).json({ error: `"${normalizedSlug}" is a reserved slug and cannot be used` });
  }

  if (!isValidEmail(ownerEmail)) {
    return res.status(400).json({ error: 'ownerEmail must be a valid email address' });
  }

  if (ownerPassword.length < 8) {
    return res.status(400).json({ error: 'ownerPassword must be at least 8 characters' });
  }

  // ── Transaction: create tenant + seed services atomically ───────────────
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);

    const [tenant] = await Tenant.create(
      [{ name: salonName.trim(), slug: normalizedSlug, ownerEmail: ownerEmail.toLowerCase().trim(), ownerPasswordHash }],
      { session }
    );

    const servicesDocs = DEFAULT_SERVICES.map(s => ({ ...s, tenantId: tenant._id }));
    await Service.insertMany(servicesDocs, { session });

    await session.commitTransaction();
    session.endSession();

    console.log(`[authController] ✅ Tenant registered: ${tenant.slug} (${tenant._id})`);

    const token = jwt.sign(
      { tenantId: tenant._id.toString(), role: 'owner' },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(201).json({ token, tenant: { _id: tenant._id, name: tenant.name, slug: tenant.slug } });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    if (error.code === 11000) {
      const field = error.keyPattern?.slug ? 'slug' : 'ownerEmail';
      return res.status(409).json({ error: `That ${field} is already taken` });
    }
    console.error('[authController] registerTenant error:', error);
    return res.status(500).json({ error: 'Failed to register tenant' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/owner/login  (PUBLIC — no tenant resolution applied)
// Validates slug + email + password. Returns JWT { tenantId, role: 'owner' }.
// ════════════════════════════════════════════════════════════════════════════
export const loginOwner = async (req: Request, res: Response) => {
  try {
    const { slug, email, password } = req.body as {
      slug?: string;
      email?: string;
      password?: string;
    };

    if (!slug || !email || !password) {
      return res.status(400).json({ error: 'slug, email, and password are required' });
    }

    const tenant = await Tenant.findOne({ slug: slug.toLowerCase().trim(), isActive: true });

    // Constant-time compare even when tenant not found
    const hashToCompare = tenant?.ownerPasswordHash ?? '$2b$10$invalidhashpaddingtomakeitconstanttime';
    const isMatch = await bcrypt.compare(password, hashToCompare);

    if (!tenant || !isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { tenantId: tenant._id.toString(), role: 'owner' },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      tenant: {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        timezone: tenant.timezone,
        workingHours: tenant.workingHours,
        branding: tenant.branding,
        plan: tenant.plan,
      },
    });
  } catch (error) {
    console.error('[authController] loginOwner error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/attendant/login  (requires resolveTenant middleware)
// Validates username + PIN scoped to the resolved tenant.
// JWT payload gains tenantId.
// ════════════════════════════════════════════════════════════════════════════
export const loginAttendant = async (req: Request, res: Response) => {
  try {
    const { username, pin } = req.body as { username?: string; pin?: string };

    if (!username || !pin) {
      return res.status(400).json({ error: 'username and pin are required' });
    }

    // Scope lookup to the resolved tenant — cross-tenant username collisions are fine
    const attendant = await Attendant.findOne({
      username: username.toLowerCase().trim(),
      tenantId: req.tenant!._id,
    });

    // Constant-time compare to prevent username-enumeration timing attacks
    if (!attendant || !attendant.isActive) {
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
      const attempts = (attendant.failedLoginAttempts ?? 0) + 1;
      const updates: Record<string, unknown> = { failedLoginAttempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        console.warn(`[authController] Attendant "${attendant.username}" (tenant: ${req.tenant!.slug}) locked after ${attempts} failed attempts`);
      }

      await Attendant.updateOne({ _id: attendant._id }, { $set: updates });

      const remaining = MAX_FAILED_ATTEMPTS - attempts;
      if (remaining > 0) {
        return res.status(401).json({ error: 'Invalid credentials', remainingAttempts: remaining });
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

    const token = jwt.sign(
      {
        sub: attendant._id.toString(),
        role: 'attendant',
        name: attendant.name,
        tenantId: attendant.tenantId.toString(),
      },
      getJwtSecret(),
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
    return res.status(500).json({ error: 'Login failed' });
  }
};
