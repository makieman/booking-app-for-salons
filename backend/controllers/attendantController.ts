import { Request, Response } from 'express';
import Booking from '../models/Booking';
import { sendPushToAdmins } from '../services/pushService';

/**
 * GET /api/attendant/bookings
 * Returns bookings assigned to the authenticated attendant, scoped to tenant.
 */
export const getAttendantBookings = async (req: Request, res: Response) => {
  try {
    const attendantId = req.attendant!.id;
    const { date, status } = req.query;

    const query: Record<string, unknown> = {
      tenantId: req.tenant!._id,
      attendantId,
    };

    if (date) query.date = date as string;
    if (status) query.status = status as string;

    const bookings = await Booking.find(query)
      .populate('serviceId')
      .sort({ date: 1, startTime: 1 });

    res.json(bookings);
  } catch (error) {
    console.error('[attendantController] getAttendantBookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

/**
 * PATCH /api/attendant/bookings/:id/complete
 * Marks a booking as completed. Checks both ownership and tenant membership.
 */
export const markBookingCompleted = async (req: Request, res: Response) => {
  try {
    const attendantId = req.attendant!.id;
    const tenantId = req.tenant!._id;
    const { id } = req.params;

    const booking = await Booking.findById(id).populate('serviceId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // ── Tenant check: booking must belong to this tenant ────────────────────
    if (booking.tenantId.toString() !== tenantId.toString()) {
      return res.status(403).json({ error: 'Not authorised to update this booking' });
    }

    // ── Ownership check: attendant can only complete their own bookings ──────
    if (booking.attendantId?.toString() !== attendantId) {
      return res.status(403).json({ error: 'Not authorised to update this booking' });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({ error: 'Only confirmed bookings can be marked as completed' });
    }

    booking.status = 'completed';
    await booking.save();

    void sendPushToAdmins(
      {
        title: '✔️ Booking Completed',
        body: `${req.attendant!.name} completed the appointment for ${booking.customerName}.`,
        url: '/admin',
      },
      tenantId.toString()
    );

    res.json(booking);
  } catch (error) {
    console.error('[attendantController] markBookingCompleted:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
};
