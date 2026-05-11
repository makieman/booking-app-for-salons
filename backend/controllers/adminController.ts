import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import {
  sendBookingConfirmedToCustomer,
  sendBookingCancelledToCustomer,
} from '../services/emailService';

/**
 * GET /api/admin/bookings
 * Returns all bookings with populated service details.
 * Optional ?status=pending|confirmed|cancelled filter.
 * Sorted by creation date (newest first).
 */
export const getAdminBookings = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const query = (status ? { status: status as string } : {}) as Record<string, unknown>;
    const bookings = await Booking.find(query)
      .populate('serviceId')
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
    ).populate('serviceId');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // ── Fire-and-forget email to customer (non-blocking) ───────────────────
    // serviceId is populated at this point, so we can safely cast it.
    const service = booking.serviceId as unknown as InstanceType<typeof Service>;

    if (status === 'confirmed') {
      void sendBookingConfirmedToCustomer(booking, service as any);
    } else if (status === 'cancelled') {
      void sendBookingCancelledToCustomer(booking, service as any);
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};
