import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toGsmSafe,
  smsSegments,
  buildSmsMessage,
  sendSms,
  createAfricasTalkingProvider,
  type SmsDeps,
  type SmsLogEntry,
  type SmsProvider,
  type SmsStore,
} from '../services/smsService';

const booking = {
  customerName: 'Wanjiru Kamau',
  phone: '0712345678',
  date: '2026-11-03',
  startTime: '14:30',
  reference: 'FLO-ABC123',
};

function memoryStore(sentCounts: { tenant?: number; phone?: number } = {}) {
  const log: SmsLogEntry[] = [];
  const store: SmsStore = {
    async countSent(_t, _since, to) {
      return to ? sentCounts.phone ?? 0 : sentCounts.tenant ?? 0;
    },
    async record(e) {
      log.push(e);
    },
  };
  return { store, log };
}

function fakeProvider(ok = true) {
  const sent: Array<{ to: string; message: string }> = [];
  const provider: SmsProvider = {
    name: 'fake',
    async send(to, message) {
      sent.push({ to, message });
      return ok ? { ok: true, providerMessageId: 'm1', cost: 'KES 0.8000' } : { ok: false, error: 'boom' };
    },
  };
  return { provider, sent };
}

const limits = { perPhonePerDay: 8, perTenantPerDay: 300 };

describe('SMS text helpers', () => {
  it('replaces curly quotes and emoji so messages stay in the 160-char encoding', () => {
    assert.equal(toGsmSafe('It\u2019s ready \u{1F485} \u2013 see you\u2026'), "It's ready - see you...");
  });

  it('keeps the base letter of accented characters', () => {
    assert.equal(toGsmSafe('Caf\u00E9 \u00D4'), 'Caf\u00E9 O');
  });

  it('counts segments: 160 is one, 161 is two, extended characters count double', () => {
    assert.equal(smsSegments('a'.repeat(160)), 1);
    assert.equal(smsSegments('a'.repeat(161)), 2);
    assert.equal(smsSegments('a'.repeat(306)), 2);
    assert.equal(smsSegments('a'.repeat(307)), 3);
    assert.equal(smsSegments('['.repeat(81)), 2); // 81 x 2 = 162 units
    assert.equal(smsSegments(''), 0);
  });
});

describe('SMS message builders', () => {
  const ctx = { tenantName: 'Flo Sisterlocks', booking, serviceName: 'Sisterlocks Retightening' };

  it('every message starts with the salon name (no sender ID)', () => {
    for (const kind of [
      'booking_received',
      'booking_confirmed',
      'booking_cancelled',
      'booking_rescheduled',
      'appointment_reminder',
    ] as const) {
      assert.ok(buildSmsMessage(kind, ctx).startsWith('Flo Sisterlocks: '), kind);
    }
  });

  it('confirmation includes first name, date, time and reference, and fits one segment', () => {
    const msg = buildSmsMessage('booking_confirmed', { ...ctx, attendantName: 'Mary' });
    assert.match(msg, /Hi Wanjiru/);
    assert.match(msg, /Tue 3 Nov at 2:30 PM/);
    assert.match(msg, /FLO-ABC123/);
    assert.match(msg, /with Mary/);
    assert.equal(smsSegments(msg), 1);
  });

  it('cancellation includes the reason when given', () => {
    const msg = buildSmsMessage('booking_cancelled', { ...ctx, reason: 'Stylist unwell' });
    assert.match(msg, /Reason: Stylist unwell\./);
  });

  it('reminder includes support phone when available', () => {
    const msg = buildSmsMessage('appointment_reminder', { ...ctx, supportPhone: '0700111222' });
    assert.match(msg, /tomorrow at 2:30 PM/);
    assert.match(msg, /Call 0700111222/);
  });

  it('long salon, service and name values are clipped so the SMS stays short', () => {
    const msg = buildSmsMessage('booking_confirmed', {
      tenantName: 'A Very Long Salon Name That Goes On And On Forever',
      booking: { ...booking, customerName: 'Bartholomew-Maximilian Oluwaseun' },
      serviceName: 'Full head sisterlocks installation with deep conditioning treatment and scalp massage',
      attendantName: 'Elizabeth-Catherine Wambui',
    });
    assert.ok(smsSegments(msg) <= 2, `got ${smsSegments(msg)} segments`);
  });
});

describe('sendSms', () => {
  it('does nothing when no provider is configured', async () => {
    const { store, log } = memoryStore();
    const res = await sendSms({ tenantId: 't1', to: '0712345678', message: 'Hi', type: 'test' }, { provider: null, store, limits });
    assert.deepEqual(res, { sent: false, reason: 'not_configured' });
    assert.equal(log.length, 0);
  });

  it('normalizes the phone number, sends, and logs success', async () => {
    const { provider, sent } = fakeProvider();
    const { store, log } = memoryStore();
    const res = await sendSms({ tenantId: 't1', to: '0712345678', message: 'Hello', type: 'booking_confirmed', reference: 'R1' }, { provider, store, limits });
    assert.equal(res.sent, true);
    assert.equal(sent[0].to, '+254712345678');
    assert.equal(log[0].status, 'sent');
    assert.equal(log[0].cost, 'KES 0.8000');
  });

  it('rejects invalid phone numbers without calling the provider', async () => {
    const { provider, sent } = fakeProvider();
    const { store, log } = memoryStore();
    const res = await sendSms({ tenantId: 't1', to: 'abc', message: 'Hello', type: 'test' }, { provider, store, limits });
    assert.equal(res.reason, 'invalid_phone');
    assert.equal(sent.length, 0);
    assert.equal(log[0].status, 'skipped');
  });

  it('stops at the per-phone daily limit', async () => {
    const { provider, sent } = fakeProvider();
    const { store, log } = memoryStore({ phone: 8 });
    const res = await sendSms({ tenantId: 't1', to: '0712345678', message: 'Hello', type: 'test' }, { provider, store, limits });
    assert.equal(res.reason, 'phone_limit');
    assert.equal(sent.length, 0);
    assert.equal(log[0].status, 'skipped');
  });

  it('stops at the per-salon daily limit', async () => {
    const { provider, sent } = fakeProvider();
    const { store } = memoryStore({ tenant: 300 });
    const res = await sendSms({ tenantId: 't1', to: '0712345678', message: 'Hello', type: 'test' }, { provider, store, limits });
    assert.equal(res.reason, 'tenant_limit');
    assert.equal(sent.length, 0);
  });

  it('reports provider failures and logs them as failed, never throws', async () => {
    const { provider } = fakeProvider(false);
    const { store, log } = memoryStore();
    const res = await sendSms({ tenantId: 't1', to: '0712345678', message: 'Hello', type: 'test' }, { provider, store, limits });
    assert.equal(res.sent, false);
    assert.equal(res.reason, 'provider_error');
    assert.equal(log[0].status, 'failed');
  });

  it('still sends when the log store is down', async () => {
    const { provider, sent } = fakeProvider();
    const store: SmsStore = {
      async countSent() {
        throw new Error('db down');
      },
      async record() {
        throw new Error('db down');
      },
    };
    const deps: SmsDeps = { provider, store, limits };
    const res = await sendSms({ tenantId: 't1', to: '0712345678', message: 'Hello', type: 'test' }, deps);
    assert.equal(res.sent, true);
    assert.equal(sent.length, 1);
  });
});

describe("Africa's Talking adapter", () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  const okBody = {
    SMSMessageData: {
      Message: 'Sent to 1/1 Total Cost: KES 0.8000',
      Recipients: [{ number: '+254712345678', status: 'Success', statusCode: 101, messageId: 'ATXid_1', cost: 'KES 0.8000' }],
    },
  };

  it('sends form-encoded request with apiKey header and NO `from` when no sender ID is set', async () => {
    const { impl, calls } = fakeFetch(201, okBody);
    const p = createAfricasTalkingProvider({ username: 'myapp', apiKey: 'KEY', fetchImpl: impl });
    const res = await p.send('+254712345678', 'Hello');
    assert.equal(res.ok, true);
    assert.equal(res.providerMessageId, 'ATXid_1');
    assert.equal(calls[0].url, 'https://api.africastalking.com/version1/messaging');
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.apiKey, 'KEY');
    const body = new URLSearchParams(String(calls[0].init.body));
    assert.equal(body.get('username'), 'myapp');
    assert.equal(body.get('to'), '+254712345678');
    assert.equal(body.get('message'), 'Hello');
    assert.equal(body.has('from'), false);
  });

  it('includes `from` once a sender ID is configured', async () => {
    const { impl, calls } = fakeFetch(201, okBody);
    const p = createAfricasTalkingProvider({ username: 'myapp', apiKey: 'KEY', senderId: 'FLOSALON', fetchImpl: impl });
    await p.send('+254712345678', 'Hello');
    assert.equal(new URLSearchParams(String(calls[0].init.body)).get('from'), 'FLOSALON');
  });

  it('uses the sandbox URL for username "sandbox"', async () => {
    const { impl, calls } = fakeFetch(201, okBody);
    const p = createAfricasTalkingProvider({ username: 'sandbox', apiKey: 'KEY', fetchImpl: impl });
    await p.send('+254712345678', 'Hello');
    assert.equal(calls[0].url, 'https://api.sandbox.africastalking.com/version1/messaging');
  });

  it('treats a rejected recipient as a failure', async () => {
    const { impl } = fakeFetch(201, {
      SMSMessageData: { Message: 'Sent to 0/1', Recipients: [{ number: '+254712345678', status: 'InvalidPhoneNumber', statusCode: 403 }] },
    });
    const p = createAfricasTalkingProvider({ username: 'myapp', apiKey: 'KEY', fetchImpl: impl });
    const res = await p.send('+254712345678', 'Hello');
    assert.equal(res.ok, false);
    assert.match(res.error!, /InvalidPhoneNumber/);
  });

  it('treats HTTP errors and non-JSON responses as failures', async () => {
    const { impl } = fakeFetch(401, 'The supplied authentication is invalid');
    const p = createAfricasTalkingProvider({ username: 'myapp', apiKey: 'BAD', fetchImpl: impl });
    const res = await p.send('+254712345678', 'Hello');
    assert.equal(res.ok, false);
    assert.match(res.error!, /HTTP 401/);
  });

  it('turns network errors into a failed result instead of throwing', async () => {
    const impl = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const p = createAfricasTalkingProvider({ username: 'myapp', apiKey: 'KEY', fetchImpl: impl });
    const res = await p.send('+254712345678', 'Hello');
    assert.deepEqual(res, { ok: false, error: 'socket hang up' });
  });
});
