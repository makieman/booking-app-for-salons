import { Request, Response } from 'express';
import Service from '../models/Service';
import Booking from '../models/Booking';
import Attendant from '../models/Attendant';
import { generateAvailableSlots, generateMultiServiceSlots, MAX_SERVICES } from '../services/slotService';

/**
 * GET /api/availability?date=YYYY-MM-DD&serviceId=xxx[&attendantId=yyy]
 * Returns available time slots. All queries scoped to the resolved tenant.
 * Uses tenant.workingHours to determine the bookable window.
 */
export const getAvailability = async (req: Request, res: Response) => {
  try {
    const { date, serviceId, attendantId } = req.query;
    const tenantId = req.tenant!._id;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Date and serviceId are required' });
    }

    const service = await Service.findOne({ _id: serviceId as string, tenantId });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const bookingQuery: Record<string, unknown> = { tenantId, date: date as string };
    if (attendantId) bookingQuery.attendantId = attendantId as string;

    const existingBookings = await Booking.find(bookingQuery);

    const availableSlots = generateAvailableSlots(
      date as string,
      service.duration,
      existingBookings,
      req.tenant!.workingHours,
    );

    res.json(availableSlots);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

/**
 * GET /api/availability/any?date=YYYY-MM-DD&serviceId=xxx
 * Returns availability for ALL active attendants in this tenant who can
 * perform this service. Scoped entirely to the resolved tenant.
 */
export const getAnyAvailability = async (req: Request, res: Response) => {
  try {
    const { date, serviceId } = req.query;
    const tenantId = req.tenant!._id;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Date and serviceId are required' });
    }

    const service = await Service.findOne({ _id: serviceId as string, tenantId });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const attendants = await Attendant.find({
      tenantId,
      isActive: true,
      serviceIds: serviceId as string,
    }).select('_id name');

    if (attendants.length === 0) {
      return res.json({ slots: [], attendantSlots: [] });
    }

    const attendantSlots = await Promise.all(
      attendants.map(async attendant => {
        const bookings = await Booking.find({
          tenantId,
          date: date as string,
          attendantId: attendant._id,
        });
        const slots = generateAvailableSlots(
          date as string,
          service.duration,
          bookings,
          req.tenant!.workingHours,
        );
        return { attendantId: attendant._id.toString(), name: attendant.name, slots };
      })
    );

    const allSlots = [...new Set(attendantSlots.flatMap(a => a.slots))].sort();

    res.json({ slots: allSlots, attendantSlots });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

/**
 * GET or POST /api/availability/multi
 * Calculates back-to-back availability for 1 or more services (up to MAX_SERVICES).
 * Resolves concrete attendants for any "Any Available" request.
 * Scoped to resolved tenant.
 */
export const getMultiAvailability = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenant!._id;
    const date = (req.query.date as string) || (req.body && req.body.date);
    let items = req.body && req.body.items ? req.body.items : null;

    if (!items && req.query.items) {
      try {
        items = typeof req.query.items === 'string' ? JSON.parse(req.query.items) : req.query.items;
      } catch {
        return res.status(400).json({ error: 'Invalid items JSON query parameter' });
      }
    }

    if (!date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'date and items array are required' });
    }

    if (items.length > MAX_SERVICES) {
      return res.status(400).json({ error: `Cannot book more than ${MAX_SERVICES} services in a single appointment` });
    }

    // Resolve services and qualified attendants for each segment
    const itemsInput = [];
    for (const item of items) {
      if (!item.serviceId) {
        return res.status(400).json({ error: 'serviceId is required for each item' });
      }

      const service = await Service.findOne({ _id: item.serviceId, tenantId });
      if (!service) {
        return res.status(404).json({ error: `Service not found: ${item.serviceId}` });
      }

      // Check if requested attendant is valid
      if (item.attendantId) {
        const attendant = await Attendant.findOne({ _id: item.attendantId, tenantId, isActive: true });
        if (!attendant) {
          return res.status(404).json({ error: `Attendant not found or inactive: ${item.attendantId}` });
        }
      }

      // Fetch all active qualified attendants for this service
      const qualified = await Attendant.find({
        tenantId,
        isActive: true,
        serviceIds: item.serviceId,
      }).select('_id name');

      itemsInput.push({
        serviceId: item.serviceId,
        duration: service.duration,
        requestedAttendantId: item.attendantId || null,
        qualifiedAttendants: qualified.map(a => ({ _id: a._id.toString(), name: a.name })),
      });
    }

    // Existing bookings on that date for this tenant
    const existingBookings = await Booking.find({
      tenantId,
      date,
      status: { $ne: 'cancelled' },
    });

    const multiOptions = generateMultiServiceSlots(
      date,
      itemsInput,
      existingBookings,
      req.tenant!.workingHours
    );

    const slots = multiOptions.map(o => o.time);

    res.json({
      slots,
      options: multiOptions,
    });
  } catch (error) {
    console.error('[availabilityController] getMultiAvailability error:', error);
    res.status(500).json({ error: 'Failed to fetch multi-service availability' });
  }
};
