import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Service from '../models/Service';
import Attendant from '../models/Attendant';
import { DateTime, Interval } from 'luxon';
import {
  sendBookingRequestReceived,
  sendAdminNewBookingAlert,
  sendBookingConfirmedToCustomer,
  sendBookingCancelledToCustomer,
} from '../services/emailService';
import { sendPushToPhone, sendPushToAdmins, sendPushToAttendant } from '../services/pushService';
import { sendWhatsAppBookingReceived, sendWhatsAppBookingCancelled, sendWhatsAppRescheduled } from '../services/whatsappService';
import { sendBookingReceivedSms, sendBookingCancelledSms, sendBookingRescheduledSms } from '../services/smsService';

import mongoose from 'mongoose';
import { MAX_SERVICES, isAttendantFree } from '../services/slotService';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';

/**
 * Masks phone numbers to protect customer privacy under Kenya's Data Protection Act.
 * e.g. "0712345678" -> "07•• ••• 678", "+254712345678" -> "+254 7•• ••• 678"
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '••• ••• •••';
  const trimmed = phone.trim();
  if (trimmed.startsWith('+254') && trimmed.length === 13) {
    return `+254 ${trimmed.slice(4, 5)}•• ••• ${trimmed.slice(-3)}`;
  }
  if (trimmed.startsWith('0') && trimmed.length === 10) {
    return `${trimmed.slice(0, 2)}•• ••• ${trimmed.slice(-3)}`;
  }
  if (trimmed.length >= 7) {
    return `${trimmed.slice(0, 2)}•• ••• ${trimmed.slice(-3)}`;
  }
  return '••• ••• •••';
}

/**
 * Generates a unique human-friendly booking reference (e.g. LMN-XXXXX) for a tenant.
 */
export async function generateUniqueBookingReference(tenantId: mongoose.Types.ObjectId | string): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let reference = '';
  let attempts = 0;
  while (!isUnique && attempts < 25) {
    attempts++;
    let result = 'LMN-';
    for (let i = 0; i < 5; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    const existing = await Booking.findOne({ tenantId, reference: result });
    if (!existing) {
      reference = result;
      isUnique = true;
    }
  }
  if (!reference) {
    reference = `LMN-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }
  return reference;
}

/**
 * POST /api/bookings
 * Creates a new booking (single or multi-service) scoped to the resolved tenant.
 * - Supports `items`: [{ serviceId, attendantId }] or legacy { serviceId, attendantId }
 * - Resolves concrete attendants (never stores null attendant for multi-service)
 * - Atomic insert with transaction / rollback
 * - Price snapshots per segment
 * - Single combined customer notification
 */
export const createBooking = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const { customerName, phone, email, date, startTime, hp, website, honeypot } = req.body;

    // 1. Bot honeypot: reject automated submissions with 400
    if (hp || website || honeypot) {
      return res.status(400).json({ error: 'Invalid booking submission' });
    }

    if (!customerName || !phone || !date || !startTime) {
      return res.status(400).json({ error: 'customerName, phone, date, and startTime are required' });
    }

    const bookingRules = req.tenant?.bookingRules;
    const tz = req.tenant?.timezone || 'Africa/Nairobi';

    // 2. Abuse cap: max 3 active (pending/confirmed) future appointments per phone in tenant
    const normalizedPhone = normalizeKenyanPhone(phone) || phone.trim();
    const todayStr = DateTime.now().setZone(tz).toISODate()!;
    const activeFutureCount = await Booking.countDocuments({
      tenantId,
      status: { $in: ['pending', 'confirmed'] },
      date: { $gte: todayStr },
      $or: [
        { phone: normalizedPhone },
        { phone: phone.trim() },
      ],
    });

    if (activeFutureCount >= 3) {
      return res.status(400).json({
        error: 'You have reached the maximum of 3 active appointments. Please complete or cancel existing appointments before booking more.',
      });
    }

    // Check salon holidays
    if (bookingRules?.holidays && bookingRules.holidays.includes(date)) {
      return res.status(400).json({ error: 'Salon is closed on this holiday' });
    }

    // Check salon closed weekdays
    const dt = DateTime.fromISO(date, { zone: tz });
    const dayOfWeek = dt.weekday === 7 ? 0 : dt.weekday;
    if (bookingRules?.closedWeekdays && bookingRules.closedWeekdays.includes(dayOfWeek)) {
      return res.status(400).json({ error: 'Salon is closed on this day' });
    }

    // Determine segments: either multi-item `items` or single `serviceId` / `attendantId`
    let rawItems: Array<{ serviceId: string; attendantId?: string | null }> = [];
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      rawItems = req.body.items;
    } else if (req.body.serviceId) {
      rawItems = [{ serviceId: req.body.serviceId, attendantId: req.body.attendantId || null }];
    } else {
      return res.status(400).json({ error: 'serviceId or items array is required' });
    }

    if (rawItems.length > MAX_SERVICES) {
      return res.status(400).json({ error: `Cannot book more than ${MAX_SERVICES} services in a single appointment` });
    }

    // Generate unique reference for this booking group within the tenant
    const reference = await generateUniqueBookingReference(tenantId);

    const groupId = rawItems.length > 1
      ? `grp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      : undefined;

    // Fetch existing active bookings for this date to check overlaps
    const existingBookings = await Booking.find({
      tenantId,
      date,
      status: { $ne: 'cancelled' },
    });

    let currentCursor = DateTime.fromISO(`${date}T${startTime}`, { zone: tz });
    const resolvedSegments: Array<{
      service: any;
      attendant: any;
      startTime: string;
      endTime: string;
      groupOrder: number;
    }> = [];

    // Temporary list of intervals reserved within this booking session
    const newlyBookedIntervals: Array<{ attendantId: string; start: DateTime; end: DateTime; buffer: number }> = [];
    const salonBreaks = bookingRules?.breaks || [];
    const tenantBuffer = bookingRules?.bufferMinutes || 0;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const service = await Service.findOne({ _id: item.serviceId, tenantId });
      if (!service) {
        return res.status(404).json({ error: `Service not found: ${item.serviceId}` });
      }

      const segStart = currentCursor;
      const segEnd = currentCursor.plus({ minutes: service.duration });
      const segStartTimeStr = segStart.toFormat('HH:mm');
      const segEndTimeStr = segEnd.toFormat('HH:mm');
      const segInterval = Interval.fromDateTimes(segStart, segEnd);

      // Check salon-wide breaks
      const overlapsSalonBreak = salonBreaks.some(brk => {
        const brkStart = DateTime.fromISO(`${date}T${brk.start}`, { zone: tz });
        const brkEnd = DateTime.fromISO(`${date}T${brk.end}`, { zone: tz });
        return segInterval.overlaps(Interval.fromDateTimes(brkStart, brkEnd));
      });
      if (overlapsSalonBreak) {
        return res.status(400).json({ error: `Time slot ${segStartTimeStr}–${segEndTimeStr} overlaps with a salon break` });
      }

      const candBuffer = (service.bufferAfterMinutes !== undefined && service.bufferAfterMinutes > 0)
        ? service.bufferAfterMinutes
        : tenantBuffer;

      const attendantOptions = {
        canExceedClosingTime: service.canExceedClosingTime,
        serviceBufferMinutes: candBuffer,
      };

      // Helper to check if an attendant is free during [segStart, segEnd]
      const isFree = (attendantDoc: any) => {
        const attId = attendantDoc._id.toString();

        // 1. Attendant schedule, breaks, time off, days off, and existing bookings (with buffers)
        const freeInSlotService = isAttendantFree(
          attendantDoc,
          segInterval,
          date,
          existingBookings,
          tenantBuffer,
          tz,
          req.tenant?.workingHours,
          attendantOptions
        );
        if (!freeInSlotService) return false;

        // 2. Newly booked intervals within this booking group (with buffer)
        const overlapsNew = newlyBookedIntervals.some(n => {
          if (n.attendantId !== attId) return false;
          return segStart < n.end.plus({ minutes: n.buffer }) && segEnd.plus({ minutes: candBuffer }) > n.start;
        });
        return !overlapsNew;
      };

      let resolvedAttendant: any = null;

      if (item.attendantId) {
        const attendant = await Attendant.findOne({ _id: item.attendantId, tenantId, isActive: true });
        if (!attendant) {
          return res.status(404).json({ error: `Attendant not found or inactive: ${item.attendantId}` });
        }
        if (!isFree(attendant)) {
          return res.status(400).json({ error: `Time slot ${segStartTimeStr}–${segEndTimeStr} is unavailable for ${attendant.name}` });
        }
        resolvedAttendant = attendant;
      } else {
        // "Any Available" — resolve to a real concrete attendant
        let qualifiedAttendants = await Attendant.find({
          tenantId,
          isActive: true,
          serviceIds: service._id,
        });

        // Fallback to all active stylists if none specifically assigned
        if (qualifiedAttendants.length === 0) {
          qualifiedAttendants = await Attendant.find({
            tenantId,
            isActive: true,
          });
        }

        // Prefer keeping previous segment's attendant if qualified and free
        const prevAttId = resolvedSegments[i - 1]?.attendant?._id?.toString();
        const matchingPrev = prevAttId
          ? qualifiedAttendants.find(a => a._id.toString() === prevAttId)
          : null;

        if (matchingPrev && isFree(matchingPrev)) {
          resolvedAttendant = matchingPrev;
        } else {
          resolvedAttendant = qualifiedAttendants.find(a => isFree(a));
        }

        if (!resolvedAttendant) {
          return res.status(400).json({
            error: `No attendant is available for ${service.name} at ${segStartTimeStr}–${segEndTimeStr}`
          });
        }
      }

      newlyBookedIntervals.push({
        attendantId: resolvedAttendant._id.toString(),
        start: segStart,
        end: segEnd,
        buffer: candBuffer,
      });

      resolvedSegments.push({
        service,
        attendant: resolvedAttendant,
        startTime: segStartTimeStr,
        endTime: segEndTimeStr,
        groupOrder: i + 1,
      });

      currentCursor = segEnd;
    }

    // Atomic insert with transaction / rollback fallback
    let session: mongoose.ClientSession | null = null;
    let inTransaction = false;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      inTransaction = true;
    } catch {
      session = null;
    }

    const createdDocs: any[] = [];
    try {
      for (const seg of resolvedSegments) {
        const doc = new Booking({
          tenantId,
          reference,
          groupId,
          groupOrder: seg.groupOrder,
          price: seg.service.price,
          customerName,
          phone,
          email,
          serviceId: seg.service._id,
          attendantId: seg.attendant._id,
          date,
          startTime: seg.startTime,
          endTime: seg.endTime,
          bufferMinutes: seg.service.bufferAfterMinutes ?? 0,
          status: 'pending',
        });

        if (inTransaction && session) {
          await doc.save({ session });
        } else {
          await doc.save();
        }
        createdDocs.push(doc);
      }

      if (inTransaction && session) {
        await session.commitTransaction();
      }
    } catch (saveErr) {
      if (inTransaction && session) {
        await session.abortTransaction();
      } else {
        for (const doc of createdDocs) {
          await Booking.deleteOne({ _id: doc._id });
        }
      }
      throw saveErr;
    } finally {
      if (session) {
        session.endSession();
      }
    }

    // ── Notifications ──────────────────────────────────────────────────────────
    const tenantIdStr = tenantId.toString();
    const totalAmount = resolvedSegments.reduce((sum, s) => sum + s.service.price, 0);
    const combinedServiceName = resolvedSegments
      .map(s => `${s.service.name} with ${s.attendant.name}`)
      .join(' & ');

    const syntheticService = {
      _id: resolvedSegments[0].service._id,
      name: combinedServiceName,
      price: totalAmount,
      duration: resolvedSegments.reduce((sum, s) => sum + s.service.duration, 0),
    } as any;

    const primaryBooking = createdDocs[0];

    // Single unified customer notification
    void sendBookingRequestReceived(req.tenant!, primaryBooking, syntheticService, undefined);
    void sendWhatsAppBookingReceived(primaryBooking, syntheticService, undefined);
    void sendBookingReceivedSms(req.tenant!, primaryBooking, syntheticService);
    void sendAdminNewBookingAlert(req.tenant!, primaryBooking, syntheticService, undefined);

    void sendPushToPhone(primaryBooking.phone, {
      title: '📋 Booking Request Received',
      body: `${combinedServiceName} on ${primaryBooking.date} from ${primaryBooking.startTime} to ${createdDocs[createdDocs.length - 1].endTime} — pending approval.`,
      url: '/',
    }, tenantIdStr);

    void sendPushToAdmins({
      title: '🔔 New Booking Request',
      body: `${primaryBooking.customerName} — ${combinedServiceName} on ${primaryBooking.date} at ${primaryBooking.startTime}`,
      url: '/',
    }, tenantIdStr);

    // Individual push alerts to each attendant for their assigned time
    for (const seg of resolvedSegments) {
      void sendPushToAttendant(seg.attendant._id.toString(), {
        title: '📋 New Booking Assigned',
        body: `${customerName} booked ${seg.service.name} with you on ${date} at ${seg.startTime} (pending confirmation).`,
        url: '/attendant',
      }, tenantIdStr);
    }

    res.status(201).json(createdDocs.length === 1 ? createdDocs[0] : {
      ...primaryBooking.toObject(),
      group: createdDocs,
    });
  } catch (error) {
    console.error('[bookingController] createBooking error:', error);
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
    if (req.attendant) {
      query.attendantId = req.attendant.id;
    }
    if (date) query.date = date as string;
    const bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ date: 1, startTime: 1, groupOrder: 1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

/**
 * GET /api/bookings/lookup
 * Query: reference AND phone — both required to prove appointment ownership.
 * Removes phone-only scanning. Returns trimmed data (no email, masked phone).
 */
export const lookupBookings = async (req: Request, res: Response) => {
  try {
    const { reference, phone } = req.query;

    if (!reference || !phone || !(reference as string).trim() || !(phone as string).trim()) {
      return res.status(400).json({ error: 'Both booking reference and phone number are required' });
    }

    const refQuery = (reference as string).trim().toUpperCase();
    const rawPhoneQuery = (phone as string).trim();
    const normPhoneQuery = normalizeKenyanPhone(rawPhoneQuery) || rawPhoneQuery;

    const bookings = await Booking.find({ tenantId: req.tenant!._id, reference: refQuery })
      .populate('serviceId', 'name duration price priceMax')
      .populate('attendantId', 'name')
      .sort({ groupOrder: 1 });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ error: 'No booking found matching the provided reference and phone number' });
    }

    const firstBooking = bookings[0];
    const normBookingPhone = normalizeKenyanPhone(firstBooking.phone) || firstBooking.phone.trim();

    // Verify phone ownership: return identical generic 404 on mismatch
    if (normPhoneQuery !== normBookingPhone && rawPhoneQuery !== firstBooking.phone.trim()) {
      return res.status(404).json({ error: 'No booking found matching the provided reference and phone number' });
    }

    let allBookings = bookings;
    if (firstBooking.groupId) {
      allBookings = await Booking.find({
        tenantId: req.tenant!._id,
        groupId: firstBooking.groupId,
      })
        .populate('serviceId', 'name duration price priceMax')
        .populate('attendantId', 'name')
        .sort({ groupOrder: 1 });
    }

    // Trim data to protect customer privacy (no email, masked phone)
    const sanitized = allBookings.map(b => ({
      _id: b._id,
      reference: b.reference,
      groupId: b.groupId,
      groupOrder: b.groupOrder,
      customerName: b.customerName,
      phone: maskPhone(b.phone),
      serviceId: b.serviceId,
      attendantId: b.attendantId,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      price: b.price,
      notes: b.notes,
    }));

    res.json(sanitized);
  } catch (error) {
    console.error('[bookingController] lookupBookings error:', error);
    res.status(500).json({ error: 'Failed to look up bookings' });
  }
};

/**
 * PATCH /api/bookings/:id/cancel-customer
 * Cancels a booking — requires matching customer phone in request body.
 * If the booking belongs to a multi-service group, cancels ALL segments in the group.
 */
export const cancelBookingCustomer = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const { id } = req.params;
    const { phone } = req.body;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required for verification' });
    }

    const booking = await Booking.findOne({ _id: id, tenantId })
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const normInput = normalizeKenyanPhone(phone) || phone.trim();
    const normBooking = normalizeKenyanPhone(booking.phone) || booking.phone.trim();
    if (normInput !== normBooking && phone.trim() !== booking.phone.trim()) {
      return res.status(403).json({ error: 'Unauthorized: phone number does not match booking' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    let affectedBookings = [booking];
    if (booking.groupId) {
      affectedBookings = await Booking.find({ tenantId, groupId: booking.groupId })
        .populate('serviceId')
        .populate('attendantId', 'name')
        .sort({ groupOrder: 1 });

      await Booking.updateMany({ tenantId, groupId: booking.groupId }, { status: 'cancelled' });
      booking.status = 'cancelled';
    } else {
      booking.status = 'cancelled';
      await booking.save();
    }

    const tenantIdStr = tenantId.toString();
    const service = booking.serviceId as any;
    const attendantName = (booking.attendantId as any)?.name;

    const combinedName = affectedBookings
      .map(b => `${(b.serviceId as any)?.name ?? 'Service'} with ${(b.attendantId as any)?.name ?? 'Staff'}`)
      .join(' & ');

    const syntheticService = {
      _id: service._id,
      name: combinedName,
      price: affectedBookings.reduce((sum, b) => sum + (b.price || (b.serviceId as any)?.price || 0), 0),
    } as any;

    void sendBookingCancelledToCustomer(req.tenant!, booking, syntheticService, undefined);
    void sendWhatsAppBookingCancelled(booking, syntheticService);
    void sendBookingCancelledSms(req.tenant!, booking, syntheticService);

    void sendPushToPhone(booking.phone, {
      title: '❌ Booking Cancelled Successfully',
      body: `Your appointment for ${combinedName} on ${booking.date} has been successfully cancelled.`,
      url: '/',
    }, tenantIdStr);

    void sendPushToAdmins({
      title: '⚠️ Booking Cancelled by Customer',
      body: `${booking.customerName} cancelled appointment for ${combinedName} on ${booking.date}`,
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
 * If the booking belongs to a group, reschedules all segments sequentially back-to-back.
 */
export const rescheduleBookingCustomer = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const { id } = req.params;
    const { date, startTime, phone } = req.body;

    if (!date || !startTime) {
      return res.status(400).json({ error: 'date and startTime are required' });
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required for verification' });
    }

    const booking = await Booking.findOne({ _id: id, tenantId })
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const normInput = normalizeKenyanPhone(phone) || phone.trim();
    const normBooking = normalizeKenyanPhone(booking.phone) || booking.phone.trim();
    if (normInput !== normBooking && phone.trim() !== booking.phone.trim()) {
      return res.status(403).json({ error: 'Unauthorized: phone number does not match booking' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reschedule a cancelled booking' });
    }

    let groupBookings = [booking];
    if (booking.groupId) {
      groupBookings = await Booking.find({ tenantId, groupId: booking.groupId })
        .populate('serviceId')
        .populate('attendantId', 'name')
        .sort({ groupOrder: 1 });
    }

    // Exclude all bookings in this appointment from overlap check
    const groupBookingIds = groupBookings.map(b => b._id);
    const existingBookings = await Booking.find({
      tenantId,
      date,
      _id: { $nin: groupBookingIds },
      status: { $ne: 'cancelled' },
    });

    let currentCursor = DateTime.fromISO(`${date}T${startTime}`);
    const updatedPlan: Array<{ doc: any; startTime: string; endTime: string }> = [];

    for (const b of groupBookings) {
      const svc = b.serviceId as any;
      const duration = svc?.duration || 60;
      const segStart = currentCursor;
      const segEnd = currentCursor.plus({ minutes: duration });
      const segStartStr = segStart.toFormat('HH:mm');
      const segEndStr = segEnd.toFormat('HH:mm');

      const attId = (b.attendantId as any)?._id?.toString() || b.attendantId?.toString();
      if (attId) {
        const tenantBuffer = req.tenant?.bookingRules?.bufferMinutes || 0;
        const candBuffer = (svc?.bufferAfterMinutes !== undefined && svc.bufferAfterMinutes > 0)
          ? svc.bufferAfterMinutes
          : tenantBuffer;

        const hasOverlap = existingBookings.some(eb => {
          const ebAttId = (eb.attendantId as any)?._id?.toString() || eb.attendantId?.toString();
          if (ebAttId !== attId) return false;
          const ebStart = DateTime.fromISO(`${date}T${eb.startTime}`);
          const ebEnd = DateTime.fromISO(`${date}T${eb.endTime}`);
          const ebBuffer = (eb.bufferMinutes !== undefined && eb.bufferMinutes > 0)
            ? eb.bufferMinutes
            : tenantBuffer;
          return segStart < ebEnd.plus({ minutes: ebBuffer }) && segEnd.plus({ minutes: candBuffer }) > ebStart;
        });

        if (hasOverlap) {
          return res.status(400).json({
            error: `Time slot ${segStartStr}–${segEndStr} is already booked for ${(b.attendantId as any)?.name || 'staff'}`
          });
        }
      }

      updatedPlan.push({ doc: b, startTime: segStartStr, endTime: segEndStr });
      currentCursor = segEnd;
    }

    const prevDate = booking.date;
    const prevTime = booking.startTime;

    // Apply updates
    for (const plan of updatedPlan) {
      plan.doc.date = date;
      plan.doc.startTime = plan.startTime;
      plan.doc.endTime = plan.endTime;
      plan.doc.status = 'pending';
      await plan.doc.save();
    }

    const tenantIdStr = tenantId.toString();
    const combinedName = groupBookings
      .map(b => `${(b.serviceId as any)?.name ?? 'Service'} with ${(b.attendantId as any)?.name ?? 'Staff'}`)
      .join(' & ');

    const syntheticService = {
      _id: (booking.serviceId as any)._id,
      name: combinedName,
      price: groupBookings.reduce((sum, b) => sum + (b.price || (b.serviceId as any)?.price || 0), 0),
    } as any;

    void sendBookingRequestReceived(req.tenant!, booking, syntheticService, undefined);
    void sendWhatsAppRescheduled(booking, syntheticService, undefined);
    void sendBookingRescheduledSms(req.tenant!, booking, syntheticService);

    void sendPushToPhone(booking.phone, {
      title: '📅 Appointment Rescheduled (Pending Approval)',
      body: `Your appointment for ${combinedName} was rescheduled to ${booking.date} at ${booking.startTime} (previously ${prevDate} @ ${prevTime}).`,
      url: '/',
    }, tenantIdStr);

    void sendPushToAdmins({
      title: '🔄 Appointment Rescheduled by Customer',
      body: `${booking.customerName} moved appointment to ${booking.date} at ${booking.startTime} (prev ${prevDate} @ ${prevTime})`,
      url: '/admin',
    }, tenantIdStr);

    res.json(booking);
  } catch (error) {
    console.error('[bookingController] rescheduleBookingCustomer error:', error);
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
};

