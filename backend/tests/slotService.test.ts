import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime, Interval } from 'luxon';
import mongoose from 'mongoose';
import {
  generateAvailableSlots,
  generateMultiServiceSlots,
  isAttendantFree,
  DEFAULT_WORKING_HOURS,
} from '../services/slotService';
import Service from '../models/Service';
import Booking from '../models/Booking';
import Attendant from '../models/Attendant';
import { createBooking } from '../controllers/bookingController';
import { createAdminBooking } from '../controllers/adminController';

function createMockReqRes(body: any, tenant: any) {
  const req: any = {
    body,
    tenant,
    query: {},
    params: {},
  };
  let statusCode = 200;
  let responseData: any = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
  };
  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe('slotService & enforcement tests', () => {
  const sampleTenant = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Test Salon',
    timezone: 'Africa/Nairobi',
    workingHours: { start: '09:00', end: '18:00' },
    bookingRules: {
      slotInterval: 30,
      bufferMinutes: 0,
      minNoticeHours: 0,
      holidays: [],
      closedWeekdays: [],
      breaks: [],
    },
  };

  const sampleAttendantId = new mongoose.Types.ObjectId();
  const sampleAttendant = {
    _id: sampleAttendantId,
    name: 'Jane Stylist',
    schedule: [
      { dayOfWeek: 2, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [] },
    ],
    daysOff: [] as string[],
    timeOff: [] as any[],
  };

  // 2026-10-20 is a Tuesday (Luxon weekday = 2)
  const testDate = '2026-10-20';

  it('1. 10-hour service: flag off rejects ending after shift end, flag on allows exceeding closing time up to 24:00', () => {
    const tz = 'Africa/Nairobi';
    // 09:00 to 19:00 is 10 hours (600 mins). Working hours are 09:00-18:00.
    const startDt = DateTime.fromISO(`${testDate}T09:00`, { zone: tz });
    const endDt = DateTime.fromISO(`${testDate}T19:00`, { zone: tz });
    const interval = Interval.fromDateTimes(startDt, endDt);

    // Flag OFF: isAttendantFree returns false because end 19:00 > shiftEnd 18:00
    const freeWithFlagOff = isAttendantFree(
      sampleAttendant,
      interval,
      testDate,
      [],
      0,
      tz,
      sampleTenant.workingHours,
      { canExceedClosingTime: false }
    );
    assert.equal(freeWithFlagOff, false, 'Should be rejected when canExceedClosingTime is false');

    // Flag ON: isAttendantFree returns true because 19:00 is allowed after shift end and before 24:00
    const freeWithFlagOn = isAttendantFree(
      sampleAttendant,
      interval,
      testDate,
      [],
      0,
      tz,
      sampleTenant.workingHours,
      { canExceedClosingTime: true }
    );
    assert.equal(freeWithFlagOn, true, 'Should be free when canExceedClosingTime is true');

    // In generateAvailableSlots: 08:00-18:00 working hours with latestStartTime: '09:00'
    const slots = generateAvailableSlots(
      testDate,
      600,
      [],
      { start: '08:00', end: '18:00' },
      {
        bookingRules: { slotInterval: 30, minNoticeHours: 0, bufferMinutes: 0 },
        canExceedClosingTime: true,
        latestStartTime: '09:00',
        skipNoticeCheck: true,
      }
    );
    assert.deepEqual(slots, ['08:00', '08:30', '09:00'], 'Offers 08:00-09:00 starts when flag allows it');
  });

  it('2. latestStartTime enforces cutoff start time', () => {
    // 10-hour service (600 mins) with latestStartTime 10:00
    const slots = generateAvailableSlots(
      testDate,
      600,
      [],
      { start: '09:00', end: '18:00' },
      {
        bookingRules: { slotInterval: 30, minNoticeHours: 0, bufferMinutes: 0 },
        canExceedClosingTime: true,
        latestStartTime: '10:00',
        skipNoticeCheck: true,
      }
    );

    assert.ok(slots.includes('09:00'), 'Includes 09:00');
    assert.ok(slots.includes('09:30'), 'Includes 09:30');
    assert.ok(slots.includes('10:00'), 'Includes 10:00');
    assert.ok(!slots.includes('10:30'), 'Excludes slots after latestStartTime 10:00');
    assert.ok(!slots.includes('11:00'), 'Excludes slots after latestStartTime 10:00');
  });

  it('3. end-after-midnight rejected', () => {
    const tz = 'Africa/Nairobi';
    // Starts at 16:00, 10 hours duration ends at 02:00 next day (after midnight)
    const startDt = DateTime.fromISO(`${testDate}T16:00`, { zone: tz });
    const endDt = DateTime.fromISO(`${testDate}T16:00`, { zone: tz }).plus({ minutes: 600 });
    const interval = Interval.fromDateTimes(startDt, endDt);

    const isFree = isAttendantFree(
      sampleAttendant,
      interval,
      testDate,
      [],
      0,
      tz,
      sampleTenant.workingHours,
      { canExceedClosingTime: true }
    );
    assert.equal(isFree, false, 'Service ending after midnight must be rejected');

    // In generateAvailableSlots, slots that would end after midnight are not offered
    const slots = generateAvailableSlots(
      testDate,
      600,
      [],
      { start: '09:00', end: '22:00' },
      {
        bookingRules: { slotInterval: 60, minNoticeHours: 0, bufferMinutes: 0 },
        canExceedClosingTime: true,
        skipNoticeCheck: true,
      }
    );
    // At 14:00 + 600m = 24:00 (allowed). At 15:00 + 600m = 01:00 next day (rejected!).
    assert.ok(!slots.includes('15:00'), '15:00 ending at 01:00 next day must be rejected');
    assert.ok(!slots.includes('16:00'), '16:00 ending at 02:00 next day must be rejected');
  });

  it('4. stylist blocked for whole duration while another stylist is still offered', () => {
    const attendantA = {
      _id: 'attendant-A',
      name: 'Stylist A',
      schedule: [{ dayOfWeek: 2, isWorkingDay: true, start: '09:00', end: '19:00', breaks: [] }],
      daysOff: [],
      timeOff: [],
    };
    const attendantB = {
      _id: 'attendant-B',
      name: 'Stylist B',
      schedule: [{ dayOfWeek: 2, isWorkingDay: true, start: '09:00', end: '19:00', breaks: [] }],
      daysOff: [],
      timeOff: [],
    };

    // Existing 10-hour booking for Attendant A from 09:00 to 19:00
    const existingBookings: any[] = [
      {
        attendantId: 'attendant-A',
        date: testDate,
        startTime: '09:00',
        endTime: '19:00',
        bufferMinutes: 0,
        status: 'confirmed',
      },
    ];

    // Check at 14:00-15:00 (in the middle of the 10-hour booking)
    const tz = 'Africa/Nairobi';
    const interval14to15 = Interval.fromDateTimes(
      DateTime.fromISO(`${testDate}T14:00`, { zone: tz }),
      DateTime.fromISO(`${testDate}T15:00`, { zone: tz })
    );

    const isAFree = isAttendantFree(attendantA, interval14to15, testDate, existingBookings, 0, tz);
    const isBFree = isAttendantFree(attendantB, interval14to15, testDate, existingBookings, 0, tz);

    assert.equal(isAFree, false, 'Attendant A must be blocked during the 10-hour service');
    assert.equal(isBFree, true, 'Attendant B must still be free');

    // In multi-service slot resolution at 14:00, Attendant B is chosen
    const multiSlots = generateMultiServiceSlots(
      testDate,
      [
        {
          serviceId: 'svc-1',
          duration: 60,
          qualifiedAttendants: [attendantA, attendantB],
        },
      ],
      existingBookings,
      { start: '09:00', end: '19:00' },
      { skipNoticeCheck: true }
    );

    const slot14 = multiSlots.find(s => s.time === '14:00');
    assert.ok(slot14, 'Slot at 14:00 should be offered');
    assert.equal(slot14.segments[0].attendantId, 'attendant-B', 'Attendant B should be assigned');
  });

  it('5. service buffer blocks the next slot', () => {
    // Existing booking 10:00 to 11:00 with 30 min buffer
    const existingBookings: any[] = [
      {
        attendantId: sampleAttendant._id,
        date: testDate,
        startTime: '10:00',
        endTime: '11:00',
        bufferMinutes: 30, // holds until 11:30
        status: 'confirmed',
      },
    ];

    const slots = generateAvailableSlots(
      testDate,
      30,
      existingBookings,
      { start: '09:00', end: '13:00' },
      {
        bookingRules: { slotInterval: 30, minNoticeHours: 0, bufferMinutes: 0 },
        attendant: sampleAttendant,
        skipNoticeCheck: true,
      }
    );

    assert.ok(slots.includes('09:30'), '09:30 should be available');
    assert.ok(!slots.includes('10:00'), '10:00 is occupied');
    assert.ok(!slots.includes('10:30'), '10:30 is occupied');
    assert.ok(!slots.includes('11:00'), '11:00 is blocked by 30-min buffer of previous service');
    assert.ok(slots.includes('11:30'), '11:30 is available after buffer ends');
  });

  it('6. time off, break, and holiday rejected by createBooking logic', async () => {
    const origFindOneService = Service.findOne;
    const origFindOneAttendant = Attendant.findOne;
    const origFindBooking = Booking.find;
    const origFindOneBooking = Booking.findOne;
    const origSaveBooking = Booking.prototype.save;

    try {
      // Stub Mongoose models
      (Service.findOne as any) = async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: 'Braids',
        duration: 60,
        price: 3000,
        bufferAfterMinutes: 15,
        canExceedClosingTime: false,
      });

      (Booking.findOne as any) = async () => null; // for reference uniqueness
      (Booking.find as any) = async () => [];
      (Booking.countDocuments as any) = async () => 0;
      (Booking.prototype.save as any) = async function(this: any) { return this; };

      // Case A: Salon Holiday
      {
        const tenantWithHoliday = {
          ...sampleTenant,
          bookingRules: {
            ...sampleTenant.bookingRules,
            holidays: ['2026-12-25'],
          },
        };
        const { req, res, getStatus, getData } = createMockReqRes(
          {
            customerName: 'Alice',
            phone: '+254712345678',
            serviceId: 'svc-1',
            date: '2026-12-25',
            startTime: '10:00',
          },
          tenantWithHoliday
        );

        await createBooking(req, res);
        assert.equal(getStatus(), 400, 'Holiday should return status 400');
        assert.match(getData().error, /holiday/i);
      }

      // Case B: Salon Break
      {
        const tenantWithBreak = {
          ...sampleTenant,
          bookingRules: {
            ...sampleTenant.bookingRules,
            breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }],
          },
        };
        const { req, res, getStatus, getData } = createMockReqRes(
          {
            customerName: 'Alice',
            phone: '+254712345678',
            serviceId: 'svc-1',
            date: testDate,
            startTime: '13:00', // overlaps lunch break 13:00-14:00
          },
          tenantWithBreak
        );

        await createBooking(req, res);
        assert.equal(getStatus(), 400, 'Salon break should return status 400');
        assert.match(getData().error, /break/i);
      }

      // Case C: Stylist Time Off
      {
        (Attendant.findOne as any) = async () => ({
          _id: new mongoose.Types.ObjectId(sampleAttendant._id),
          name: 'Jane Stylist',
          schedule: sampleAttendant.schedule,
          daysOff: [],
          timeOff: [{ date: testDate, allDay: false, startTime: '10:00', endTime: '12:00' }],
        });

        const { req, res, getStatus, getData } = createMockReqRes(
          {
            customerName: 'Alice',
            phone: '+254712345678',
            serviceId: 'svc-1',
            attendantId: sampleAttendant._id,
            date: testDate,
            startTime: '10:30', // overlaps stylist timeOff 10:00-12:00
          },
          sampleTenant
        );

        await createBooking(req, res);
        assert.equal(getStatus(), 400, 'Attendant timeOff should return status 400');
        assert.match(getData().error, /unavailable/i);
      }
    } finally {
      Service.findOne = origFindOneService;
      Attendant.findOne = origFindOneAttendant;
      Booking.find = origFindBooking;
      Booking.findOne = origFindOneBooking;
      Booking.prototype.save = origSaveBooking;
    }
  });

  it('7. cancelled booking frees the slot', () => {
    // Existing booking marked as cancelled
    const bookingsWithCancelled: any[] = [
      {
        attendantId: sampleAttendant._id,
        date: testDate,
        startTime: '10:00',
        endTime: '11:00',
        bufferMinutes: 0,
        status: 'cancelled',
      },
    ];

    const slots = generateAvailableSlots(
      testDate,
      60,
      bookingsWithCancelled,
      { start: '09:00', end: '13:00' },
      {
        bookingRules: { slotInterval: 60, minNoticeHours: 0, bufferMinutes: 0 },
        attendant: sampleAttendant,
        skipNoticeCheck: true,
      }
    );

    assert.ok(slots.includes('10:00'), 'Cancelled booking must free the 10:00 slot');
  });

  it('8. pending booking blocks an admin walk-in', async () => {
    const origFindOneService = Service.findOne;
    const origFindOneAttendant = Attendant.findOne;
    const origFindBooking = Booking.find;
    const origFindOneBooking = Booking.findOne;
    const origSaveBooking = Booking.prototype.save;
    const origPopulateBooking = Booking.prototype.populate;

    try {
      (Service.findOne as any) = async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: 'Haircut',
        duration: 60,
        price: 2000,
        bufferAfterMinutes: 0,
      });

      const attendantId = new mongoose.Types.ObjectId();
      (Attendant.findOne as any) = async () => ({
        _id: attendantId,
        name: 'Jane Stylist',
      });

      // Existing booking with status 'pending'
      (Booking.find as any) = async () => [
        {
          attendantId,
          date: testDate,
          startTime: '10:00',
          endTime: '11:00',
          bufferMinutes: 0,
          status: 'pending',
        },
      ];

      (Booking.findOne as any) = async () => null;
      (Booking.prototype.save as any) = async function(this: any) { return this; };
      (Booking.prototype.populate as any) = async function(this: any) { return this; };

      const { req, res, getStatus, getData } = createMockReqRes(
        {
          customerName: 'Walk-in Client',
          phone: '+254700000000',
          serviceId: 'svc-1',
          attendantId: attendantId.toString(),
          date: testDate,
          startTime: '10:00',
          status: 'confirmed',
        },
        sampleTenant
      );

      await createAdminBooking(req, res);
      assert.equal(getStatus(), 409, 'Pending booking must block admin walk-in and return 409 Conflict');
      assert.match(getData().error, /Conflict/i);
    } finally {
      Service.findOne = origFindOneService;
      Attendant.findOne = origFindOneAttendant;
      Booking.find = origFindBooking;
      Booking.findOne = origFindOneBooking;
      Booking.prototype.save = origSaveBooking;
      Booking.prototype.populate = origPopulateBooking;
    }
  });
});
