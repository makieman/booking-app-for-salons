import mongoose, { Schema, Document } from 'mongoose';

/**
 * Attendant interface — represents a staff member who performs services.
 *
 * Fields:
 * - name:       Display name shown to customers (e.g. "Florence")
 * - username:   Unique login handle used by the attendant to sign in (e.g. "flo")
 * - pinHash:    bcrypt hash of their 4–6 digit PIN — never sent to the client
 * - isActive:   Soft-delete flag; deactivated attendants are hidden from the booking flow
 * - serviceIds: ObjectIds of services this attendant is qualified to perform
 */
export interface IAttendant extends Document {
  name: string;
  username: string;
  pinHash: string;
  isActive: boolean;
  serviceIds: mongoose.Types.ObjectId[];
  /** Number of consecutive failed login attempts (resets on success) */
  failedLoginAttempts: number;
  /** Account is locked until this date (null/undefined = not locked) */
  lockUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  /** Returns true if the account is currently locked out */
  isLocked(): boolean;
}

const AttendantSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    pinHash: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    serviceIds: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// Composite index for the customer-facing "active attendants for service" query
AttendantSchema.index({ isActive: 1, serviceIds: 1 });

// Virtual: check if account is currently locked
AttendantSchema.methods.isLocked = function (): boolean {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

export default mongoose.model<IAttendant>('Attendant', AttendantSchema);
