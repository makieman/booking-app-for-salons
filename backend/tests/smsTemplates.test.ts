import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmsMessage, smsSegments } from '../services/smsService';

const booking = {
  customerName: 'Wanjiru Kamau',
  phone: '0712345678',
  date: '2026-11-03',
  startTime: '14:30',
  reference: 'FLO-ABC123',
};

const ctx = {
  tenantName: 'Flo Sisterlocks',
  booking,
  serviceName: 'Retightening',
  attendantName: 'Flora',
  supportPhone: '0721530120',
};

const kinds = [
  'booking_received',
  'booking_confirmed',
  'booking_cancelled',
  'booking_rescheduled',
  'appointment_reminder',
] as const;

describe('Warm SMS templates', () => {
  it('every typical message fits ONE segment, so it costs exactly one credit', () => {
    for (const kind of kinds) {
      const msg = buildSmsMessage(kind, ctx);
      assert.equal(smsSegments(msg), 1, `${kind} is ${msg.length} chars: ${msg}`);
    }
  });

  it('never uses characters that force the expensive 70-character encoding', () => {
    for (const kind of kinds) {
      const msg = buildSmsMessage(kind, { ...ctx, reason: 'Stylist unwell' });
      assert.match(msg, /^[\x20-\x7E]+$/, `${kind}: ${msg}`);
    }
  });

  it('confirmation is warm and keeps the key facts', () => {
    const msg = buildSmsMessage('booking_confirmed', ctx);
    assert.match(msg, /^Flo Sisterlocks: Hi Wanjiru, you're booked!/);
    assert.match(msg, /Tue 3 Nov at 2:30 PM/);
    assert.match(msg, /Retightening with Flora/);
    assert.match(msg, /Ref FLO-ABC123/);
    assert.match(msg, /We can't wait to pamper you!/);
  });

  it('reminder is friendly, says tomorrow, and offers the support number', () => {
    const msg = buildSmsMessage('appointment_reminder', ctx);
    assert.match(msg, /friendly reminder/);
    assert.match(msg, /looking forward to seeing you tomorrow at 2:30 PM/);
    assert.match(msg, /Call 0721530120/);
  });

  it('received message thanks the customer and promises a confirmation', () => {
    const msg = buildSmsMessage('booking_received', ctx);
    assert.match(msg, /thanks for choosing us/i);
    assert.match(msg, /confirm/i);
  });

  it('cancellation is apologetic and keeps the reason', () => {
    const msg = buildSmsMessage('booking_cancelled', { ...ctx, reason: 'Stylist unwell' });
    assert.match(msg, /we're sorry/);
    assert.match(msg, /Reason: Stylist unwell\./);
  });

  it('drops the warm closing line before it would spill into a second segment', () => {
    const msg = buildSmsMessage('booking_confirmed', {
      ...ctx,
      serviceName: 'Sisterlocks Installation And Deep Conditioning Treatment',
    });
    assert.equal(smsSegments(msg), 1, msg);
    assert.doesNotMatch(msg, /pamper/);
    assert.match(msg, /with Flora/);
  });

  it('drops the stylist name next if it still would not fit', () => {
    const msg = buildSmsMessage('booking_confirmed', {
      tenantName: 'A Very Long Salon Name That Goes On And On',
      booking: { ...booking, customerName: 'Bartholomew-Maximilian' },
      serviceName: 'Full head sisterlocks installation with deep conditioning treatment',
      attendantName: 'Elizabeth-Catherine Wambui',
    });
    assert.equal(smsSegments(msg), 1, msg);
    assert.doesNotMatch(msg, /with Elizabeth/);
  });
});
