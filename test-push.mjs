#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import webpush from 'web-push';

// ── Terminal Colours ────────────────────────────────────────────────────────
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const WHITE  = '\x1b[37m';
const RESET  = '\x1b[0m';

const log = (msg) => console.log(`${CYAN}${BOLD}▸${RESET} ${msg}`);
const success = (msg) => console.log(`${GREEN}${BOLD}✔${RESET} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}${BOLD}⚠${RESET} ${msg}`);
const error = (msg) => console.error(`${RED}${BOLD}✘${RESET} ${msg}`);
const header = (title) => {
  console.log('\n' + WHITE + BOLD + '  ' + '═'.repeat(title.length + 4));
  console.log(`  ║ ${title} ║`);
  console.log('  ' + '═'.repeat(title.length + 4) + RESET);
};

// ── Setup Paths ─────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve('backend', '.env');

// Load environment variables
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  warn(`No .env file found at ${envPath} — relying on environment variables.`);
}

// ── Schemas & Models ────────────────────────────────────────────────────────
const PushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  role: { type: String, enum: ['customer', 'admin', 'attendant'], default: 'customer' },
  customerPhone: String,
  attendantId: String,
  employeeId: String,
  soundPreference: { type: String, default: 'default' },
}, { timestamps: true });

const PushSubscription = mongoose.models.PushSubscription || mongoose.model('PushSubscription', PushSubscriptionSchema);

const BookingSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  email: String,
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  attendantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendant' },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  completed: { type: Boolean, default: false },
}, { timestamps: true });

const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

const ServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  duration: { type: Number, required: true },
  price: { type: Number, required: true },
}, { timestamps: true });

const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);

// ── Arguments Parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArgValue = (argName) => {
  const idx = args.indexOf(argName);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};
const hasFlag = (flagName) => args.includes(flagName);

const targetUrl = getArgValue('--url') || 'http://localhost:5000';
const employeeId = getArgValue('--employee');
const phone = getArgValue('--phone');
const isFull = hasFlag('--full');

// ── Helpers ──────────────────────────────────────────────────────────────────
function getVapidDetails() {
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const mailto     = process.env.VAPID_MAILTO;

  if (!publicKey || !privateKey || !mailto) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_MAILTO must be set in your backend/.env file');
  }
  return { publicKey, privateKey, mailto };
}

async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in backend/.env');
  }
  log(`Connecting to MongoDB...`);
  await mongoose.connect(uri);
  success('Database connection established');
}

async function triggerPush(subscription, payload) {
  const { publicKey, privateKey, mailto } = getVapidDetails();
  webpush.setVapidDetails(mailto, publicKey, privateKey);

  // Dynamically set sound in payload
  const soundPref = subscription.soundPreference || 'default';
  const customPayload = {
    ...payload,
    sound: soundPref
  };

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }
    },
    JSON.stringify(customPayload)
  );
}

// ── Main Action Router ───────────────────────────────────────────────────────
async function run() {
  header('FLO SISTERLOCKS · test-push.mjs');

  const modeText = isFull 
    ? 'Full End-to-End Integration' 
    : (employeeId ? 'Targeted Employee Push' : (phone ? 'Targeted Customer Push' : 'Basic System Checks'));

  console.log(`  ${DIM}Mode:${RESET} ${WHITE}${BOLD}${modeText}${RESET}`);
  console.log(`  ${DIM}Target API:${RESET} ${CYAN}${targetUrl}${RESET}\n`);

  try {
    // ── MODE 1: Basic checks (env, VAPID keys, and API health) ───────────────
    if (!employeeId && !phone && !isFull) {
      log('Running environment validation...');
      const { publicKey, mailto } = getVapidDetails();
      success('VAPID variables loaded successfully');
      console.log(`    ${DIM}Mailto: ${mailto}${RESET}`);
      console.log(`    ${DIM}Public Key: ${publicKey.slice(0, 30)}...${RESET}`);

      log(`Verifying target Express API health: ${targetUrl}/api/health`);
      const response = await fetch(`${targetUrl}/api/health`);
      if (response.ok) {
        const body = await response.json();
        success('Express server health check PASSED');
        console.log(`    ${DIM}Response: ${JSON.stringify(body)}${RESET}`);
      } else {
        throw new Error(`API health check failed with status: ${response.status}`);
      }
      return;
    }

    // ── CONNECT TO DB FOR TARGETED PUSHES ────────────────────────────────────
    await connectToDatabase();

    // ── MODE 2: Targeted push to a specific employee ────────────────────────
    if (employeeId && !isFull) {
      log(`Locating admin push subscriptions for employeeId: "${employeeId}"`);
      const subs = await PushSubscription.find({ role: 'admin', employeeId });

      if (subs.length === 0) {
        warn(`No active push subscriptions found for employee: "${employeeId}"`);
        return;
      }

      success(`Found ${subs.length} push subscription(s) for "${employeeId}"`);
      log(`Sending test sound triggers to employee devices...`);

      let sentCount = 0;
      for (const sub of subs) {
        const testPayload = {
          title: `Alert for ${employeeId}`,
          body: `Targeted employee sound test triggered! Pref: ${sub.soundPreference || 'default'}`,
          url: '/admin',
        };
        await triggerPush(sub, testPayload);
        sentCount++;
      }
      success(`Successfully delivered targeted sound test to ${sentCount} device(s)`);
      return;
    }

    // ── MODE 3: Targeted customer push to a phone number ───────────────────
    if (phone && !isFull) {
      log(`Locating customer subscriptions for phone: "${phone}"`);
      const subs = await PushSubscription.find({ role: 'customer', customerPhone: phone });

      if (subs.length === 0) {
        warn(`No customer push subscriptions found for phone: "${phone}"`);
        return;
      }

      success(`Found ${subs.length} customer subscription(s)`);
      log(`Sending push notification...`);

      let sentCount = 0;
      for (const sub of subs) {
        const testPayload = {
          title: 'Stylist Update',
          body: `Hello! Your stylist is ready. Message sent at ${new Date().toLocaleTimeString()}`,
          url: '/'
        };
        await triggerPush(sub, testPayload);
        sentCount++;
      }
      success(`Successfully delivered customer push to ${sentCount} device(s)`);
      return;
    }

    // ── MODE 4: Full End-to-End Integration ─────────────────────────
    if (isFull) {
      log('Starting full end-to-end integration test...');

      // 1. Get/Create a test service
      let service = await Service.findOne();
      if (!service) {
        log('No service found in DB, seeding a temporary test service...');
        service = new Service({
          name: 'E2E Test Session',
          duration: 60,
          price: 1500
        });
        await service.save();
      }

      // 2. Create the real booking
      log('Creating temporary booking record in database...');
      const targetPhone = phone || '0721530120';
      const tempBooking = new Booking({
        customerName: 'E2E Push Tester',
        phone: targetPhone,
        email: 'e2e-push@example.com',
        serviceId: service._id,
        date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
        startTime: '11:00',
        endTime: '12:00',
        status: 'pending',
        completed: false
      });
      await tempBooking.save();
      success(`Booking record saved successfully (ID: ${tempBooking._id})`);

      // 3. Trigger simulated Push Alerts
      log('Dispatching push notification triggers...');

      // Dispatch to Admins
      const adminQuery = employeeId ? { role: 'admin', employeeId } : { role: 'admin' };
      const adminSubs = await PushSubscription.find(adminQuery);

      if (adminSubs.length > 0) {
        log(`Broadcasting alert to ${adminSubs.length} admin subscription(s)...`);
        for (const sub of adminSubs) {
          await triggerPush(sub, {
            title: 'New Booking Request',
            body: `E2E Push Tester requested E2E Test Session at 11:00`,
            url: '/admin'
          });
        }
        success('Admin booking notifications dispatched');
      } else {
        warn('Skipping admin notification dispatch: No active admin subscriptions found');
      }

      // Dispatch to Customer Phone
      const customerSubs = await PushSubscription.find({ role: 'customer', customerPhone: targetPhone });
      if (customerSubs.length > 0) {
        log(`Broadcasting receipt to ${customerSubs.length} customer subscription(s)...`);
        for (const sub of customerSubs) {
          await triggerPush(sub, {
            title: 'Booking Received',
            body: 'We have received your sisterlocks booking request. Reviewing shortly!',
            url: '/'
          });
        }
        success('Customer notifications dispatched');
      }

      // 4. Sleep to let notifications process
      const waitTime = 3000;
      log(`Waiting ${waitTime / 1000}s for notifications to dispatch...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // 5. Clean up
      log('Cleaning up: Removing temporary booking record from database...');
      await Booking.deleteOne({ _id: tempBooking._id });
      success('Temporary booking record removed successfully');
      
      console.log('');
      success('Full End-to-End Integration Test PASSED!');
      return;
    }

  } catch (err) {
    console.log('');
    error(`Test Execution Failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      log('Database connection closed.');
    }
    console.log('');
  }
}

run();
