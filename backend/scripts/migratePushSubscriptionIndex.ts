import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Safely migrates PushSubscription indexes:
 * 1. Backfills any missing `attendantId` to `null` on existing documents
 * 2. Drops the old unique index `endpoint_1` if present
 * 3. Creates the new compound unique index `{ endpoint: 1, role: 1, attendantId: 1 }`
 */
export async function migratePushSubscriptionIndexes(): Promise<{ droppedOld: boolean; createdNew: boolean }> {
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ Skipping push subscription index migration: No active MongoDB connection.');
    return { droppedOld: false, createdNew: false };
  }

  const collection = mongoose.connection.collection('pushsubscriptions');
  let droppedOld = false;
  let createdNew = false;

  try {
    const indexes = await collection.indexes();
    const hasOldEndpointIndex = indexes.some((idx) => idx.name === 'endpoint_1');

    if (hasOldEndpointIndex) {
      console.log('[Migration] Found old unique index "endpoint_1". Dropping...');
      await collection.dropIndex('endpoint_1');
      droppedOld = true;
      console.log('[Migration] ✅ Dropped old index "endpoint_1"');
    }

    // Backfill null attendantId for existing customer/admin docs
    await collection.updateMany(
      { attendantId: { $exists: false } },
      { $set: { attendantId: null } }
    );

    // Create the compound unique index if it doesn't already exist
    const hasNewCompoundIndex = indexes.some(
      (idx) => idx.name === 'endpoint_1_role_1_attendantId_1' ||
        (idx.key && idx.key.endpoint === 1 && idx.key.role === 1 && idx.key.attendantId === 1)
    );

    if (!hasNewCompoundIndex) {
      console.log('[Migration] Creating compound unique index { endpoint: 1, role: 1, attendantId: 1 }...');
      await collection.createIndex(
        { endpoint: 1, role: 1, attendantId: 1 },
        { unique: true, name: 'endpoint_1_role_1_attendantId_1' }
      );
      createdNew = true;
      console.log('[Migration] ✅ Created compound unique index "endpoint_1_role_1_attendantId_1"');
    } else {
      console.log('[Migration] Compound unique index already exists.');
    }

    return { droppedOld, createdNew };
  } catch (err: any) {
    console.warn('[Migration] Warning: Push subscription index migration skipped/deferred:', err?.message || err);
    return { droppedOld, createdNew };
  }
}

// Standalone execution if run directly via CLI (e.g., node --import tsx scripts/migratePushSubscriptionIndex.ts)
if (process.argv[1] && process.argv[1].endsWith('migratePushSubscriptionIndex.ts')) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/flo-sisterlocks';
  console.log(`Connecting to MongoDB: ${uri}`);
  mongoose.connect(uri)
    .then(async () => {
      console.log('Running index migration...');
      await migratePushSubscriptionIndexes();
      console.log('Migration finished successfully.');
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
