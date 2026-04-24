import { DateTime, Interval } from 'luxon';
import { IBooking } from '../models/Booking';

/**
 * Working hours for the salon — slots are only generated within this window.
 */
export const WORKING_HOURS = {
  start: '09:00',
  end: '18:00',
};

/**
 * Generates available time slots for a specific date and service duration.
 *
 * How it works:
 * 1. Starts at 09:00 and moves in 30-minute increments
 * 2. For each potential slot, checks if a booking of the given duration
 *    would overlap with any existing booking
 * 3. Returns only the slots that don't conflict
 *
 * @param date - The date in YYYY-MM-DD format
 * @param duration - Service duration in minutes
 * @param existingBookings - List of existing bookings for the date
 * @returns Array of available time strings (e.g., ["09:00", "09:30", "10:00"])
 */
export function generateAvailableSlots(
  date: string,
  duration: number,
  existingBookings: IBooking[]
): string[] {
  const startOfDay = DateTime.fromISO(`${date}T${WORKING_HOURS.start}`);
  const endOfDay = DateTime.fromISO(`${date}T${WORKING_HOURS.end}`);

  const slots: string[] = [];
  let currentSlot = startOfDay;

  while (currentSlot.plus({ minutes: duration }) <= endOfDay) {
    const slotStart = currentSlot;
    const slotEnd = currentSlot.plus({ minutes: duration });
    
    // Create interval for the potential slot
    const potentialInterval = Interval.fromDateTimes(slotStart, slotEnd);

    // Check if it overlaps with any existing booking
    const isOverlap = existingBookings.some(booking => {
      const bStart = DateTime.fromISO(`${date}T${booking.startTime}`);
      const bEnd = DateTime.fromISO(`${date}T${booking.endTime}`);
      const bInterval = Interval.fromDateTimes(bStart, bEnd);
      
      return potentialInterval.overlaps(bInterval);
    });

    if (!isOverlap) {
      slots.push(currentSlot.toFormat('HH:mm'));
    }

    // Move to next 30-minute interval regardless of duration
    // This allows for flexible starting points
    currentSlot = currentSlot.plus({ minutes: 30 });
  }

  return slots;
}
