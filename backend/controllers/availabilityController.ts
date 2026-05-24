import { Request, Response } from 'express';
import Service from '../models/Service';
import Booking from '../models/Booking';
import Attendant from '../models/Attendant';
import { generateAvailableSlots } from '../services/slotService';

/**
 * GET /api/availability?date=YYYY-MM-DD&serviceId=xxx[&attendantId=yyy]
 *
 * Returns an array of available time slots (HH:mm strings).
 * - If attendantId is provided: slots are based only on THAT attendant's bookings.
 * - If attendantId is omitted: uses global booking overlap (backward compatible).
 */
export const getAvailability = async (req: Request, res: Response) => {
  try {
    const { date, serviceId, attendantId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Date and serviceId are required' });
    }

    const service = await Service.findById(serviceId as string);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Scope to attendant when provided; global otherwise (backward compat)
    const bookingQuery: Record<string, unknown> = { date: date as string };
    if (attendantId) {
      bookingQuery.attendantId = attendantId as string;
    }

    const existingBookings = await Booking.find(bookingQuery);

    const availableSlots = generateAvailableSlots(
      date as string,
      service.duration,
      existingBookings
    );

    res.json(availableSlots);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

/**
 * GET /api/availability/any?date=YYYY-MM-DD&serviceId=xxx
 *
 * Returns availability for ALL active attendants who can perform this service,
 * plus a union of all available slots. Used when the customer picks "Any Available".
 *
 * Response:
 * {
 *   slots: string[],                        // union of all attendant slots
 *   attendantSlots: {
 *     attendantId: string,
 *     name: string,
 *     slots: string[]
 *   }[]
 * }
 */
export const getAnyAvailability = async (req: Request, res: Response) => {
  try {
    const { date, serviceId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Date and serviceId are required' });
    }

    const service = await Service.findById(serviceId as string);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Find active attendants that can perform this service
    const attendants = await Attendant.find({
      isActive: true,
      serviceIds: serviceId as string,
    }).select('_id name');

    if (attendants.length === 0) {
      return res.json({ slots: [], attendantSlots: [] });
    }

    // Compute slots per attendant in parallel
    const attendantSlots = await Promise.all(
      attendants.map(async attendant => {
        const bookings = await Booking.find({
          date: date as string,
          attendantId: attendant._id,
        });
        const slots = generateAvailableSlots(date as string, service.duration, bookings);
        return { attendantId: attendant._id.toString(), name: attendant.name, slots };
      })
    );

    // Union of all slots across attendants (deduplicated, sorted)
    const allSlots = [...new Set(attendantSlots.flatMap(a => a.slots))].sort();

    res.json({ slots: allSlots, attendantSlots });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};
