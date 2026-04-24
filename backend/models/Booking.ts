import mongoose, { Schema, Document } from 'mongoose';

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
 */
export interface IBooking extends Document {
  customerName: string;
  phone: string;
  serviceId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

const BookingSchema: Schema = new Schema({
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
});

// Index to help with queries by date
BookingSchema.index({ date: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);
