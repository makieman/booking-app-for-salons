import { DateTime, Interval } from 'luxon';
import { IBooking } from '../models/Booking';

/**
 * Default working hours — used when no tenant-specific hours are supplied.
 */
export const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '18:00',
};

/**
 * Generates available time slots for a specific date and service duration.
 *
 * @param date           - The date in YYYY-MM-DD format
 * @param duration       - Service duration in minutes
 * @param existingBookings - List of existing bookings for the date (pre-filtered)
 * @param workingHours   - Salon working hours (defaults to 09:00–18:00)
 * @returns Array of available time strings (e.g., ["09:00", "09:30", "10:00"])
 */
export function generateAvailableSlots(
  date: string,
  duration: number,
  existingBookings: IBooking[],
  workingHours: { start: string; end: string } = DEFAULT_WORKING_HOURS,
): string[] {
  const startOfDay = DateTime.fromISO(`${date}T${workingHours.start}`);
  const endOfDay   = DateTime.fromISO(`${date}T${workingHours.end}`);

  const workingMinutes = endOfDay.diff(startOfDay, 'minutes').minutes;

  // If service takes longer than the working day: offer 09:00 as single slot
  if (duration >= workingMinutes) {
    const dayAlreadyBooked = existingBookings.length > 0;
    return dayAlreadyBooked ? [] : [workingHours.start];
  }

  const slots: string[] = [];
  let currentSlot = startOfDay;

  while (currentSlot.plus({ minutes: duration }) <= endOfDay) {
    const slotStart = currentSlot;
    const slotEnd   = currentSlot.plus({ minutes: duration });
    const potentialInterval = Interval.fromDateTimes(slotStart, slotEnd);

    const isOverlap = existingBookings.some(booking => {
      const bStart = DateTime.fromISO(`${date}T${booking.startTime}`);
      const bEnd   = DateTime.fromISO(`${date}T${booking.endTime}`);
      const bInterval = Interval.fromDateTimes(bStart, bEnd);
      return potentialInterval.overlaps(bInterval);
    });

    if (!isOverlap) {
      slots.push(currentSlot.toFormat('HH:mm'));
    }

    currentSlot = currentSlot.plus({ minutes: 30 });
  }

  return slots;
}

