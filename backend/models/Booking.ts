import mongoose, { Schema, Document } from 'mongoose';
import type { IAttendant } from './Attendant';

/**
 * Booking interface — represents a customer's booked appointment.
 *
 * Fields:
 * - tenantId: The salon this booking belongs to
 * - customerName: The client's full name
 * - phone: Contact number
 * - serviceId: Reference to the Service they booked
 * - date: The appointment date (YYYY-MM-DD format)
 * - startTime: When the appointment starts (HH:mm)
 * - endTime: When it ends (HH:mm), calculated from service duration
 * - status: The booking lifecycle state (pending → confirmed | cancelled)
 */
export interface IBooking extends Document {
  tenantId: mongoose.Types.ObjectId;
  reference: string;
  customerName: string;
  phone: string;
  email?: string;     // Customer email for notifications (optional — not all legacy bookings have it)
  serviceId: mongoose.Types.ObjectId;
  /** Reference to the Attendant performing this booking. null = unassigned / "any" */
  attendantId?: mongoose.Types.ObjectId | IAttendant | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  /** 'completed' is set by the attendant after performing the service */
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema: Schema = new Schema(
  {
    tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    // reference is no longer globally unique — scoped per-tenant via compound index below
    reference: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: false },  // Optional — used for email notifications
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    /** Null means "any available" was chosen or the booking predates the attendant feature */
    attendantId: { type: Schema.Types.ObjectId, ref: 'Attendant', required: false, default: null },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Compound unique: reference is unique within a tenant, not globally
BookingSchema.index({ tenantId: 1, reference: 1 }, { unique: true });

// Performance indexes for common query patterns
BookingSchema.index({ tenantId: 1, date: 1 });
BookingSchema.index({ tenantId: 1, status: 1 });
BookingSchema.index({ tenantId: 1, attendantId: 1, date: 1 });
BookingSchema.index({ tenantId: 1, attendantId: 1, status: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);
