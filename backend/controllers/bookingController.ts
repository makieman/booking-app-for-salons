import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import { DateTime } from 'luxon';
import {
  sendBookingRequestReceived,
  sendAdminNewBookingAlert,
} from '../services/emailService';

/**
 * POST /api/bookings
 * Creates a new booking. Validates the service exists, calculates the end time
 * from the service duration, and checks for time slot overlaps.
 * After saving, fires email notifications to the customer and admin (non-blocking).
 */
export const createBooking = async (req: Request, res: Response) => {
  try {
    const { customerName, phone, email, serviceId, date, startTime } = req.body;

    // Validate service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Calculate end time from service duration
    const start = DateTime.fromISO(`${date}T${startTime}`);
    const end = start.plus({ minutes: service.duration });
    const endTimeString = end.toFormat('HH:mm');

    // Check for overlapping bookings on the same date
    const existingBookings = await Booking.find({ date });
    const hasOverlap = existingBookings.some(b => {
      const bStart = DateTime.fromISO(`${date}T${b.startTime}`);
      const bEnd = DateTime.fromISO(`${date}T${b.endTime}`);
      
      // Overlap logic: (start1 < end2) && (end1 > start2)
      return (start < bEnd) && (end > bStart);
    });

    if (hasOverlap) {
      return res.status(400).json({ error: 'This time slot is already booked' });
    }

    // Create and save the booking
    const newBooking = new Booking({
      customerName,
      phone,
      email,  // optional — used for email notifications
      serviceId,
      date,
      startTime,
      endTime: endTimeString,
    });

    await newBooking.save();

    // ── Fire-and-forget email notifications (non-blocking) ─────────────────
    // We intentionally do NOT await these — a failed email must never fail the booking.
    void sendBookingRequestReceived(newBooking, service);
    void sendAdminNewBookingAlert(newBooking, service);

    res.status(201).json(newBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

/**
 * GET /api/bookings
 * Fetches bookings. Optionally filter by date using ?date=YYYY-MM-DD query param.
 * Populates the serviceId field with full service details.
 */
export const getBookings = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const query = date ? { date: date as string } : {};
    const bookings = await Booking.find(query).populate('serviceId');
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};
