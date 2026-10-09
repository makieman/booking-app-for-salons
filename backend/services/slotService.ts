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

export const MAX_SERVICES = 2;

export interface MultiServiceItemInput {
  serviceId: string;
  duration: number;
  requestedAttendantId?: string | null;
  qualifiedAttendants: Array<{ _id: string; name: string }>;
}

export interface SegmentSlotDetail {
  serviceId: string;
  attendantId: string;
  attendantName: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface MultiSlotOption {
  time: string;       // Overall appointment start (HH:mm)
  endTime: string;    // Overall appointment end (HH:mm)
  segments: SegmentSlotDetail[];
}

/**
 * Checks whether an attendant has any overlapping active bookings for the given interval.
 */
function isAttendantBooked(
  attendantId: string,
  interval: Interval,
  date: string,
  existingBookings: IBooking[]
): boolean {
  return existingBookings.some(booking => {
    if (booking.status === 'cancelled') return false;
    const bAttendantId = (booking.attendantId as any)?._id?.toString() || booking.attendantId?.toString();
    if (!bAttendantId || bAttendantId !== attendantId) return false;

    const bStart = DateTime.fromISO(`${date}T${booking.startTime}`);
    const bEnd   = DateTime.fromISO(`${date}T${booking.endTime}`);
    const bInterval = Interval.fromDateTimes(bStart, bEnd);
    return interval.overlaps(bInterval);
  });
}

/**
 * Calculates available starting times for a multi-service booking sequence.
 * Back-to-back segments: Service 1 ends right as Service 2 begins.
 * Automatically resolves a concrete attendant for any "Any Available" request.
 */
export function generateMultiServiceSlots(
  date: string,
  items: MultiServiceItemInput[],
  existingBookings: IBooking[],
  workingHours: { start: string; end: string } = DEFAULT_WORKING_HOURS
): MultiSlotOption[] {
  if (items.length === 0) return [];

  const startOfDay = DateTime.fromISO(`${date}T${workingHours.start}`);
  const endOfDay   = DateTime.fromISO(`${date}T${workingHours.end}`);
  const totalDuration = items.reduce((sum, item) => sum + item.duration, 0);

  const results: MultiSlotOption[] = [];
  let currentStart = startOfDay;

  while (currentStart.plus({ minutes: totalDuration }) <= endOfDay) {
    let segmentCursor = currentStart;
    let slotValid = true;
    const resolvedSegments: SegmentSlotDetail[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const segStart = segmentCursor;
      const segEnd = segmentCursor.plus({ minutes: item.duration });
      const segInterval = Interval.fromDateTimes(segStart, segEnd);

      let chosenAttendant: { _id: string; name: string } | null = null;

      if (item.requestedAttendantId) {
        // Specific attendant was requested
        const reqAttendant = item.qualifiedAttendants.find(
          a => a._id.toString() === item.requestedAttendantId!.toString()
        );
        if (reqAttendant && !isAttendantBooked(reqAttendant._id, segInterval, date, existingBookings)) {
          chosenAttendant = reqAttendant;
        }
      } else {
        // "Any Available" — find a free qualified attendant
        // Prefer reusing previous segment's attendant if qualified and free for continuity
        const prevAttendantId = resolvedSegments[i - 1]?.attendantId;
        const matchingPrev = prevAttendantId
          ? item.qualifiedAttendants.find(a => a._id.toString() === prevAttendantId)
          : null;

        if (matchingPrev && !isAttendantBooked(matchingPrev._id, segInterval, date, existingBookings)) {
          chosenAttendant = matchingPrev;
        } else {
          // Otherwise pick first free qualified attendant
          const freeAttendants = item.qualifiedAttendants.filter(
            a => !isAttendantBooked(a._id, segInterval, date, existingBookings)
          );
          if (freeAttendants.length > 0) {
            chosenAttendant = freeAttendants[0];
          }
        }
      }

      if (!chosenAttendant) {
        slotValid = false;
        break;
      }

      resolvedSegments.push({
        serviceId: item.serviceId,
        attendantId: chosenAttendant._id.toString(),
        attendantName: chosenAttendant.name,
        startTime: segStart.toFormat('HH:mm'),
        endTime: segEnd.toFormat('HH:mm'),
      });

      segmentCursor = segEnd;
    }

    if (slotValid && resolvedSegments.length === items.length) {
      results.push({
        time: currentStart.toFormat('HH:mm'),
        endTime: segmentCursor.toFormat('HH:mm'),
        segments: resolvedSegments,
      });
    }

    currentStart = currentStart.plus({ minutes: 30 });
  }

  return results;
}

