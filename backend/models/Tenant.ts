import mongoose, { Schema, Document } from 'mongoose';

// ── Reserved slugs that cannot be registered ──────────────────────────────────
const RESERVED_SLUGS = ['api', 'admin', 'auth', 'health', 'www', 'app'];

/**
 * Tenant model — represents one salon on the platform.
 *
 * Fields:
 * - name:               Display name, e.g. "Flo Sisterlocks"
 * - slug:               URL-safe identifier, e.g. "flo-sisterlocks". Unique.
 *                       Must match ^[a-z0-9-]+$ and cannot be a reserved word.
 * - ownerEmail:         The salon owner's login email. Unique.
 * - ownerPasswordHash:  bcrypt hash of the owner's password — never sent to client.
 * - timezone:           IANA tz string, e.g. "Africa/Nairobi".
 * - workingHours:       Slot generation boundaries for this salon.
 * - branding:           Optional logo URL and primary colour for white-labelling.
 * - plan:               'free' | 'paid' — stored for future plan-gating logic.
 * - isActive:           Soft-delete / suspension flag.
 */
export interface ITenant extends Document {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerPasswordHash: string;
  timezone: string;
  workingHours: { start: string; end: string };
  branding: {
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    emailFromName?: string;     // e.g. "Flo Sisterlocks" — display name only
    emailReplyTo?: string;
    whatsappSenderNumber?: string;
  };
  locale: 'en' | 'sw';
  mpesaTillNumber?: string;
  mpesaPaybillNumber?: string;
  supportPhone?: string;
  supportEmail?: string;
  plan: 'free' | 'paid';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [
        {
          validator: (v: string) => /^[a-z0-9-]+$/.test(v),
          message: 'Slug may only contain lowercase letters, numbers, and hyphens.',
        },
        {
          validator: (v: string) => !RESERVED_SLUGS.includes(v),
          message: 'That slug is reserved and cannot be used.',
        },
      ],
    },
    ownerEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    ownerPasswordHash: { type: String, required: true },
    timezone: { type: String, default: 'Africa/Nairobi' },
    workingHours: {
      start: { type: String, default: '09:00' },
      end:   { type: String, default: '18:00' },
    },
    branding: {
      logoUrl:      { type: String },
      faviconUrl:   { type: String },
      primaryColor: { type: String },
      emailFromName: { type: String },
      emailReplyTo:  { type: String },
      whatsappSenderNumber: { type: String },
    },
    locale: { type: String, enum: ['en', 'sw'], default: 'en' },
    mpesaTillNumber: { type: String },
    mpesaPaybillNumber: { type: String },
    supportPhone: { type: String },
    supportEmail: { type: String },
    plan:     { type: String, enum: ['free', 'paid'], default: 'free' },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const RESERVED_TENANT_SLUGS = RESERVED_SLUGS;
export default mongoose.model<ITenant>('Tenant', TenantSchema);
