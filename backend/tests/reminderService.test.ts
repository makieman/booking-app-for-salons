import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { isWithinReminderWindow, tomorrowKey } from '../services/reminderService';

describe('Reminder timing helpers', () => {
  const at = (iso: string, zone: string) => DateTime.fromISO(iso, { zone });

  it('only sends during daytime: 08:00 up to (not including) 20:00', () => {
    assert.equal(isWithinReminderWindow(at('2026-03-10T07:59:00', 'Africa/Nairobi')), false);
    assert.equal(isWithinReminderWindow(at('2026-03-10T08:00:00', 'Africa/Nairobi')), true);
    assert.equal(isWithinReminderWindow(at('2026-03-10T19:59:00', 'Africa/Nairobi')), true);
    assert.equal(isWithinReminderWindow(at('2026-03-10T20:00:00', 'Africa/Nairobi')), false);
    assert.equal(isWithinReminderWindow(at('2026-03-10T03:00:00', 'Africa/Nairobi')), false);
  });

  it("works out 'tomorrow' in the salon's own timezone, not the server's", () => {
    // 22:30 UTC on the 10th is already 01:30 on the 11th in Nairobi (UTC+3).
    const utc = DateTime.fromISO('2026-03-10T22:30:00Z', { zone: 'utc' });
    assert.equal(tomorrowKey(utc), '2026-03-11');
    assert.equal(tomorrowKey(utc.setZone('Africa/Nairobi')), '2026-03-12');
  });

  it('rolls over month and year ends correctly', () => {
    assert.equal(tomorrowKey(at('2026-01-31T10:00:00', 'Africa/Nairobi')), '2026-02-01');
    assert.equal(tomorrowKey(at('2026-12-31T10:00:00', 'Africa/Nairobi')), '2027-01-01');
  });
});
