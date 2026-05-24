import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import {
  sendBookingConfirmedToCustomer,
  sendBookingCancelledToCustomer,
} from '../services/emailService';
import { sendPushToPhone } from '../services/pushService';
import type { IAttendant } from '../models/Attendant';

/**
 * GET /api/admin/bookings
 * Returns all bookings with populated service and attendant details.
 * Optional filters:
 * - ?status=pending|confirmed|cancelled|completed
 * - ?attendantId=xxx  — filter to a specific attendant
 * - ?date=YYYY-MM-DD  — filter to a specific date
 * Sorted by creation date (newest first).
 */
export const getAdminBookings = async (req: Request, res: Response) => {
  try {
    const { status, attendantId, date } = req.query;
    const query: Record<string, unknown> = {};

    if (status) query.status = status as string;
    if (attendantId) query.attendantId = attendantId as string;
    if (date) query.date = date as string;

    const bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch admin bookings' });
  }
};

/**
 * PATCH /api/admin/bookings/:id
 * Transitions a booking status to 'confirmed' or 'cancelled'.
 * Body: { status: 'confirmed' | 'cancelled' }
 * After updating, fires an email notification to the customer (non-blocking).
 */
export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be confirmed or cancelled' });
    }

    const booking = await Booking.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // ── Fire-and-forget email to customer (non-blocking) ───────────────────
    const service = booking.serviceId as unknown as InstanceType<typeof Service>;
    const attendantName =
      booking.attendantId && typeof booking.attendantId === 'object'
        ? (booking.attendantId as unknown as IAttendant).name
        : undefined;

    if (status === 'confirmed') {
      void sendBookingConfirmedToCustomer(booking, service as any, attendantName);
      void sendPushToPhone(booking.phone, {
        title: '✅ Appointment Confirmed!',
        body: `See you on ${booking.date} at ${booking.startTime}${attendantName ? ` with ${attendantName}` : ''}. Please arrive 5–10 mins early.`,
        url: '/',
      });
    } else if (status === 'cancelled') {
      void sendBookingCancelledToCustomer(booking, service as any, attendantName);
      void sendPushToPhone(booking.phone, {
        title: '❌ Booking Cancelled',
        body: `Your booking on ${booking.date} has been cancelled. Call 0721 530 120 to rebook.`,
        url: '/',
      });
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};
