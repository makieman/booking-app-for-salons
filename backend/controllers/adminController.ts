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

    let groupBookings = [booking];
    if (booking.groupId) {
      await Booking.updateMany(
        { tenantId: req.tenant!._id, groupId: booking.groupId },
        { status }
      );
      groupBookings = await Booking.find({ tenantId: req.tenant!._id, groupId: booking.groupId })
        .populate('serviceId')
        .populate('attendantId', 'name')
        .sort({ groupOrder: 1 });
    }

    const tenantIdStr = req.tenant!._id.toString();

    const combinedName = groupBookings
      .map(b => `${(b.serviceId as any)?.name ?? 'Service'} with ${(b.attendantId as any)?.name ?? 'Staff'}`)
      .join(' & ');

    const syntheticService = {
      _id: (booking.serviceId as any)._id,
      name: combinedName,
      price: groupBookings.reduce((sum, b) => sum + (b.price || (b.serviceId as any)?.price || 0), 0),
    } as any;

    if (status === 'confirmed') {
      void sendBookingConfirmedToCustomer(req.tenant!, booking, syntheticService, undefined);
      void sendWhatsAppBookingConfirmed(booking, syntheticService, undefined);
      void sendPushToPhone(booking.phone, {
        title: '✅ Appointment Confirmed!',
        body: `See you on ${booking.date} at ${booking.startTime} for ${combinedName}. Please arrive 5–10 mins early.`,
        url: '/',
      }, tenantIdStr);

      for (const b of groupBookings) {
        const attId = (b.attendantId as any)?._id?.toString() || b.attendantId?.toString();
        if (attId) {
          void sendPushToAttendant(
            attId,
            {
              title: '✅ Booking Confirmed',
              body: `You have a confirmed appointment with ${b.customerName} on ${b.date} at ${b.startTime} for ${(b.serviceId as any)?.name}.`,
              url: '/attendant',
            },
            tenantIdStr
          );
        }
      }
    } else if (status === 'cancelled') {
      void sendBookingCancelledToCustomer(req.tenant!, booking, syntheticService, undefined);
      void sendWhatsAppBookingCancelled(booking, syntheticService);
      void sendPushToPhone(booking.phone, {
        title: '❌ Booking Cancelled',
        body: `Your booking for ${combinedName} on ${booking.date} has been cancelled.`,
        url: '/',
      }, tenantIdStr);
      void sendPushToAdmins({
        title: '❌ Booking Cancelled by Admin',
        body: `Booking for ${booking.customerName} (${combinedName}) on ${booking.date} has been cancelled.`,
        url: '/admin',
      }, tenantIdStr);

      for (const b of groupBookings) {
        const attId = (b.attendantId as any)?._id?.toString() || b.attendantId?.toString();
        if (attId) {
          void sendPushToAttendant(
            attId,
            {
              title: '❌ Booking Cancelled',
              body: `The appointment for ${b.customerName} on ${b.date} at ${b.startTime} has been cancelled.`,
              url: '/attendant',
            },
            tenantIdStr
          );
        }
      }
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};
