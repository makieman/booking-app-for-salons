process.env.NODE_ENV = 'test';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import connectDB from '../config/db';
import { createApp, seedDefaultTenant } from '../server';
import Tenant from '../models/Tenant';
import Attendant from '../models/Attendant';
import Booking from '../models/Booking';
import Service from '../models/Service';

describe('Security Hardening & Privacy Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-1234567890';
  process.env.JWT_SECRET = JWT_SECRET;

  let testTenant: any;
  let testService: any;
  let attendant1: any;
  let attendant2: any;
  let ownerToken: string;
  let attendant1Token: string;

  before(async () => {
    const testMongoUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/flo-sisterlocks-test';
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(testMongoUri);
    }

    // Clean up test collections for isolation
    await Tenant.deleteMany({ slug: 'test-security-salon' });

    testTenant = await Tenant.create({
      name: 'Security Test Salon',
      slug: 'test-security-salon',
      ownerEmail: 'owner@securitytest.com',
      ownerPasswordHash: 'dummyhash',
      timezone: 'Africa/Nairobi',
      workingHours: { start: '08:00', end: '19:00' },
      bookingRules: {
        slotInterval: 30,
        bufferMinutes: 0,
        minNoticeHours: 0,
        holidays: [],
        closedWeekdays: [],
        breaks: [],
      },
    });

    testService = await Service.create({
      tenantId: testTenant._id,
      name: 'Security Styling',
      duration: 60,
      price: 2500,
    });

    attendant1 = await Attendant.create({
      tenantId: testTenant._id,
      name: 'Stylist Alpha',
      username: 'alpha',
      isActive: true,
      pinHash: 'dummy',
    });

    attendant2 = await Attendant.create({
      tenantId: testTenant._id,
      name: 'Stylist Beta',
      username: 'beta',
      isActive: true,
      pinHash: 'dummy',
    });

    ownerToken = jwt.sign(
      { tenantId: testTenant._id.toString(), role: 'owner' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    attendant1Token = jwt.sign(
      {
        sub: attendant1._id.toString(),
        role: 'attendant',
        name: attendant1.name,
        tenantId: testTenant._id.toString(),
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const app = createApp();
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (testTenant?._id) {
      await Booking.deleteMany({ tenantId: testTenant._id });
      await Service.deleteMany({ tenantId: testTenant._id });
      await Attendant.deleteMany({ tenantId: testTenant._id });
      await Tenant.deleteMany({ _id: testTenant._id });
    }
    await mongoose.disconnect();
  });

  // ── 1. LOCK DOWN GET /api/bookings ──────────────────────────────────────────
  describe('1. GET /api/bookings authentication & scoping', () => {
    before(async () => {
      await Booking.deleteMany({ tenantId: testTenant._id });
      // Create a booking for attendant1 and a booking for attendant2
      await Booking.create({
        tenantId: testTenant._id,
        reference: 'SEC-ATT1',
        customerName: 'Customer Alpha',
        phone: '+254712345678',
        email: 'alpha@privatemail.com',
        serviceId: testService._id,
        attendantId: attendant1._id,
        date: '2026-11-01',
        startTime: '10:00',
        endTime: '11:00',
        status: 'confirmed',
      });
      await Booking.create({
        tenantId: testTenant._id,
        reference: 'SEC-ATT2',
        customerName: 'Customer Beta',
        phone: '+254722334455',
        email: 'beta@privatemail.com',
        serviceId: testService._id,
        attendantId: attendant2._id,
        date: '2026-11-01',
        startTime: '11:00',
        endTime: '12:00',
        status: 'confirmed',
      });
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        headers: { 'X-Tenant-Slug': testTenant.slug },
      });
      assert.strictEqual(res.status, 401);
      const data: any = await res.json();
      assert.match(data.error, /authentication required/i);
    });

    it('allows owner to see all tenant bookings', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        headers: {
          'X-Tenant-Slug': testTenant.slug,
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 2);
    });

    it('restricts attendant to only their own assigned bookings', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        headers: {
          'X-Tenant-Slug': testTenant.slug,
          Authorization: `Bearer ${attendant1Token}`,
        },
      });
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 1);
      assert.strictEqual(data[0].reference, 'SEC-ATT1');
    });
  });

  // ── 2. LOOKUP MUST PROVE OWNERSHIP & TRIM DATA ───────────────────────────────
  describe('2. GET /api/bookings/lookup ownership proof & data minimization', () => {
    const rawPhone = '0712345678';
    const normalizedPhone = '+254712345678';
    const bookingRef = 'SEC-LOOKUP1';

    before(async () => {
      await Booking.create({
        tenantId: testTenant._id,
        reference: bookingRef,
        customerName: 'Private Client',
        phone: normalizedPhone,
        email: 'sensitive-customer@email.com',
        serviceId: testService._id,
        attendantId: attendant1._id,
        date: '2026-11-02',
        startTime: '14:00',
        endTime: '15:00',
        status: 'confirmed',
      });
    });

    it('rejects reference-only query with 400', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/lookup?reference=${bookingRef}`, {
        headers: { 'X-Tenant-Slug': testTenant.slug },
      });
      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /both booking reference and phone number are required/i);
    });

    it('rejects phone-only query with 400 (prevents number scanning)', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/lookup?phone=${rawPhone}`, {
        headers: { 'X-Tenant-Slug': testTenant.slug },
      });
      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /both booking reference and phone number are required/i);
    });

    it('returns generic 404 for wrong phone to prevent leak', async () => {
      const res = await fetch(
        `${baseUrl}/api/bookings/lookup?reference=${bookingRef}&phone=0799999999`,
        { headers: { 'X-Tenant-Slug': testTenant.slug } }
      );
      assert.strictEqual(res.status, 404);
      const data: any = await res.json();
      assert.strictEqual(data.error, 'No booking found matching the provided reference and phone number');
    });

    it('returns generic 404 for wrong reference', async () => {
      const res = await fetch(
        `${baseUrl}/api/bookings/lookup?reference=NONEXISTENT&phone=${rawPhone}`,
        { headers: { 'X-Tenant-Slug': testTenant.slug } }
      );
      assert.strictEqual(res.status, 404);
      const data: any = await res.json();
      assert.strictEqual(data.error, 'No booking found matching the provided reference and phone number');
    });

    it('returns trimmed sanitized data (no email, masked phone) on valid pair match', async () => {
      const res = await fetch(
        `${baseUrl}/api/bookings/lookup?reference=${bookingRef}&phone=${rawPhone}`,
        { headers: { 'X-Tenant-Slug': testTenant.slug } }
      );
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.ok(Array.isArray(data) && data.length === 1);
      const b = data[0];

      // Privacy verification under Kenya Data Protection Act:
      assert.strictEqual(b.email, undefined, 'Email MUST NOT be exposed in customer lookup');
      assert.ok(b.phone.includes('••'), `Phone must be masked, got: ${b.phone}`);
      assert.strictEqual(b.customerName, 'Private Client');
      assert.strictEqual(b.reference, bookingRef);
      assert.ok(b._id, '_id should be preserved for customer actions');
    });
  });

  // ── 3. OWNERSHIP CHECK ON CANCEL AND RESCHEDULE ──────────────────────────────
  describe('3. Ownership check on cancel & reschedule', () => {
    let targetBooking: any;

    beforeEach(async () => {
      targetBooking = await Booking.create({
        tenantId: testTenant._id,
        reference: `SEC-MOD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        customerName: 'Modifiable Client',
        phone: '+254711223344',
        email: 'mod@privatemail.com',
        serviceId: testService._id,
        attendantId: attendant1._id,
        date: '2026-11-05',
        startTime: '10:00',
        endTime: '11:00',
        status: 'confirmed',
      });
    });

    it('cancel rejects missing phone with 400', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${targetBooking._id}/cancel-customer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /phone number is required/i);
    });

    it('cancel rejects wrong phone with 403', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${targetBooking._id}/cancel-customer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({ phone: '0700000000' }),
      });
      assert.strictEqual(res.status, 403);
      const data: any = await res.json();
      assert.match(data.error, /phone number does not match/i);
    });

    it('cancel succeeds with matching normalized phone', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${targetBooking._id}/cancel-customer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({ phone: '0711 223 344' }),
      });
      assert.strictEqual(res.status, 200);
      const doc = await Booking.findById(targetBooking._id);
      assert.strictEqual(doc?.status, 'cancelled');
    });

    it('reschedule rejects missing phone with 400', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${targetBooking._id}/reschedule-customer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({ date: '2026-11-06', startTime: '12:00' }),
      });
      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /phone number is required/i);
    });

    it('reschedule rejects wrong phone with 403', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${targetBooking._id}/reschedule-customer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({ date: '2026-11-06', startTime: '12:00', phone: '0700000000' }),
      });
      assert.strictEqual(res.status, 403);
      const data: any = await res.json();
      assert.match(data.error, /phone number does not match/i);
    });
  });

  // ── 4. ABUSE CAPS & HONEYPOT IN CREATE BOOKING ───────────────────────────────
  describe('4. Abuse caps & honeypot on booking creation', () => {
    it('rejects bot submissions containing honeypot field with 400', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({
          customerName: 'Bot Spammer',
          phone: '0712345678',
          email: 'bot@spam.com',
          date: '2026-11-10',
          startTime: '10:00',
          serviceId: testService._id.toString(),
          hp: 'spam-bot-trap-value',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /invalid booking submission/i);
    });

    it('rejects if phone already has 3 or more active future bookings in tenant', async () => {
      const spammerPhone = '+254798765432';
      // Create 3 active future bookings
      for (let i = 1; i <= 3; i++) {
        await Booking.create({
          tenantId: testTenant._id,
          reference: `CAP-${i}-${Date.now()}`,
          customerName: 'High Volume Client',
          phone: spammerPhone,
          serviceId: testService._id,
          date: '2026-11-20',
          startTime: `1${i}:00`,
          endTime: `1${i + 1}:00`,
          status: 'confirmed',
        });
      }

      // 4th attempt should be capped
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': testTenant.slug,
        },
        body: JSON.stringify({
          customerName: 'High Volume Client',
          phone: spammerPhone,
          email: 'client@email.com',
          date: '2026-11-21',
          startTime: '10:00',
          serviceId: testService._id.toString(),
        }),
      });
      assert.strictEqual(res.status, 400);
      const data: any = await res.json();
      assert.match(data.error, /maximum of 3 active appointments/i);
    });
  });

  // ── 5. RATE LIMITING & TRUST PROXY ──────────────────────────────────────────
  describe('5. Rate limiters & trust proxy isolation', () => {
    it('app has trust proxy configured to 1', () => {
      const app = createApp();
      assert.strictEqual(app.get('trust proxy'), 1);
    });

    it('isolates rate limiter buckets by client IP via X-Forwarded-For', async () => {
      const ipA = '198.51.100.1';
      const ipB = '198.51.100.2';

      // Push test limiter is set to 5/hour
      let blockedOnIpA = false;
      for (let i = 0; i < 7; i++) {
        const res = await fetch(`${baseUrl}/api/push/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ownerToken}`,
            'X-Tenant-Slug': testTenant.slug,
            'X-Forwarded-For': ipA,
          },
          body: JSON.stringify({ subscription: { endpoint: 'https://test.endpoint' } }),
        });
        if (res.status === 429) {
          blockedOnIpA = true;
          break;
        }
      }
      assert.strictEqual(blockedOnIpA, true, 'Client IP A must be rate limited with 429');

      // Client IP B should NOT be blocked despite IP A being rate limited
      const resIpB = await fetch(`${baseUrl}/api/push/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerToken}`,
          'X-Tenant-Slug': testTenant.slug,
          'X-Forwarded-For': ipB,
        },
        body: JSON.stringify({ subscription: { endpoint: 'https://test.endpoint' } }),
      });
      assert.notStrictEqual(resIpB.status, 429, 'Client IP B should have an independent rate limit bucket');
    });
  });

  // ── 6. SEEDING CREDENTIALS SAFETY ───────────────────────────────────────────
  describe('6. Default credentials & seeding security', () => {
    it('seedDefaultTenant does nothing when SEED_DEFAULT_TENANT is false or unset', async () => {
      process.env.SEED_DEFAULT_TENANT = 'false';
      const countBefore = await Tenant.countDocuments();
      await seedDefaultTenant();
      const countAfter = await Tenant.countDocuments();
      assert.strictEqual(countAfter, countBefore, 'Seeding must not run when SEED_DEFAULT_TENANT is false');
    });
  });
});
