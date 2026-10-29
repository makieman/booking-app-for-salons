import { Request, Response } from 'express';
import { DateTime } from 'luxon';
import Booking from '../models/Booking';
import Service from '../models/Service';
import Attendant, { type IAttendant } from '../models/Attendant';
import {
  sendBookingConfirmedToCustomer,
  sendBookingCancelledToCustomer,
  sendBookingRescheduledToCustomer,
} from '../services/emailService';
import { sendPushToPhone, sendPushToAttendant, sendPushToAdmins } from '../services/pushService';
import {
  sendWhatsAppBookingConfirmed,
  sendWhatsAppBookingCancelled,
  sendWhatsAppRescheduled,
} from '../services/whatsappService';
import {
  sendBookingConfirmedSms,
  sendBookingCancelledSms,
  sendBookingRescheduledSms,
} from '../services/smsService';
import { generateUniqueBookingReference } from './bookingController';

/**
 * GET /api/admin/bookings
 * Returns all bookings for the resolved tenant with optional filters:
 * ?status=... ?attendantId=... ?date=... ?startDate=... ?endDate=... ?search=... ?page=... ?limit=...
 */
export const getAdminBookings = async (req: Request, res: Response) => {
  try {
    const { status, attendantId, date, startDate, endDate, search, page, limit } = req.query;
    const query: Record<string, unknown> = { tenantId: req.tenant!._id };

    if (status && typeof status === 'string' && status !== 'all') {
      query.status = status.trim();
    }
    if (attendantId && typeof attendantId === 'string' && attendantId !== 'all') {
      query.attendantId = attendantId.trim();
    }
    if (date && typeof date === 'string') {
      query.date = date.trim();
    } else if (startDate || endDate) {
      const dateRange: Record<string, string> = {};
      if (startDate && typeof startDate === 'string') dateRange.$gte = startDate.trim();
      if (endDate && typeof endDate === 'string') dateRange.$lte = endDate.trim();
      if (Object.keys(dateRange).length > 0) {
        query.date = dateRange;
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const escapedSearch = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query.$or = [
        { customerName: searchRegex },
        { phone: searchRegex },
        { reference: searchRegex },
      ];
    }

    // Optional pagination
    if (page !== undefined || limit !== undefined) {
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const [bookings, totalCount] = await Promise.all([
        Booking.find(query)
          .populate('serviceId')
          .populate('attendantId', 'name')
          .sort({ date: -1, startTime: -1 })
          .skip(skip)
          .limit(limitNum),
        Booking.countDocuments(query),
      ]);

      return res.json({
        bookings,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum),
        },
      });
    }

    // Default unpaginated query (for full local in-memory synchronization)
    const bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ date: -1, startTime: -1 });

    res.json(bookings);
  } catch (error) {
    console.error('[adminController] getAdminBookings error:', error);
    res.status(500).json({ error: 'Failed to fetch admin bookings' });
  }
};

/**
 * POST /api/admin/bookings
 * Creates an appointment directly from the admin panel (walk-in or telephone client).
 * Scoped to resolved tenant with overlap conflict validation.
 */
export const createAdminBooking = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const {
      customerName,
      phone,
      email,
      serviceId,
      attendantId,
      date,
      startTime,
      notes,
      status = 'confirmed',
      sendNotifications = true,
    } = req.body;

    const allowedStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowedStatuses.join(', ')}` });
    }

    if (!customerName || !phone || !serviceId || !date || !startTime) {
      return res.status(400).json({
        error: 'Customer name, phone, service, date, and start time are required.',
      });
    }

    const service = await Service.findOne({ _id: serviceId, tenantId });
    if (!service) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    let assignedAttendant: any = null;
    if (attendantId) {
      assignedAttendant = await Attendant.findOne({ _id: attendantId, tenantId, isActive: true });
      if (!assignedAttendant) {
        return res.status(404).json({ error: 'Attendant not found or inactive.' });
      }
    }

    const startDateTime = DateTime.fromISO(`${date}T${startTime}`);
    if (!startDateTime.isValid) {
      return res.status(400).json({ error: 'Invalid date or start time format.' });
    }
    const endDateTime = startDateTime.plus({ minutes: service.duration });
    const endTime = endDateTime.toFormat('HH:mm');

    // Overlap validation: pending or confirmed bookings block admin walk-ins
    if (assignedAttendant && (status === 'confirmed' || status === 'pending')) {
      const activeBookings = await Booking.find({
        tenantId,
        date,
        attendantId: assignedAttendant._id,
        status: { $in: ['confirmed', 'pending'] },
      });

      const tenantBuffer = req.tenant?.bookingRules?.bufferMinutes ?? 0;
      const candBuffer = (service.bufferAfterMinutes !== undefined && service.bufferAfterMinutes > 0)
        ? service.bufferAfterMinutes
        : tenantBuffer;

      const hasConflict = activeBookings.some(b => {
        const bStart = DateTime.fromISO(`${date}T${b.startTime}`);
        const bEnd = DateTime.fromISO(`${date}T${b.endTime}`);
        const bBuffer = (b.bufferMinutes !== undefined && b.bufferMinutes > 0)
          ? b.bufferMinutes
          : tenantBuffer;
        return startDateTime < bEnd.plus({ minutes: bBuffer }) && endDateTime.plus({ minutes: candBuffer }) > bStart;
      });

      if (hasConflict) {
        return res.status(409).json({
          error: `Conflict: ${assignedAttendant.name} is already booked around ${startTime}–${endTime} on ${date}.`,
        });
      }
    }

    // Generate unique reference with retry
    const reference = await generateUniqueBookingReference(tenantId);

    const booking = new Booking({
      tenantId,
      reference,
      customerName: customerName.trim(),
      phone: phone.trim(),
      email: email?.trim() || undefined,
      serviceId: service._id,
      attendantId: assignedAttendant ? assignedAttendant._id : null,
      date,
      startTime,
      endTime,
      bufferMinutes: service.bufferAfterMinutes ?? 0,
      price: service.price,
      status,
      notes: notes?.trim() || undefined,
    });

    await booking.save();
    await booking.populate('serviceId');
    await booking.populate('attendantId', 'name');

    // Notifications
    if (sendNotifications) {
      const tenantIdStr = tenantId.toString();
      const serviceName = assignedAttendant
        ? `${service.name} with ${assignedAttendant.name}`
        : service.name;

      const syntheticService = {
        _id: service._id,
        name: serviceName,
        price: service.price,
        duration: service.duration,
      } as any;

      if (status === 'confirmed') {
        void sendBookingConfirmedToCustomer(req.tenant!, booking, syntheticService, assignedAttendant?.name);
        void sendWhatsAppBookingConfirmed(booking, syntheticService, assignedAttendant?.name);
        void sendBookingConfirmedSms(req.tenant!, booking, syntheticService, assignedAttendant?.name);
        void sendPushToPhone(
          booking.phone,
          {
            title: 'Appointment Booked!',
            body: `Appointment confirmed for ${serviceName} on ${booking.date} at ${booking.startTime}.`,
            url: '/',
          },
          tenantIdStr
        );

        if (assignedAttendant) {
          void sendPushToAttendant(
            assignedAttendant._id.toString(),
            {
              title: '📅 New Confirmed Appointment',
              body: `New appointment with ${booking.customerName} on ${booking.date} at ${booking.startTime} for ${service.name}.`,
              url: '/attendant',
            },
            tenantIdStr
          );
        }
      }
    }

    res.status(201).json(booking);
  } catch (error) {
    console.error('[adminController] createAdminBooking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

/**
 * PATCH /api/admin/bookings/:id
 * Confirms, reschedules, cancels, completes, or marks no-show for a booking.
 * Scoped to the resolved tenant.
 *
 * Payload:
 * {
 *   status?: 'confirmed' | 'cancelled' | 'completed' | 'no-show';
 *   reason?: string;
 *   cancellationReason?: string;
 *   notes?: string;
 *   reschedule?: {
 *     date: string;       // YYYY-MM-DD
 *     startTime: string;  // HH:mm
 *     attendantId?: string;
 *   };
 * }
 */
export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason, cancellationReason, notes, reschedule } = req.body;
    const rawReason = typeof reason === 'string'
      ? reason.trim().slice(0, 500)
      : typeof cancellationReason === 'string'
        ? cancellationReason.trim().slice(0, 500)
        : null;
    const finalReason = rawReason || null;

    const allowedStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowedStatuses.join(', ')}` });
    }

    if (!status && !reschedule && notes === undefined) {
      return res.status(400).json({ error: 'Either status, reschedule, or notes must be provided' });
    }

    // Find the initial booking scoped to tenant
    const booking = await Booking.findOne({ _id: id, tenantId: req.tenant!._id })
      .populate('serviceId')
      .populate('attendantId', 'name');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Find all group bookings if multi-service
    let groupBookings = [booking];
    if (booking.groupId) {
      groupBookings = await Booking.find({ tenantId: req.tenant!._id, groupId: booking.groupId })
        .populate('serviceId')
        .populate('attendantId', 'name')
        .sort({ groupOrder: 1 });
    }

    const groupBookingIds = groupBookings.map(b => b._id);
    const tenantIdStr = req.tenant!._id.toString();

    // ── Rescheduling & Overlap Validation ───────────────────────────────────────
    const isRescheduling = Boolean(reschedule?.date && reschedule?.startTime);
    const targetDate = isRescheduling ? reschedule!.date : booking.date;
    const targetStartTime = isRescheduling ? reschedule!.startTime : booking.startTime;
    const isConfirming = status === 'confirmed';

    // If confirming or rescheduling, validate that slot has no overlap conflicts
    if (isRescheduling || isConfirming) {
      // Find other active confirmed bookings on the target date
      const existingActiveBookings = await Booking.find({
        tenantId: req.tenant!._id,
        date: targetDate,
        _id: { $nin: groupBookingIds },
        status: { $in: ['confirmed'] },
      });

      let cursor = DateTime.fromISO(`${targetDate}T${targetStartTime}`);
      if (!cursor.isValid) {
        return res.status(400).json({ error: 'Invalid date or startTime format' });
      }

      for (let i = 0; i < groupBookings.length; i++) {
        const seg = groupBookings[i];
        const duration = (seg.serviceId as any)?.duration || 30;
        const segStart = cursor;
        const segEnd = cursor.plus({ minutes: duration });

        let assignedAttId: string | null = null;
        if (isRescheduling && reschedule?.attendantId && i === 0) {
          assignedAttId = reschedule.attendantId;
        } else {
          assignedAttId = (seg.attendantId as any)?._id?.toString() || seg.attendantId?.toString() || null;
        }

        if (assignedAttId) {
          const tenantBuffer = req.tenant?.bookingRules?.bufferMinutes ?? 0;
          const svcBuffer = (seg.serviceId as any)?.bufferAfterMinutes ?? tenantBuffer;
          const candBuffer = svcBuffer > 0 ? svcBuffer : tenantBuffer;

          const hasConflict = existingActiveBookings.some(eb => {
            const ebAttId = (eb.attendantId as any)?._id?.toString() || eb.attendantId?.toString();
            if (ebAttId !== assignedAttId) return false;
            const ebStart = DateTime.fromISO(`${targetDate}T${eb.startTime}`);
            const ebEnd = DateTime.fromISO(`${targetDate}T${eb.endTime}`);
            const ebBuffer = (eb.bufferMinutes !== undefined && eb.bufferMinutes > 0)
              ? eb.bufferMinutes
              : tenantBuffer;
            return segStart < ebEnd.plus({ minutes: ebBuffer }) && segEnd.plus({ minutes: candBuffer }) > ebStart;
          });

          if (hasConflict) {
            const attName = (seg.attendantId as any)?.name || 'The requested attendant';
            return res.status(409).json({
              error: `Conflict: ${attName} is already booked around ${segStart.toFormat('HH:mm')}–${segEnd.toFormat('HH:mm')} on ${targetDate}.`,
            });
          }
        }

        cursor = segEnd;
      }
    }

    // ── Apply Updates ─────────────────────────────────────────────────────────
    let currentCursor = DateTime.fromISO(`${targetDate}T${targetStartTime}`);
    for (let i = 0; i < groupBookings.length; i++) {
      const seg = groupBookings[i];
      const duration = (seg.serviceId as any)?.duration || 30;

      if (isRescheduling) {
        seg.date = targetDate;
        seg.startTime = currentCursor.toFormat('HH:mm');
        currentCursor = currentCursor.plus({ minutes: duration });
        seg.endTime = currentCursor.toFormat('HH:mm');

        if (reschedule?.attendantId && i === 0) {
          seg.attendantId = reschedule.attendantId as any;
        }
      }

      if (status) {
        seg.status = status;
        if (status === 'completed') {
          seg.completedAt = new Date();
        } else if (status === 'cancelled') {
          seg.cancellationReason = finalReason ?? undefined;
        }
      } else if (isRescheduling && seg.status === 'pending') {
        seg.status = 'confirmed';
      }

      if (notes !== undefined) {
        seg.notes = typeof notes === 'string' ? notes.trim().slice(0, 1000) : null as any;
      }

      await seg.save();
    }

    // Reload updated bookings
    const refreshedGroupBookings = await Booking.find({ _id: { $in: groupBookingIds } })
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ groupOrder: 1 });

    const primaryUpdatedBooking = refreshedGroupBookings[0] || booking;

    const combinedName = refreshedGroupBookings
      .map(b => `${(b.serviceId as any)?.name ?? 'Service'} with ${(b.attendantId as any)?.name ?? 'Staff'}`)
      .join(' & ');

    const syntheticService = {
      _id: (primaryUpdatedBooking.serviceId as any)._id,
      name: combinedName,
      price: refreshedGroupBookings.reduce((sum, b) => sum + (b.price || (b.serviceId as any)?.price || 0), 0),
    } as any;

    // ── Notifications ──────────────────────────────────────────────────────────
    const targetStatus = status || (isRescheduling ? 'confirmed' : primaryUpdatedBooking.status);

    if (isRescheduling) {
      void sendWhatsAppRescheduled(primaryUpdatedBooking, syntheticService, (primaryUpdatedBooking.attendantId as any)?.name);
      void sendBookingRescheduledSms(req.tenant!, primaryUpdatedBooking, syntheticService, (primaryUpdatedBooking.attendantId as any)?.name);
      void sendBookingRescheduledToCustomer(req.tenant!, primaryUpdatedBooking, syntheticService, (primaryUpdatedBooking.attendantId as any)?.name);
      void sendPushToPhone(primaryUpdatedBooking.phone, {
        title: '📅 Appointment Rescheduled',
        body: `Your booking for ${combinedName} is now on ${primaryUpdatedBooking.date} at ${primaryUpdatedBooking.startTime}.`,
        url: '/',
      }, tenantIdStr);

      for (const b of refreshedGroupBookings) {
        const attId = (b.attendantId as any)?._id?.toString() || b.attendantId?.toString();
        if (attId) {
          void sendPushToAttendant(
            attId,
            {
              title: '📅 Appointment Rescheduled',
              body: `${b.customerName} appointment rescheduled to ${b.date} at ${b.startTime}.`,
              url: '/attendant',
            },
            tenantIdStr
          );
        }
      }
    } else if (targetStatus === 'confirmed') {
      void sendBookingConfirmedToCustomer(req.tenant!, primaryUpdatedBooking, syntheticService, undefined);
      void sendWhatsAppBookingConfirmed(primaryUpdatedBooking, syntheticService, undefined);
      void sendBookingConfirmedSms(req.tenant!, primaryUpdatedBooking, syntheticService);
      void sendPushToPhone(primaryUpdatedBooking.phone, {
        title: 'Appointment Confirmed!',
        body: `See you on ${primaryUpdatedBooking.date} at ${primaryUpdatedBooking.startTime} for ${combinedName}. Please arrive 5–10 mins early.`,
        url: '/',
      }, tenantIdStr);

      for (const b of refreshedGroupBookings) {
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
    } else if (targetStatus === 'cancelled') {
      void sendBookingCancelledToCustomer(req.tenant!, primaryUpdatedBooking, syntheticService, undefined, finalReason || undefined);
      void sendWhatsAppBookingCancelled(primaryUpdatedBooking, syntheticService, finalReason || undefined);
      void sendBookingCancelledSms(req.tenant!, primaryUpdatedBooking, syntheticService, finalReason || undefined);
      void sendPushToPhone(primaryUpdatedBooking.phone, {
        title: '❌ Booking Cancelled',
        body: `Your booking for ${combinedName} on ${primaryUpdatedBooking.date} has been cancelled.${finalReason ? ` Reason: ${finalReason}` : ''}`,
        url: '/',
      }, tenantIdStr);
      void sendPushToAdmins({
        title: '❌ Booking Cancelled',
        body: `Booking for ${primaryUpdatedBooking.customerName} (${combinedName}) on ${primaryUpdatedBooking.date} cancelled.${finalReason ? ` Reason: ${finalReason}` : ''}`,
        url: '/admin',
      }, tenantIdStr);

      for (const b of refreshedGroupBookings) {
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
    } else if (targetStatus === 'completed') {
      void sendPushToAdmins({
        title: '✔️ Booking Completed',
        body: `Appointment for ${primaryUpdatedBooking.customerName} (${combinedName}) marked completed.`,
        url: '/admin',
      }, tenantIdStr);
    }

    res.json(primaryUpdatedBooking);
  } catch (error) {
    console.error('[adminController] updateBookingStatus error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
};
