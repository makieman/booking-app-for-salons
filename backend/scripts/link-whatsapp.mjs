#!/usr/bin/env node
/**
 * link-whatsapp.mjs
 *
 * Helper script to link a Meta WhatsApp Phone Number ID to a tenant in MongoDB.
 * Usage:
 *   node scripts/link-whatsapp.mjs <PHONE_NUMBER_ID> [tenant_slug]
 *
 * Defaults:
 *   PHONE_NUMBER_ID: reads from process.env.WHATSAPP_PHONE_NUMBER_ID if not passed
 *   tenant_slug: 'flo-sisterlocks'
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const phoneId = process.argv[2] || process.env.WHATSAPP_PHONE_NUMBER_ID;
const slug = process.argv[3] || 'flo-sisterlocks';

if (!phoneId || phoneId.startsWith('replace_')) {
  console.error('\x1b[31m%s\x1b[0m', '✘ Error: No valid phone number ID provided.');
  console.log('Usage: node scripts/link-whatsapp.mjs <PHONE_NUMBER_ID> [tenant_slug]');
  console.log('Or set WHATSAPP_PHONE_NUMBER_ID in backend/.env');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('\x1b[31m%s\x1b[0m', '✘ Error: MONGODB_URI not found in backend/.env');
  process.exit(1);
}

async function run() {
  try {
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGODB_URI);

    const Tenant = mongoose.model(
      'Tenant',
      new mongoose.Schema(
        {
          slug: String,
          name: String,
          whatsappPhoneNumberId: String,
        },
        { strict: false }
      )
    );

    const updated = await Tenant.findOneAndUpdate(
      { slug },
      { $set: { whatsappPhoneNumberId: phoneId.trim() } },
      { new: true }
    );

    if (!updated) {
      console.error('\x1b[31m%s\x1b[0m', `✘ Tenant with slug "${slug}" not found in database.`);
      process.exit(1);
    }

    console.log('\x1b[32m%s\x1b[0m', `✔ Successfully linked WhatsApp Phone Number ID:`);
    console.log(`  Tenant:     ${updated.name} (${updated.slug})`);
    console.log(`  Phone ID:   ${updated.whatsappPhoneNumberId}`);
    console.log('\nIncoming WhatsApp webhooks will now be routed directly to this salon.');
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', '✘ Database error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
