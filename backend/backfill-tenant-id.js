import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const mongoUri = process.env.MONGODB_URI;
const tenantSlug = process.env.TENANT_SLUG || 'flo-sisterlocks';

if (!mongoUri) {
  console.error('❌ MONGODB_URI environment variable is required.');
  process.exit(1);
}

async function backfill() {
  try {
    console.log(`🔌 Connecting to MongoDB database...`);
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected successfully.`);

    const db = mongoose.connection.db;
    const tenantsCollection = db.collection('tenants');

    const tenant = await tenantsCollection.findOne({ slug: tenantSlug.toLowerCase().trim() });
    if (!tenant) {
      console.error(`❌ Tenant with slug "${tenantSlug}" not found in database.`);
      process.exit(1);
    }

    console.log(`🎯 Found target tenant: "${tenant.name}" (${tenant.slug}), ID: ${tenant._id}`);

    const collectionsToUpdate = ['services', 'bookings', 'attendants', 'notifications', 'pushsubscriptions'];

    for (const collName of collectionsToUpdate) {
      const coll = db.collection(collName);

      const filter = {
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null }
        ]
      };

      const countBefore = await coll.countDocuments(filter);
      if (countBefore === 0) {
        console.log(`✨ [${collName}] All documents already have a valid tenantId. Skipping.`);
        continue;
      }

      const result = await coll.updateMany(filter, {
        $set: { tenantId: tenant._id }
      });

      console.log(`🔄 [${collName}] Updated ${result.modifiedCount} / ${countBefore} documents with tenantId: ${tenant._id}`);
    }

    console.log(`🎉 Backfill script completed successfully!`);
  } catch (err) {
    console.error('❌ Error during backfill:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

backfill();
