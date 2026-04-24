import { Request, Response } from 'express';
import Service from '../models/Service';
import Booking from '../models/Booking';
import { generateAvailableSlots } from '../services/slotService';

/**
 * GET /api/availability?date=YYYY-MM-DD&serviceId=xxx
 * Returns an array of available time slots (HH:mm strings) for the
 * given date and service. Accounts for the service's duration and
 * existing bookings that would overlap.
 */
export const getAvailability = async (req: Request, res: Response) => {
  try {
    const { date, serviceId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Date and serviceId are required' });
    }

    const service = await Service.findById(serviceId as string);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Fetch bookings for the specified date
    const existingBookings = await Booking.find({ date: date as string });

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
