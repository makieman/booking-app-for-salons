import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import {
  sendBookingConfirmedToCustomer,
  sendBookingCancelledToCustomer,
} from '../services/emailService';
import { sendPushToPhone, sendPushToAttendant, sendPushToAdmins } from '../services/pushService';
import { sendWhatsAppBookingConfirmed, sendWhatsAppBookingCancelled } from '../services/whatsappService';
import type { IAttendant } from '../models/Attendant';

/**
 * GET /api/admin/bookings
 * Returns all bookings for the resolved tenant.
 * Optional filters: ?status=... ?attendantId=... ?date=...
 */
export const getAdminBookings = async (req: Request, res: Response) => {
  try {
    const { status, attendantId, date } = req.query;
    const query: Record<string, unknown> = { tenantId: req.tenant!._id };

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
 * Confirms or cancels a booking — scoped to the resolved tenant.
 */
export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be confirmed or cancelled' });
    }

    // Scope to tenant — prevents cross-tenant status updates
    const booking = await Booking.findOneAndUpdate(
      { _id: id, tenantId: req.tenant!._id },
      { status },
      { new: true, runValidators: true }
    )
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const service = booking.serviceId as unknown as InstanceType<typeof Service>;
    const attendantName =
      booking.attendantId && typeof booking.attendantId === 'object'
        ? (booking.attendantId as unknown as IAttendant).name
        : undefined;

    const tenantIdStr = req.tenant!._id.toString();

    if (status === 'confirmed') {
      void sendBookingConfirmedToCustomer(req.tenant!, booking, service as any, attendantName);
      void sendWhatsAppBookingConfirmed(booking, service as any, attendantName);
      void sendPushToPhone(booking.phone, {
        title: '✅ Appointment Confirmed!',
        body: `See you on ${booking.date} at ${booking.startTime}${attendantName ? ` with ${attendantName}` : ''}. Please arrive 5–10 mins early.`,
        url: '/',
      }, tenantIdStr);
      if (booking.attendantId) {
        void sendPushToAttendant(
          (booking.attendantId as any)._id?.toString() || booking.attendantId.toString(),
          {
            title: '✅ Booking Confirmed',
            body: `You have a confirmed appointment with ${booking.customerName} on ${booking.date} at ${booking.startTime}.`,
            url: '/attendant',
          },
          tenantIdStr
        );
      }
    } else if (status === 'cancelled') {
      void sendBookingCancelledToCustomer(req.tenant!, booking, service as any, attendantName);
      void sendWhatsAppBookingCancelled(booking, service as any);
      void sendPushToPhone(booking.phone, {
        title: '❌ Booking Cancelled',
        body: `Your booking on ${booking.date} has been cancelled. Call 0721 530 120 to rebook.`,
        url: '/',
      }, tenantIdStr);
      void sendPushToAdmins({
        title: '❌ Booking Cancelled by Admin',
        body: `Booking for ${booking.customerName} on ${booking.date} has been cancelled.`,
        url: '/admin',
      }, tenantIdStr);
      if (booking.attendantId) {
        void sendPushToAttendant(
          (booking.attendantId as any)._id?.toString() || booking.attendantId.toString(),
          {
            title: '❌ Booking Cancelled',
            body: `The appointment for ${booking.customerName} on ${booking.date} has been cancelled.`,
            url: '/attendant',
          },
          tenantIdStr
        );
      }
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};
