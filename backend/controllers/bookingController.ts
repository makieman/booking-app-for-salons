import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import Attendant from '../models/Attendant';
import { DateTime } from 'luxon';
import {
  sendBookingRequestReceived,
  sendAdminNewBookingAlert,
  sendBookingConfirmedToCustomer,
  sendBookingCancelledToCustomer,
} from '../services/emailService';
import { sendPushToPhone, sendPushToAdmins } from '../services/pushService';

/**
 * POST /api/bookings
 * Creates a new booking. Validates the service exists, calculates the end time
 * from the service duration, and checks for time slot overlaps.
 *
 * Overlap check is now scoped to the chosen attendant (if provided).
 * If attendantId is null/"any", overlap is checked globally across all bookings
 * on that date for safety (prevents double-booking the slot regardless of attendant).
 *
 * After saving, fires email notifications to the customer and admin (non-blocking).
 */
export const createBooking = async (req: Request, res: Response) => {
  try {
    const { customerName, phone, email, serviceId, date, startTime, attendantId } = req.body;

    // Validate service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // If attendantId provided, validate it exists and is active
    let attendantName: string | undefined;
    if (attendantId) {
      const attendant = await Attendant.findById(attendantId);
      if (!attendant || !attendant.isActive) {
        return res.status(404).json({ error: 'Attendant not found or inactive' });
      }
      attendantName = attendant.name;
    }

    // Calculate end time from service duration
    const start = DateTime.fromISO(`${date}T${startTime}`);
    const end = start.plus({ minutes: service.duration });
    const endTimeString = end.toFormat('HH:mm');

    // Overlap check — scoped to attendant when one is provided
    const overlapQuery: Record<string, unknown> = { date };
    if (attendantId) {
      overlapQuery.attendantId = attendantId;
    }
    const existingBookings = await Booking.find(overlapQuery);

    const hasOverlap = existingBookings.some(b => {
      const bStart = DateTime.fromISO(`${date}T${b.startTime}`);
      const bEnd = DateTime.fromISO(`${date}T${b.endTime}`);
      // Overlap logic: (start1 < end2) && (end1 > start2)
      return start < bEnd && end > bStart;
    });

    if (hasOverlap) {
      return res.status(400).json({ error: 'This time slot is already booked' });
    }

    // Generate a unique reference
    let reference = '';
    let isUnique = false;
    while (!isUnique) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'LMN-';
      for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await Booking.findOne({ reference: result });
      if (!existing) {
        reference = result;
        isUnique = true;
      }
    }

    // Create and save the booking
    const newBooking = new Booking({
      reference,
      customerName,
      phone,
      email,
      serviceId,
      attendantId: attendantId ?? null,
      date,
      startTime,
      endTime: endTimeString,
    });

    await newBooking.save();

    // ── Fire-and-forget notifications (non-blocking) ──────────────────────
    // We intentionally do NOT await these — a failed notification must never fail the booking.
    void sendBookingRequestReceived(newBooking, service, attendantName);
    void sendAdminNewBookingAlert(newBooking, service, attendantName);
    // Customer push: confirms their request was received
    void sendPushToPhone(newBooking.phone, {
      title: '📋 Booking Request Received',
      body: `${service.name}${attendantName ? ` with ${attendantName}` : ''} on ${newBooking.date} at ${newBooking.startTime} — pending approval.`,
      url: '/',
    });
    // Admin push: alert all admin devices about the new booking
    void sendPushToAdmins({
      title: '🔔 New Booking Request',
      body: `${newBooking.customerName} — ${service.name}${attendantName ? ` (${attendantName})` : ''} on ${newBooking.date} at ${newBooking.startTime}`,
      url: '/',
    });

    res.status(201).json(newBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

/**
 * GET /api/bookings
 * Fetches bookings. Optionally filter by date using ?date=YYYY-MM-DD query param.
 * Populates the serviceId and attendantId fields with full details.
 */
export const getBookings = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const query = date ? { date: date as string } : {};
    const bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('attendantId', 'name');
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

/**
 * GET /api/bookings/lookup
 * Query: reference or phone
 */
export const lookupBookings = async (req: Request, res: Response) => {
  try {
    const { reference, phone } = req.query;

    if (!reference && !phone) {
      return res.status(400).json({ error: 'Either reference or phone query parameter is required' });
    }

    const query: Record<string, unknown> = {};
    if (reference) {
      query.reference = (reference as string).trim().toUpperCase();
    } else if (phone) {
      query.phone = (phone as string).trim();
    }

    const bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    console.error('[bookingController] lookupBookings error:', error);
    res.status(500).json({ error: 'Failed to look up bookings' });
  }
};

/**
 * PATCH /api/bookings/:id/cancel-customer
 * Changes a booking's status to 'cancelled'. Fits customer flow.
 * Fires customer and owner notifications.
 */
export const cancelBookingCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    booking.status = 'cancelled';
    await booking.save();

    const service = booking.serviceId as any;
    const attendantName = (booking.attendantId as any)?.name;

    // Fire notifications (non-blocking)
    void sendBookingCancelledToCustomer(booking, service, attendantName);
    void sendPushToPhone(booking.phone, {
      title: '❌ Booking Cancelled Successfully',
      body: `Your booking on ${booking.date} at ${booking.startTime} has been successfully cancelled.`,
      url: '/',
    });
    
    // Notify Owner/Admins
    void sendPushToAdmins({
      title: '⚠️ Booking Cancelled by Customer',
      body: `${booking.customerName} cancelled appointment on ${booking.date} at ${booking.startTime}`,
      url: '/admin',
    });

    res.json(booking);
  } catch (error) {
    console.error('[bookingController] cancelBookingCustomer error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

/**
 * PATCH /api/bookings/:id/reschedule-customer
 * Reschedules an active booking to a new date and time slot.
 * Body: { date, startTime }
 */
export const rescheduleBookingCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, startTime } = req.body;

    if (!date || !startTime) {
      return res.status(400).json({ error: 'date and startTime are required' });
    }

    const booking = await Booking.findById(id)
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reschedule a cancelled booking' });
    }

    const service = booking.serviceId as any;
    const attendantName = (booking.attendantId as any)?.name;

    // Calculate new end time based on original service duration
    const start = DateTime.fromISO(`${date}T${startTime}`);
    const end = start.plus({ minutes: service.duration });
    const endTimeString = end.toFormat('HH:mm');

    // Overlap validation (scoped to attendant if attendant is assigned)
    const overlapQuery: Record<string, unknown> = {
      date,
      _id: { $ne: booking._id }, // exclude self
    };
    if (booking.attendantId) {
      overlapQuery.attendantId = (booking.attendantId as any)._id || booking.attendantId;
    }
    
    const existingBookings = await Booking.find(overlapQuery);
    const hasOverlap = existingBookings.some(b => {
      const bStart = DateTime.fromISO(`${date}T${b.startTime}`);
      const bEnd = DateTime.fromISO(`${date}T${b.endTime}`);
      return start < bEnd && end > bStart;
    });

    if (hasOverlap) {
      return res.status(400).json({ error: 'This rescheduled slot is already booked' });
    }

    // Save previous details for notification context
    const prevDate = booking.date;
    const prevTime = booking.startTime;

    booking.date = date;
    booking.startTime = startTime;
    booking.endTime = endTimeString;
    booking.status = 'pending';
    await booking.save();

    // Fire notifications (non-blocking)
    void sendBookingRequestReceived(booking, service, attendantName);
    void sendPushToPhone(booking.phone, {
      title: '📅 Appointment Rescheduled (Pending Approval)',
      body: `Your appointment was rescheduled to ${booking.date} at ${booking.startTime} (previously ${prevDate} @ ${prevTime}).`,
      url: '/',
    });
    
    // Notify Owner/Admins
    void sendPushToAdmins({
      title: '🔄 Appointment Rescheduled by Customer',
      body: `${booking.customerName} moved slot to ${booking.date} at ${booking.startTime} (prev ${prevDate} @ ${prevTime})`,
      url: '/admin',
    });

    res.json(booking);
  } catch (error) {
    console.error('[bookingController] rescheduleBookingCustomer error:', error);
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
};
