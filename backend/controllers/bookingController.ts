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
import { sendWhatsAppBookingReceived, sendWhatsAppBookingCancelled, sendWhatsAppRescheduled } from '../services/whatsappService';

import mongoose from 'mongoose';
import { MAX_SERVICES } from '../services/slotService';

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
    const { customerName, phone, email, date, startTime } = req.body;

    if (!customerName || !phone || !date || !startTime) {
      return res.status(400).json({ error: 'customerName, phone, date, and startTime are required' });
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
    let reference = '';
    let isUnique = false;
    while (!isUnique) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'LMN-';
      for (let i = 0; i < 5; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      const existing = await Booking.findOne({ tenantId, reference: result });
      if (!existing) { reference = result; isUnique = true; }
    }

    const groupId = rawItems.length > 1
      ? `grp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      : undefined;

    // Fetch existing active bookings for this date to check overlaps
    const existingBookings = await Booking.find({
      tenantId,
      date,
      status: { $ne: 'cancelled' },
    });

    let currentCursor = DateTime.fromISO(`${date}T${startTime}`);
    const resolvedSegments: Array<{
      service: any;
      attendant: any;
      startTime: string;
      endTime: string;
      groupOrder: number;
    }> = [];

    // Temporary list of intervals reserved within this booking session
    const newlyBookedIntervals: Array<{ attendantId: string; start: DateTime; end: DateTime }> = [];

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

      // Helper to check if an attendant is free during [segStart, segEnd]
      const isFree = (attId: string) => {
        const overlapsDb = existingBookings.some(b => {
          const bAttId = (b.attendantId as any)?._id?.toString() || b.attendantId?.toString();
          if (bAttId !== attId) return false;
          const bStart = DateTime.fromISO(`${date}T${b.startTime}`);
          const bEnd = DateTime.fromISO(`${date}T${b.endTime}`);
          return segStart < bEnd && segEnd > bStart;
        });
        if (overlapsDb) return false;

        const overlapsNew = newlyBookedIntervals.some(n => {
          if (n.attendantId !== attId) return false;
          return segStart < n.end && segEnd > n.start;
        });
        return !overlapsNew;
      };

      let resolvedAttendant: any = null;

      if (item.attendantId) {
        const attendant = await Attendant.findOne({ _id: item.attendantId, tenantId, isActive: true });
        if (!attendant) {
          return res.status(404).json({ error: `Attendant not found or inactive: ${item.attendantId}` });
        }
        if (!isFree(attendant._id.toString())) {
          return res.status(400).json({ error: `Time slot ${segStartTimeStr}–${segEndTimeStr} is already booked for ${attendant.name}` });
        }
        resolvedAttendant = attendant;
      } else {
        // "Any Available" — resolve to a real concrete attendant
        const qualifiedAttendants = await Attendant.find({
          tenantId,
          isActive: true,
          serviceIds: service._id,
        });

        // Prefer keeping previous segment's attendant if qualified and free
        const prevAttId = resolvedSegments[i - 1]?.attendant?._id?.toString();
        const matchingPrev = prevAttId
          ? qualifiedAttendants.find(a => a._id.toString() === prevAttId)
          : null;

        if (matchingPrev && isFree(matchingPrev._id.toString())) {
          resolvedAttendant = matchingPrev;
        } else {
          resolvedAttendant = qualifiedAttendants.find(a => isFree(a._id.toString()));
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
 * Query: reference or phone — scoped to the resolved tenant.
 * Guarantees all segments in a multi-service group are returned.
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

    let bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ createdAt: -1 });

    const groupIds = [...new Set(bookings.map(b => b.groupId).filter(Boolean))] as string[];
    if (groupIds.length > 0) {
      const allGroupBookings = await Booking.find({
        tenantId: req.tenant!._id,
        groupId: { $in: groupIds },
      })
        .populate('serviceId')
        .populate('attendantId', 'name')
        .sort({ groupOrder: 1 });

      const seen = new Set<string>();
      const merged = [];
      for (const b of [...bookings, ...allGroupBookings]) {
        const idStr = b._id.toString();
        if (!seen.has(idStr)) {
          seen.add(idStr);
          merged.push(b);
        }
      }
      bookings = merged;
    }

    res.json(bookings);
  } catch (error) {
    console.error('[bookingController] lookupBookings error:', error);
    res.status(500).json({ error: 'Failed to look up bookings' });
  }
};

/**
 * PATCH /api/bookings/:id/cancel-customer
 * Cancels a booking — scoped to the resolved tenant.
 * If the booking belongs to a multi-service group, cancels ALL segments in the group.
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
        const hasOverlap = existingBookings.some(eb => {
          const ebAttId = (eb.attendantId as any)?._id?.toString() || eb.attendantId?.toString();
          if (ebAttId !== attId) return false;
          const ebStart = DateTime.fromISO(`${date}T${eb.startTime}`);
          const ebEnd = DateTime.fromISO(`${date}T${eb.endTime}`);
          return segStart < ebEnd && segEnd > ebStart;
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

