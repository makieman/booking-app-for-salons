import { DateTime, Interval } from 'luxon';
import { IBooking } from '../models/Booking';
import { ITenantBookingRules } from '../models/Tenant';
import { IAttendant, IAttendantDaySchedule, IAttendantBreak, ITimeOffEntry } from '../models/Attendant';

/**
 * Default working hours — used when no tenant-specific hours are supplied.
 */
export const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '18:00',
};

export const MAX_SERVICES = 2;

export interface SlotGenerationOptions {
  bookingRules?: ITenantBookingRules;
  attendant?: Partial<IAttendant> | null;
  timezone?: string;
  skipNoticeCheck?: boolean;
}

export interface MultiServiceItemInput {
  serviceId: string;
  duration: number;
  requestedAttendantId?: string | null;
  qualifiedAttendants: Array<{
    _id: string;
    name: string;
    schedule?: IAttendantDaySchedule[];
    daysOff?: string[];
    timeOff?: ITimeOffEntry[];
  }>;
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
 * Checks whether an attendant is available during a given interval on a specific date.
 * Takes into account:
 * - Specific attendant days off (daysOff: YYYY-MM-DD[]) and structured timeOff entries
 * - Weekly working day schedule and shift hours
 * - Daily recurring breaks
 * - Existing bookings plus salon buffer time
 */
export function isAttendantFree(
  attendant: { _id: string; name: string; schedule?: IAttendantDaySchedule[]; daysOff?: string[]; timeOff?: ITimeOffEntry[] },
  interval: Interval,
  date: string,
  existingBookings: IBooking[],
  bufferMinutes: number = 0,
  timezone: string = 'Africa/Nairobi',
  defaultWorkingHours: { start: string; end: string } = DEFAULT_WORKING_HOURS
): boolean {
  // 1. Days off & structured time off
  if (attendant.daysOff && attendant.daysOff.includes(date)) {
    return false;
  }
  if (attendant.timeOff && attendant.timeOff.length > 0) {
    const isOff = attendant.timeOff.some(t => {
      if (t.date !== date) return false;
      if (t.allDay || (!t.startTime && !t.endTime)) return true;
      if (t.startTime && t.endTime) {
        const toStart = DateTime.fromISO(`${date}T${t.startTime}`, { zone: timezone });
        const toEnd = DateTime.fromISO(`${date}T${t.endTime}`, { zone: timezone });
        return interval.overlaps(Interval.fromDateTimes(toStart, toEnd));
      }
      return false;
    });
    if (isOff) return false;
  }

  // 2. Day of week schedule
  const dt = DateTime.fromISO(date, { zone: timezone });
  const dayOfWeek = dt.weekday === 7 ? 0 : dt.weekday; // 0=Sun, 1=Mon...6=Sat

  let shiftStartStr = defaultWorkingHours.start;
  let shiftEndStr = defaultWorkingHours.end;
  let breaks: IAttendantBreak[] = [];

  if (attendant.schedule && attendant.schedule.length > 0) {
    const daySchedule = attendant.schedule.find(s => s.dayOfWeek === dayOfWeek);
    if (!daySchedule || !daySchedule.isWorkingDay) {
      return false; // Not a working day for this attendant
    }
    if (daySchedule.start) shiftStartStr = daySchedule.start;
    if (daySchedule.end) shiftEndStr = daySchedule.end;
    if (daySchedule.breaks) breaks = daySchedule.breaks;
  }

  const shiftStart = DateTime.fromISO(`${date}T${shiftStartStr}`, { zone: timezone });
  const shiftEnd = DateTime.fromISO(`${date}T${shiftEndStr}`, { zone: timezone });

  // Must be completely within shift window
  if (!interval.start || !interval.end || interval.start < shiftStart || interval.end > shiftEnd) {
    return false;
  }

  // 3. Breaks
  const overlapsBreak = breaks.some(brk => {
    const brkStart = DateTime.fromISO(`${date}T${brk.start}`, { zone: timezone });
    const brkEnd = DateTime.fromISO(`${date}T${brk.end}`, { zone: timezone });
    return interval.overlaps(Interval.fromDateTimes(brkStart, brkEnd));
  });
  if (overlapsBreak) {
    return false;
  }

  // 4. Overlap with existing bookings (with buffer)
  const attendantIdStr = attendant._id.toString();
  const overlapsBooking = existingBookings.some(booking => {
    if (booking.status === 'cancelled') return false;
    const bAttendantId = (booking.attendantId as any)?._id?.toString() || booking.attendantId?.toString();
    if (!bAttendantId || bAttendantId !== attendantIdStr) return false;

    const bStart = DateTime.fromISO(`${date}T${booking.startTime}`, { zone: timezone });
    const bEnd = DateTime.fromISO(`${date}T${booking.endTime}`, { zone: timezone });

    // Buffer enforcement: candidate cannot start before bEnd + buffer, and candidate + buffer cannot end after bStart
    return interval.start! < bEnd.plus({ minutes: bufferMinutes }) && interval.end!.plus({ minutes: bufferMinutes }) > bStart;
  });

  return !overlapsBooking;
}

/**
 * Generates available time slots for a specific date and service duration.
 * Supports salon booking rules (slot intervals, buffer times, min advance notice, holidays)
 * and individual attendant schedules/breaks/days off.
 *
 * @param date           - The date in YYYY-MM-DD format
 * @param duration       - Service duration in minutes
 * @param existingBookings - List of existing bookings for the date (pre-filtered)
 * @param workingHours   - Salon working hours (defaults to 09:00–18:00)
 * @param options        - Granular booking rules, attendant schedule, and timezone
 * @returns Array of available time strings (e.g., ["09:00", "09:30", "10:00"])
 */
export function generateAvailableSlots(
  date: string,
  duration: number,
  existingBookings: IBooking[],
  workingHours: { start: string; end: string } = DEFAULT_WORKING_HOURS,
  options?: SlotGenerationOptions
): string[] {
  const tz = options?.timezone || 'Africa/Nairobi';
  const bookingRules = options?.bookingRules;
  const holidays = bookingRules?.holidays || [];

  // 1. Check salon holidays
  if (holidays.includes(date)) {
    return [];
  }

  // 1b. Check salon closed weekdays
  const dt = DateTime.fromISO(date, { zone: tz });
  const dayOfWeek = dt.weekday === 7 ? 0 : dt.weekday;
  if (bookingRules?.closedWeekdays && bookingRules.closedWeekdays.includes(dayOfWeek)) {
    return [];
  }

  // 2. Check attendant days off & full-day timeOff
  const attendant = options?.attendant;
  if (attendant?.daysOff && attendant.daysOff.includes(date)) {
    return [];
  }
  if (attendant?.timeOff && attendant.timeOff.some(t => t.date === date && (t.allDay || (!t.startTime && !t.endTime)))) {
    return [];
  }

  let shiftStartStr = workingHours.start || DEFAULT_WORKING_HOURS.start;
  let shiftEndStr = workingHours.end || DEFAULT_WORKING_HOURS.end;
  let breaks: IAttendantBreak[] = [];

  if (attendant?.schedule && attendant.schedule.length > 0) {
    const daySchedule = attendant.schedule.find(s => s.dayOfWeek === dayOfWeek);
    if (!daySchedule || !daySchedule.isWorkingDay) {
      return []; // Attendant not scheduled on this day
    }
    if (daySchedule.start) shiftStartStr = daySchedule.start;
    if (daySchedule.end) shiftEndStr = daySchedule.end;
    if (daySchedule.breaks) breaks = daySchedule.breaks;
  }

  const slotInterval = bookingRules?.slotInterval || 30;
  const bufferMinutes = bookingRules?.bufferMinutes || 0;
  const minNoticeHours = bookingRules?.minNoticeHours !== undefined ? bookingRules.minNoticeHours : 2;

  const now = DateTime.now().setZone(tz);
  const minAllowedDateTime = options?.skipNoticeCheck ? null : now.plus({ hours: minNoticeHours });

  const startOfDay = DateTime.fromISO(`${date}T${shiftStartStr}`, { zone: tz });
  const endOfDay   = DateTime.fromISO(`${date}T${shiftEndStr}`, { zone: tz });
  const workingMinutes = endOfDay.diff(startOfDay, 'minutes').minutes;

  // If service takes longer than the working day: offer start of day if free
  if (duration >= workingMinutes) {
    const dayAlreadyBooked = existingBookings.some(b => b.status !== 'cancelled');
    if (dayAlreadyBooked) return [];
    if (minAllowedDateTime && startOfDay < minAllowedDateTime) return [];
    return [shiftStartStr];
  }

  const salonBreaks = bookingRules?.breaks || [];
  const slots: string[] = [];
  let currentSlot = startOfDay;

  while (currentSlot.plus({ minutes: duration }) <= endOfDay) {
    const slotStart = currentSlot;
    const slotEnd   = currentSlot.plus({ minutes: duration });
    const potentialInterval = Interval.fromDateTimes(slotStart, slotEnd);

    // Minimum notice rule
    if (minAllowedDateTime && slotStart < minAllowedDateTime) {
      currentSlot = currentSlot.plus({ minutes: slotInterval });
      continue;
    }

    // Salon-wide breaks rule
    const overlapsSalonBreak = salonBreaks.some(brk => {
      const brkStart = DateTime.fromISO(`${date}T${brk.start}`, { zone: tz });
      const brkEnd   = DateTime.fromISO(`${date}T${brk.end}`, { zone: tz });
      return potentialInterval.overlaps(Interval.fromDateTimes(brkStart, brkEnd));
    });
    if (overlapsSalonBreak) {
      currentSlot = currentSlot.plus({ minutes: slotInterval });
      continue;
    }

    // Attendant shift breaks rule
    const overlapsBreak = breaks.some(brk => {
      const brkStart = DateTime.fromISO(`${date}T${brk.start}`, { zone: tz });
      const brkEnd   = DateTime.fromISO(`${date}T${brk.end}`, { zone: tz });
      return potentialInterval.overlaps(Interval.fromDateTimes(brkStart, brkEnd));
    });
    if (overlapsBreak) {
      currentSlot = currentSlot.plus({ minutes: slotInterval });
      continue;
    }

    // Attendant partial-day timeOff rule
    const overlapsTimeOff = attendant?.timeOff?.some(t => {
      if (t.date !== date || t.allDay) return false;
      if (t.startTime && t.endTime) {
        const toStart = DateTime.fromISO(`${date}T${t.startTime}`, { zone: tz });
        const toEnd   = DateTime.fromISO(`${date}T${t.endTime}`, { zone: tz });
        return potentialInterval.overlaps(Interval.fromDateTimes(toStart, toEnd));
      }
      return false;
    });
    if (overlapsTimeOff) {
      currentSlot = currentSlot.plus({ minutes: slotInterval });
      continue;
    }

    // Booking & buffer rule
    const isOverlap = existingBookings.some(booking => {
      if (booking.status === 'cancelled') return false;
      if (attendant?._id) {
        const bAttendantId = (booking.attendantId as any)?._id?.toString() || booking.attendantId?.toString();
        if (bAttendantId && bAttendantId !== attendant._id.toString()) return false;
      }

      const bStart = DateTime.fromISO(`${date}T${booking.startTime}`, { zone: tz });
      const bEnd   = DateTime.fromISO(`${date}T${booking.endTime}`, { zone: tz });
      return slotStart < bEnd.plus({ minutes: bufferMinutes }) && slotEnd.plus({ minutes: bufferMinutes }) > bStart;
    });

    if (!isOverlap) {
      slots.push(currentSlot.toFormat('HH:mm'));
    }

    currentSlot = currentSlot.plus({ minutes: slotInterval });
  }

  return slots;
}

/**
 * Calculates available starting times for a multi-service booking sequence.
 * Back-to-back segments: Service 1 ends right as Service 2 begins.
 * Respects per-stylist shifts, breaks, days off, tenant holidays, and buffer time.
 */
export function generateMultiServiceSlots(
  date: string,
  items: MultiServiceItemInput[],
  existingBookings: IBooking[],
  workingHours: { start: string; end: string } = DEFAULT_WORKING_HOURS,
  options?: { bookingRules?: ITenantBookingRules; timezone?: string; skipNoticeCheck?: boolean }
): MultiSlotOption[] {
  if (items.length === 0) return [];

  const tz = options?.timezone || 'Africa/Nairobi';
  const bookingRules = options?.bookingRules;
  const holidays = bookingRules?.holidays || [];

  if (holidays.includes(date)) {
    return [];
  }

  const dt = DateTime.fromISO(date, { zone: tz });
  const dayOfWeek = dt.weekday === 7 ? 0 : dt.weekday;
  if (bookingRules?.closedWeekdays && bookingRules.closedWeekdays.includes(dayOfWeek)) {
    return [];
  }

  const slotInterval = bookingRules?.slotInterval || 30;
  const bufferMinutes = bookingRules?.bufferMinutes || 0;
  const minNoticeHours = bookingRules?.minNoticeHours !== undefined ? bookingRules.minNoticeHours : 2;

  const now = DateTime.now().setZone(tz);
  const minAllowedDateTime = options?.skipNoticeCheck ? null : now.plus({ hours: minNoticeHours });

  const startOfDay = DateTime.fromISO(`${date}T${workingHours.start}`, { zone: tz });
  const endOfDay   = DateTime.fromISO(`${date}T${workingHours.end}`, { zone: tz });
  const totalDuration = items.reduce((sum, item) => sum + item.duration, 0);

  const salonBreaks = bookingRules?.breaks || [];
  const results: MultiSlotOption[] = [];
  let currentStart = startOfDay;

  while (currentStart.plus({ minutes: totalDuration }) <= endOfDay) {
    if (minAllowedDateTime && currentStart < minAllowedDateTime) {
      currentStart = currentStart.plus({ minutes: slotInterval });
      continue;
    }

    // Salon-wide breaks check
    const appointmentInterval = Interval.fromDateTimes(currentStart, currentStart.plus({ minutes: totalDuration }));
    const overlapsSalonBreak = salonBreaks.some(brk => {
      const brkStart = DateTime.fromISO(`${date}T${brk.start}`, { zone: tz });
      const brkEnd   = DateTime.fromISO(`${date}T${brk.end}`, { zone: tz });
      return appointmentInterval.overlaps(Interval.fromDateTimes(brkStart, brkEnd));
    });
    if (overlapsSalonBreak) {
      currentStart = currentStart.plus({ minutes: slotInterval });
      continue;
    }

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
        // Specific attendant requested
        const reqAttendant = item.qualifiedAttendants.find(
          a => a._id.toString() === item.requestedAttendantId!.toString()
        );
        if (reqAttendant && isAttendantFree(reqAttendant, segInterval, date, existingBookings, bufferMinutes, tz, workingHours)) {
          chosenAttendant = reqAttendant;
        }
      } else {
        // "Any Available" — prioritize previous segment's attendant for continuity
        const prevAttendantId = resolvedSegments[i - 1]?.attendantId;
        const matchingPrev = prevAttendantId
          ? item.qualifiedAttendants.find(a => a._id.toString() === prevAttendantId)
          : null;

        if (matchingPrev && isAttendantFree(matchingPrev, segInterval, date, existingBookings, bufferMinutes, tz, workingHours)) {
          chosenAttendant = matchingPrev;
        } else {
          const freeAttendants = item.qualifiedAttendants.filter(
            a => isAttendantFree(a, segInterval, date, existingBookings, bufferMinutes, tz, workingHours)
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

    currentStart = currentStart.plus({ minutes: slotInterval });
  }

  return results;
}
