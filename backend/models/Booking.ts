import mongoose, { Schema, Document } from 'mongoose';
import type { IAttendant } from './Attendant';

/**
 * Booking interface — represents a customer's booked appointment.
 *
 * Fields:
 * - customerName: The client's full name
 * - phone: Contact number
 * - serviceId: Reference to the Service they booked
 * - date: The appointment date (YYYY-MM-DD format)
 * - startTime: When the appointment starts (HH:mm)
 * - endTime: When it ends (HH:mm), calculated from service duration
 * - status: The booking lifecycle state (pending → confirmed | cancelled)
 */
export interface IBooking extends Document {
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
    reference: { type: String, required: true, unique: true, index: true },
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

// Index to help with queries by date and status
BookingSchema.index({ date: 1 });
BookingSchema.index({ status: 1 });
// Composite indexes for attendant dashboard queries
BookingSchema.index({ attendantId: 1, date: 1 });
BookingSchema.index({ attendantId: 1, status: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);
