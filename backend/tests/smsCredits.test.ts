import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendSms, type SmsDeps, type SmsLogEntry, type SmsProvider, type SmsStore } from '../services/smsService';
import type { SmsCredits } from '../services/smsCreditService';
import { requirePlatformAdmin } from '../middleware/platformAuth';

const limits = { perPhonePerDay: 100, perTenantPerDay: 1000 };

function memoryStore() {
  const log: SmsLogEntry[] = [];
  const store: SmsStore = {
    async countSent() {
      return 0;
    },
    async record(e) {
      log.push(e);
    },
  };
  return { store, log };
}

function fakeProvider(ok = true) {
  const sent: string[] = [];
  const provider: SmsProvider = {
    name: 'fake',
    async send(_to, message) {
      sent.push(message);
      return ok ? { ok: true, providerMessageId: 'm1', cost: 'KES 0.8000' } : { ok: false, error: 'boom' };
    },
  };
  return { provider, sent };
}

/** In-memory credits with the same guarantee as the Mongo version: check-and-take is one step. */
function fakeCredits(initial: number) {
  let balance = initial;
  const calls = { reserve: [] as number[], refund: [] as number[] };
  const credits: SmsCredits = {
    async reserve(_tenantId, units) {
      calls.reserve.push(units);
      if (balance < units) return false;
      balance -= units;
      return true;
    },
    async refund(_tenantId, units) {
      calls.refund.push(units);
      balance += units;
    },
  };
  return { credits, calls, balance: () => balance };
}

const opts = { tenantId: 't1', to: '0712345678', message: 'Hello', type: 'booking_confirmed' as const, reference: 'R1' };

describe('SMS credits metering', () => {
  it('takes one credit before sending a normal message', async () => {
    const { provider, sent } = fakeProvider();
    const { store } = memoryStore();
    const c = fakeCredits(5);
    const res = await sendSms(opts, { provider, store, limits, credits: c.credits });
    assert.equal(res.sent, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(c.calls.reserve, [1]);
    assert.equal(c.balance(), 4);
    assert.equal(c.calls.refund.length, 0);
  });

  it('charges one credit per segment for a long message', async () => {
    const { provider } = fakeProvider();
    const { store } = memoryStore();
    const c = fakeCredits(5);
    await sendSms({ ...opts, message: 'a'.repeat(200) }, { provider, store, limits, credits: c.credits });
    assert.deepEqual(c.calls.reserve, [2]);
    assert.equal(c.balance(), 3);
  });

  it('skips and never calls the provider when credits are exhausted', async () => {
    const { provider, sent } = fakeProvider();
    const { store, log } = memoryStore();
    const c = fakeCredits(0);
    const res = await sendSms(opts, { provider, store, limits, credits: c.credits });
    assert.equal(res.sent, false);
    assert.equal(res.reason, 'insufficient_credits');
    assert.equal(sent.length, 0);
    assert.equal(log[0].status, 'skipped');
    assert.equal(log[0].error, 'insufficient_credits');
  });

  it('gives the credit back when the provider fails to send', async () => {
    const { provider } = fakeProvider(false);
    const { store, log } = memoryStore();
    const c = fakeCredits(3);
    const res = await sendSms(opts, { provider, store, limits, credits: c.credits });
    assert.equal(res.reason, 'provider_error');
    assert.deepEqual(c.calls.refund, [1]);
    assert.equal(c.balance(), 3);
    assert.equal(log[0].status, 'failed');
  });

  it('does not send when the credit check itself fails (never gives away free SMS)', async () => {
    const { provider, sent } = fakeProvider();
    const { store } = memoryStore();
    const credits: SmsCredits = {
      async reserve() {
        throw new Error('db down');
      },
      async refund() {},
    };
    const res = await sendSms(opts, { provider, store, limits, credits });
    assert.equal(res.sent, false);
    assert.equal(res.reason, 'insufficient_credits');
    assert.equal(sent.length, 0);
  });

  it('simultaneous bookings can never spend more credits than the salon has', async () => {
    const { provider, sent } = fakeProvider();
    const { store } = memoryStore();
    const c = fakeCredits(3);
    const deps: SmsDeps = { provider, store, limits, credits: c.credits };
    const results = await Promise.all(Array.from({ length: 8 }, () => sendSms(opts, deps)));
    assert.equal(results.filter((r) => r.sent).length, 3);
    assert.equal(sent.length, 3);
    assert.equal(c.balance(), 0);
  });

  it('is unmetered when no credit meter is supplied', async () => {
    const { provider, sent } = fakeProvider();
    const { store } = memoryStore();
    const res = await sendSms(opts, { provider, store, limits });
    assert.equal(res.sent, true);
    assert.equal(sent.length, 1);
  });
});

describe('Platform admin guard', () => {
  const GOOD_KEY = 'a'.repeat(32);

  function run(configuredKey: string | undefined, suppliedKey?: string) {
    const previous = process.env.PLATFORM_ADMIN_KEY;
    if (configuredKey === undefined) delete process.env.PLATFORM_ADMIN_KEY;
    else process.env.PLATFORM_ADMIN_KEY = configuredKey;

    let status = 0;
    let nextCalled = false;
    const req = {
      header: (name: string) => (name.toLowerCase() === 'x-platform-admin-key' ? suppliedKey : undefined),
    } as any;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    } as any;

    try {
      requirePlatformAdmin(req, res, () => {
        nextCalled = true;
      });
    } finally {
      if (previous === undefined) delete process.env.PLATFORM_ADMIN_KEY;
      else process.env.PLATFORM_ADMIN_KEY = previous;
    }
    return { status, nextCalled };
  }

  it('is disabled (503) when no key is configured', () => {
    assert.deepEqual(run(undefined, GOOD_KEY), { status: 503, nextCalled: false });
  });

  it('is disabled (503) when the configured key is too short to be safe', () => {
    assert.deepEqual(run('short', 'short'), { status: 503, nextCalled: false });
  });

  it('rejects a missing key with 401', () => {
    assert.deepEqual(run(GOOD_KEY, undefined), { status: 401, nextCalled: false });
  });

  it('rejects a wrong key with 401', () => {
    assert.deepEqual(run(GOOD_KEY, 'b'.repeat(32)), { status: 401, nextCalled: false });
  });

  it('accepts the correct key', () => {
    assert.deepEqual(run(GOOD_KEY, GOOD_KEY), { status: 0, nextCalled: true });
  });
});
