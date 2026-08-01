import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Attendant from '../models/Attendant';
import Tenant, { RESERVED_TENANT_SLUGS } from '../models/Tenant';
import Service from '../models/Service';
import { sendPasswordResetEmail } from '../services/emailService';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS    = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_TTL_MS  = 60 * 60 * 1000; // 1 hour

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

/** SHA-256 hash of a raw token string — what we store in the DB */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Minutes remaining on a lockout, rounded up */
function lockoutMinutesRemaining(lockUntil: Date): number {
  return Math.ceil((lockUntil.getTime() - Date.now()) / 60_000);
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
// Tracks failed attempts and locks the owner account after MAX_FAILED_ATTEMPTS.
// Responses include `remainingAttempts` on failure and `lockoutMinutes` on lock.
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

    // Constant-time compare even when tenant not found (prevents timing-based enumeration)
    const hashToCompare = tenant?.ownerPasswordHash ?? '$2b$10$invalidhashpaddingtomakeitconstanttime';
    const isMatch = await bcrypt.compare(password, hashToCompare);

    if (!tenant) {
      // Tenant not found — return generic error with no attempt info (no account to lock)
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ── Lockout check (before testing password, so locked accounts can't brute-force) ──
    if (tenant.isOwnerLocked()) {
      const mins = lockoutMinutesRemaining(tenant.ownerLockUntil as Date);
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
        lockoutMinutes: mins,
      });
    }

    if (!isMatch) {
      const attempts = (tenant.ownerFailedLoginAttempts ?? 0) + 1;
      const updates: Record<string, unknown> = { ownerFailedLoginAttempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        updates.ownerLockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        console.warn(`[authController] Owner "${tenant.slug}" locked after ${attempts} failed attempts`);
      }

      await Tenant.updateOne({ _id: tenant._id }, { $set: updates });

      const remaining = MAX_FAILED_ATTEMPTS - attempts;
      if (remaining > 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          remainingAttempts: remaining,
        });
      }

      return res.status(429).json({
        error: 'Too many failed attempts. Account locked for 15 minutes.',
        lockoutMinutes: 15,
      });
    }

    // ── Success: reset lockout state ──────────────────────────────────────
    if (tenant.ownerFailedLoginAttempts > 0 || tenant.ownerLockUntil) {
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { ownerFailedLoginAttempts: 0, ownerLockUntil: null } },
      );
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
      const mins = lockoutMinutesRemaining(attendant.lockUntil as Date);
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
        lockoutMinutes: mins,
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
        error: 'Too many failed attempts. Account locked for 15 minutes.',
        lockoutMinutes: 15,
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

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/owner/change-password  (PROTECTED — requireOwnerAuth)
// Allows a logged-in owner to change their password.
// Requires: currentPassword, newPassword.
// ════════════════════════════════════════════════════════════════════════════
export const changeOwnerPassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    }

    // req.tenant is populated by resolveTenant; req.owner is populated by requireOwnerAuth
    const tenant = await Tenant.findById(req.owner!.tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, tenant.ownerPasswordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Prevent reusing the same password
    const isSame = await bcrypt.compare(newPassword, tenant.ownerPasswordHash);
    if (isSame) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await Tenant.updateOne({ _id: tenant._id }, { $set: { ownerPasswordHash: newHash } });

    console.log(`[authController] ✅ Owner password changed for tenant: ${tenant.slug}`);
    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('[authController] changeOwnerPassword error:', error);
    return res.status(500).json({ error: 'Failed to change password' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/owner/forgot-password  (PUBLIC)
// Generates a one-time reset token, stores its SHA-256 hash, and emails the
// raw token to the owner. Always returns 200 to prevent email enumeration.
// Body: { slug, email }
// ════════════════════════════════════════════════════════════════════════════
export const forgotOwnerPassword = async (req: Request, res: Response) => {
  // Always return 200 regardless of outcome — prevents email enumeration
  const SAFE_RESPONSE = { message: 'If that account exists, a password reset email has been sent.' };

  try {
    const { slug, email } = req.body as { slug?: string; email?: string };

    if (!slug || !email) {
      return res.status(400).json({ error: 'slug and email are required' });
    }

    const tenant = await Tenant.findOne({
      slug: slug.toLowerCase().trim(),
      ownerEmail: email.toLowerCase().trim(),
      isActive: true,
    });

    if (!tenant) {
      // Silently succeed — do not reveal whether the account exists
      return res.json(SAFE_RESPONSE);
    }

    // Generate a cryptographically secure 48-byte token (URL-safe base64)
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { ownerPasswordResetTokenHash: tokenHash, ownerPasswordResetExpires: expires } },
    );

    const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${frontendUrl}?resetToken=${rawToken}&slug=${tenant.slug}`;

    // Fire-and-forget — email failure must not crash this endpoint
    sendPasswordResetEmail(tenant, resetUrl).catch(err =>
      console.error('[authController] forgotOwnerPassword — email send failed:', err),
    );

    console.log(`[authController] 🔐 Password reset requested for tenant: ${tenant.slug}`);
    return res.json(SAFE_RESPONSE);
  } catch (error) {
    console.error('[authController] forgotOwnerPassword error:', error);
    // Still return safe response on unexpected errors
    return res.json(SAFE_RESPONSE);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/owner/reset-password  (PUBLIC)
// Validates the raw reset token against the stored hash, checks expiry,
// sets the new password, clears the token, and returns a new JWT.
// Body: { slug, token, newPassword }
// ════════════════════════════════════════════════════════════════════════════
export const resetOwnerPassword = async (req: Request, res: Response) => {
  try {
    const { slug, token, newPassword } = req.body as {
      slug?: string;
      token?: string;
      newPassword?: string;
    };

    if (!slug || !token || !newPassword) {
      return res.status(400).json({ error: 'slug, token, and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    }

    const tokenHash = hashToken(token);

    const tenant = await Tenant.findOne({
      slug: slug.toLowerCase().trim(),
      ownerPasswordResetTokenHash: tokenHash,
      isActive: true,
    });

    if (!tenant) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    // Check token expiry
    if (!tenant.ownerPasswordResetExpires || tenant.ownerPasswordResetExpires < new Date()) {
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $set:   { ownerPasswordHash: newHash },
        $unset: { ownerPasswordResetTokenHash: '', ownerPasswordResetExpires: '' },
      },
    );

    console.log(`[authController] ✅ Password reset completed for tenant: ${tenant.slug}`);

    // Issue a new JWT so the owner is immediately logged in after reset
    const jwtToken = jwt.sign(
      { tenantId: tenant._id.toString(), role: 'owner' },
      getJwtSecret(),
      { expiresIn: '7d' },
    );

    return res.json({
      message: 'Password reset successfully',
      token: jwtToken,
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
    console.error('[authController] resetOwnerPassword error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};
