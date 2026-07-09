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
import { sendPushToPhone, sendPushToAdmins, sendPushToAttendant } from '../services/pushService';
import { sendWhatsAppBookingReceived, sendWhatsAppBookingCancelled } from '../services/whatsappService';

/**
 * POST /api/bookings
 * Creates a new booking scoped to the resolved tenant.
 * Overlap check is scoped to the attendant (if provided) AND the tenant.
 * Reference uniqueness is checked within the tenant.
 */
export const createBooking = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const { customerName, phone, email, serviceId, date, startTime, attendantId } = req.body;

    // Validate service belongs to this tenant
    const service = await Service.findOne({ _id: serviceId, tenantId });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // If attendantId provided, validate it belongs to this tenant
    let attendantName: string | undefined;
    if (attendantId) {
      const attendant = await Attendant.findOne({ _id: attendantId, tenantId });
      if (!attendant || !attendant.isActive) {
        return res.status(404).json({ error: 'Attendant not found or inactive' });
      }
      attendantName = attendant.name;
    }

    const start = DateTime.fromISO(`${date}T${startTime}`);
    const end = start.plus({ minutes: service.duration });
    const endTimeString = end.toFormat('HH:mm');

    // Overlap check — scoped to tenant + attendant
    const overlapQuery: Record<string, unknown> = { tenantId, date };
    if (attendantId) overlapQuery.attendantId = attendantId;
    const existingBookings = await Booking.find(overlapQuery);

    const hasOverlap = existingBookings.some(b => {
      const bStart = DateTime.fromISO(`${date}T${b.startTime}`);
      const bEnd = DateTime.fromISO(`${date}T${b.endTime}`);
      return start < bEnd && end > bStart;
    });

    if (hasOverlap) {
      return res.status(400).json({ error: 'This time slot is already booked' });
    }

    // Generate reference unique within this tenant
    let reference = '';
    let isUnique = false;
    while (!isUnique) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'LMN-';
      for (let i = 0; i < 5; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      const existing = await Booking.findOne({ tenantId, reference: result });
      if (!existing) { reference = result; isUnique = true; }
    }

    const newBooking = new Booking({
      tenantId,
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
    const tenantIdStr = tenantId.toString();
    void sendBookingRequestReceived(req.tenant!, newBooking, service, attendantName);
    void sendWhatsAppBookingReceived(newBooking, service, attendantName);
    void sendAdminNewBookingAlert(req.tenant!, newBooking, service, attendantName);
    void sendPushToPhone(newBooking.phone, {
      title: '📋 Booking Request Received',
      body: `${service.name}${attendantName ? ` with ${attendantName}` : ''} on ${newBooking.date} at ${newBooking.startTime} — pending approval.`,
      url: '/',
    }, tenantIdStr);
    void sendPushToAdmins({
      title: '🔔 New Booking Request',
      body: `${newBooking.customerName} — ${service.name}${attendantName ? ` (${attendantName})` : ''} on ${newBooking.date} at ${newBooking.startTime}`,
      url: '/',
    }, tenantIdStr);
    if (attendantId) {
      void sendPushToAttendant(attendantId, {
        title: '📋 New Booking Assigned',
        body: `${newBooking.customerName} booked ${service.name} with you on ${newBooking.date} at ${newBooking.startTime} (pending confirmation).`,
        url: '/attendant',
      }, tenantIdStr);
    }

    res.status(201).json(newBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

/**
 * GET /api/bookings
 * Fetches bookings for the resolved tenant. Optionally filter by date.
 */
export const getBookings = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const query: Record<string, unknown> = { tenantId: req.tenant!._id };
    if (date) query.date = date as string;
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
 * Query: reference or phone — scoped to the resolved tenant.
 */
export const lookupBookings = async (req: Request, res: Response) => {
  try {
    const { reference, phone } = req.query;

    if (!reference && !phone) {
      return res.status(400).json({ error: 'Either reference or phone query parameter is required' });
    }

    const query: Record<string, unknown> = { tenantId: req.tenant!._id };
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
 * Cancels a booking — scoped to the resolved tenant.
 */
export const cancelBookingCustomer = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, tenantId })
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
    const tenantIdStr = tenantId.toString();

    void sendBookingCancelledToCustomer(req.tenant!, booking, service, attendantName);
    void sendWhatsAppBookingCancelled(booking, service);
    void sendPushToPhone(booking.phone, {
      title: '❌ Booking Cancelled Successfully',
      body: `Your booking on ${booking.date} at ${booking.startTime} has been successfully cancelled.`,
      url: '/',
    }, tenantIdStr);
    void sendPushToAdmins({
      title: '⚠️ Booking Cancelled by Customer',
      body: `${booking.customerName} cancelled appointment on ${booking.date} at ${booking.startTime}`,
      url: '/admin',
    }, tenantIdStr);

    res.json(booking);
  } catch (error) {
    console.error('[bookingController] cancelBookingCustomer error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

/**
 * PATCH /api/bookings/:id/reschedule-customer
 * Reschedules a booking — scoped to the resolved tenant.
 */
export const rescheduleBookingCustomer = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const { id } = req.params;
    const { date, startTime } = req.body;

    if (!date || !startTime) {
      return res.status(400).json({ error: 'date and startTime are required' });
    }

    const booking = await Booking.findOne({ _id: id, tenantId })
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

    const start = DateTime.fromISO(`${date}T${startTime}`);
    const end = start.plus({ minutes: service.duration });
    const endTimeString = end.toFormat('HH:mm');

    // Overlap check scoped to tenant + attendant, excluding this booking
    const overlapQuery: Record<string, unknown> = {
      tenantId,
      date,
      _id: { $ne: booking._id },
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

    const prevDate = booking.date;
    const prevTime = booking.startTime;
    booking.date = date;
    booking.startTime = startTime;
    booking.endTime = endTimeString;
    booking.status = 'pending';
    await booking.save();

    const tenantIdStr = tenantId.toString();

    void sendBookingRequestReceived(req.tenant!, booking, service, attendantName);
    void sendPushToPhone(booking.phone, {
      title: '📅 Appointment Rescheduled (Pending Approval)',
      body: `Your appointment was rescheduled to ${booking.date} at ${booking.startTime} (previously ${prevDate} @ ${prevTime}).`,
      url: '/',
    }, tenantIdStr);
    void sendPushToAdmins({
      title: '🔄 Appointment Rescheduled by Customer',
      body: `${booking.customerName} moved slot to ${booking.date} at ${booking.startTime} (prev ${prevDate} @ ${prevTime})`,
      url: '/admin',
    }, tenantIdStr);

    res.json(booking);
  } catch (error) {
    console.error('[bookingController] rescheduleBookingCustomer error:', error);
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
};
