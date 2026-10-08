#!/usr/bin/env node
/**
 * test-whatsapp-webhook.mjs
 *
 * Test script for Meta WhatsApp Cloud API Webhook.
 * Tests:
 *  1. GET verification handshake (hub.challenge / hub.verify_token)
 *  2. POST incoming interactive button payloads (Confirm / Cancel / Reschedule) with HMAC SHA-256 signature
 *
 * Usage:
 *   node test-whatsapp-webhook.mjs --verify
 *   node test-whatsapp-webhook.mjs --simulate-confirm --phone 254712345678
 *   node test-whatsapp-webhook.mjs --simulate-cancel --phone 254712345678
 *   node test-whatsapp-webhook.mjs --simulate-reschedule --phone 254712345678
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// ── Colors ───────────────────────────────────────────────────────────────────
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

const log = (msg) => console.log(`${CYAN}${BOLD}▸${RESET} ${msg}`);
const success = (msg) => console.log(`${GREEN}${BOLD}✔${RESET} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}${BOLD}⚠${RESET} ${msg}`);
const error = (msg) => console.error(`${RED}${BOLD}✘${RESET} ${msg}`);

// ── Load Environment ─────────────────────────────────────────────────────────
const envPath = path.resolve('backend', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api/whatsapp/webhook`;
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN || 'test_token';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'test_secret';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '106540352242922';

// ── CLI Args Parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArgVal = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const customerPhone = getArgVal('--phone') || '254712345678';
const isVerify = args.includes('--verify');
const isConfirm = args.includes('--simulate-confirm');
const isCancel = args.includes('--simulate-cancel');
const isReschedule = args.includes('--simulate-reschedule');

function signPayload(bodyString, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(bodyString, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

async function runVerificationTest() {
  log(`Testing Meta GET verification handshake at: ${BASE_URL}`);
  const challenge = 'challenge_' + Math.floor(Math.random() * 100000);
  const verifyUrl = `${BASE_URL}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=${challenge}`;

  try {
    const res = await fetch(verifyUrl);
    const body = await res.text();
    if (res.ok && body === challenge) {
      success(`Handshake verified! Server returned challenge: ${body}`);
      return true;
    } else {
      error(`Verification failed. Status: ${res.status}, Body: ${body}`);
      return false;
    }
  } catch (err) {
    error(`Connection failed (is the backend running?): ${err.message}`);
    return false;
  }
}

async function runPayloadSimulation(action) {
  log(`Simulating inbound WhatsApp ${action.toUpperCase()} action for ${customerPhone}`);

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '254700000000',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [
                {
                  profile: { name: 'Test Customer' },
                  wa_id: customerPhone,
                },
              ],
              messages: [
                {
                  from: customerPhone,
                  id: 'wamid.HBgL' + Math.random().toString(36).substring(2),
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'button',
                  button: {
                    payload: action,
                    text: action,
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  const bodyStr = JSON.stringify(payload);
  const signature = signPayload(bodyStr, APP_SECRET);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
      },
      body: bodyStr,
    });

    const respText = await res.text();
    if (res.ok) {
      success(`Webhook received simulated message successfully. Status: ${res.status}`);
      return true;
    } else {
      error(`Webhook returned error: ${res.status} - ${respText}`);
      return false;
    }
  } catch (err) {
    error(`Failed to send simulated payload (is server running?): ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`${BOLD}${CYAN}=== WhatsApp Cloud API Webhook Tester ===${RESET}\n`);

  if (isVerify) {
    await runVerificationTest();
  } else if (isConfirm) {
    await runPayloadSimulation('confirm');
  } else if (isCancel) {
    await runPayloadSimulation('cancel');
  } else if (isReschedule) {
    await runPayloadSimulation('reschedule');
  } else {
    log('Running full test suite:');
    console.log(`${DIM}Pass --verify, --simulate-confirm, --simulate-cancel, or --simulate-reschedule for specific tests.${RESET}\n`);
    await runVerificationTest();
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
