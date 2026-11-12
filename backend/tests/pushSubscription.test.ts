import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PushSubscription from '../models/PushSubscription';
import { migratePushSubscriptionIndexes } from '../scripts/migratePushSubscriptionIndex';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';

describe('PushSubscription Identity & Compound Unique Index Tests', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const endpointA = 'https://fcm.googleapis.com/fcm/send/test-endpoint-device-1';
  const dummyKeys = { p256dh: 'dummy-p256dh-key', auth: 'dummy-auth-key' };

  before(async () => {
    // If not connected, connect to local or env MongoDB
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/flo-sisterlocks-test';
      await mongoose.connect(uri);
    }
    // Clean up test documents and run index migration
    await PushSubscription.deleteMany({ endpoint: endpointA });
    await migratePushSubscriptionIndexes();
  });

  after(async () => {
    // Clean up test data
    await PushSubscription.deleteMany({ endpoint: endpointA });
    await mongoose.disconnect();
  });

  it('allows an admin and a customer subscription to coexist on the exact same browser endpoint', async () => {
    // 1. Create customer subscription
    const customerSub = await PushSubscription.create({
      tenantId: dummyTenantId,
      endpoint: endpointA,
      keys: dummyKeys,
      role: 'customer',
      customerPhone: normalizeKenyanPhone('0712345678'),
      attendantId: null,
    });
    assert.ok(customerSub._id);

    // 2. Create admin subscription on the SAME endpoint
    const adminSub = await PushSubscription.create({
      tenantId: dummyTenantId,
      endpoint: endpointA,
      keys: dummyKeys,
      role: 'admin',
      attendantId: null,
      soundPreference: 'chime',
    });
    assert.ok(adminSub._id);

    // 3. Verify both exist simultaneously in the database
    const subs = await PushSubscription.find({ endpoint: endpointA });
    assert.strictEqual(subs.length, 2);

    const roles = subs.map((s) => s.role).sort();
    assert.deepStrictEqual(roles, ['admin', 'customer']);
  });

  it('upserts customer subscription without overwriting or deleting admin subscription', async () => {
    // Customer updates phone from 0712345678 to 0799999999 on the same browser
    const newPhone = normalizeKenyanPhone('0799999999')!;
    await PushSubscription.findOneAndUpdate(
      { endpoint: endpointA, role: 'customer', attendantId: null },
      {
        endpoint: endpointA,
        keys: dummyKeys,
        customerPhone: newPhone,
        role: 'customer',
        attendantId: null,
        tenantId: dummyTenantId,
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    // Customer doc should have new phone
    const updatedCustomer = await PushSubscription.findOne({ endpoint: endpointA, role: 'customer' });
    assert.strictEqual(updatedCustomer?.customerPhone, '+254799999999');

    // Admin doc must STILL exist and remain untouched
    const adminDoc = await PushSubscription.findOne({ endpoint: endpointA, role: 'admin' });
    assert.ok(adminDoc);
    assert.strictEqual(adminDoc?.soundPreference, 'chime');
  });

  it('unsubscribing customer only removes customer doc and preserves admin subscription', async () => {
    // Delete customer subscription
    await PushSubscription.deleteOne({ endpoint: endpointA, role: 'customer', tenantId: dummyTenantId });

    // Customer doc should be gone
    const customerDoc = await PushSubscription.findOne({ endpoint: endpointA, role: 'customer' });
    assert.strictEqual(customerDoc, null);

    // Admin doc must STILL exist
    const adminDoc = await PushSubscription.findOne({ endpoint: endpointA, role: 'admin' });
    assert.ok(adminDoc);
  });

  it('rejects duplicate customer subscriptions on the same endpoint via compound unique index', async () => {
    // Re-create a customer subscription
    await PushSubscription.create({
      tenantId: dummyTenantId,
      endpoint: endpointA,
      keys: dummyKeys,
      role: 'customer',
      customerPhone: '+254711111111',
      attendantId: null,
    });

    // Attempting to direct-insert another customer subscription on the same endpoint must throw E11000
    await assert.rejects(
      async () => {
        await PushSubscription.create({
          tenantId: dummyTenantId,
          endpoint: endpointA,
          keys: dummyKeys,
          role: 'customer',
          customerPhone: '+254722222222',
          attendantId: null,
        });
      },
      (err: any) => {
        return err.code === 11000;
      }
    );
  });
});
