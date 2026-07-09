import { Request, Response } from 'express';
import Service from '../models/Service';
import Booking from '../models/Booking';
import Attendant from '../models/Attendant';
import { generateAvailableSlots } from '../services/slotService';

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
