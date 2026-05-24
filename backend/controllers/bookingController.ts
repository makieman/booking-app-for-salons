import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import Attendant from '../models/Attendant';
import { DateTime } from 'luxon';
import {
  sendBookingRequestReceived,
  sendAdminNewBookingAlert,
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

    // Create and save the booking
    const newBooking = new Booking({
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
