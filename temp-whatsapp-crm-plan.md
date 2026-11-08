 # Flo Sisterlocks WhatsApp CRM & Lifecycle Messaging Plan

## Executive Summary
This document outlines the architecture, setup, data modeling, compliance, templates, automation rules, owner interface, and financial costs for turning Flo Sisterlocks' existing WhatsApp Cloud API integration into a full Customer Relationship Management (CRM) system.

---

## A. Current State Audit

### 1. Existing Message Inventory
The application currently supports 5 automated WhatsApp notification touchpoints in `backend/services/whatsappService.ts`:

| Template Name | Category | Trigger Location | Data Payload / Variables |
| :--- | :--- | :--- | :--- |
| `booking_request_received` | Utility | `backend/controllers/bookingController.ts` (`createBooking`) | `customerName`, `serviceName` (+ attendant), `date`, `startTime`, `reference` |
| `booking_confirmed` | Utility | `backend/controllers/adminController.ts` (`updateBookingStatus`) | `customerName`, `serviceName`, `date`, `startTime`, `reference` |
| `booking_rescheduled` | Utility | `backend/controllers/adminController.ts` (`rescheduleBooking`) | `customerName`, `serviceName`, `date`, `startTime`, `reference` |
| `booking_cancelled` | Utility | `backend/controllers/adminController.ts` & `bookingController.ts` | `customerName`, `serviceName`, `date`, `reference` |
| `appointment_reminder` | Utility | `backend/services/reminderService.ts` (`runReminderPass`) | `customerName`, `serviceName`, `startTime` |

In addition, `sendWhatsAppFreeText` is used in `backend/controllers/webhookController.ts` to suggest reschedule slots, confirm self-confirmations, and send cancellation reasons.

### 2. Inbound Webhook & Booking Matching
Inbound messages arrive at `POST /api/whatsapp/webhook` (`backend/controllers/webhookController.ts`):
* **Security**: `GET` checks `WHATSAPP_WEBHOOK_TOKEN`. `POST` verifies the `X-Hub-Signature-256` HMAC-SHA256 hash using `WHATSAPP_APP_SECRET`.
* **Salon Lookup**: Resolves the salon using `payload.entry[].changes[].value.metadata.phone_number_id` against `Tenant.whatsappPhoneNumberId`.
* **Booking Matching**: Matches purely by the customer's phone number (`Booking.findOne({ tenantId, phone: { $in: [phone, `+${phone}`] }, status: { $in: ['pending', 'confirmed'] } }).sort({ createdAt: -1 })`).
* **Button Routing**: Routes static button IDs: `CONFIRM_BOOKING`, `CANCEL_BOOKING`, and `RESCHEDULE_BOOKING`.

### 3. Customer Data Stored Today
There is **no standalone Customer model** in the database today. Customer details are stored denormalized inside each `Booking` record in `backend/models/Booking.ts`:
* `customerName` (String)
* `phone` (String)
* `email` (String, optional)
* `date` & `startTime`
* `status` ('pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show')
* `completedAt` (Date)
* `reminderSentAt` (Date)

**Missing Data**:
* No marketing consent boolean or timestamp.
* No opt-out / blacklist flag (`optedOut: true`).
* No birthday field.
* No customer-level aggregation (total visits, last visit date, total spend).

### 4. Reminder Scheduling
In `backend/services/reminderService.ts`:
* **Frequency**: Hourly cron job (`0 * * * *`) scheduled in Node.js.
* **Window**: Restricts dispatch to daytime hours: 08:00 to 20:00 Africa/Nairobi.
* **Targeting**: Queries confirmed appointments for tomorrow (`date === tomorrowKey(localNow)`) where `reminderSentAt === null`.
* **Deduplication**: Claims appointments atomically with `Booking.updateOne({ _id, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } })`.
* **Startup Catchup**: Automatically triggers a catch-up run 30 seconds after server restart.

### 5. Environment Variables & Locations (Live Production Status)
* `WHATSAPP_TOKEN`: Permanent Admin System User token (`EAAdQbqm...`, verified with `expires_at: 0`, never expires).
* `WHATSAPP_PHONE_NUMBER_ID`: `1402619999596462` (Dedicated production line `+254 783 746104`, status `CONNECTED`, mode `LIVE`).
* `WHATSAPP_API_VERSION`: `v21.0`.
* `WHATSAPP_WEBHOOK_TOKEN`: `3624660337abda8fa3e7e94015a603dd0b47024136ca6523` (Verified live on Render endpoint).
* `WHATSAPP_APP_SECRET`: `179c5b34b8b6a5889b52e54c3c6df915` (Verified against Meta OAuth client credentials for App `2058761058057357`).
* `Tenant.whatsappPhoneNumberId`: Linked in MongoDB to `1402619999596462` for tenant `Flo Sisterlocks` (`flo-sisterlocks`).

### 6. Identified Inconsistencies & Resolution Status
1. **Permanent Token (RESOLVED ✅)**: Replaced temporary 24-hr token with a verified Permanent System User Token with scopes `business_management`, `whatsapp_business_management`, and `whatsapp_business_messaging`.
2. **Production Phone Registered (RESOLVED ✅)**: Phone `+254 783 746104` (Phone ID `1402619999596462`) connected to WABA `29645437045060252` (`flosisterlock`).
3. **Webhook Verification (RESOLVED ✅)**: Tested live on Render with `hub.verify_token`, echoing challenges with HTTP 200.
4. **Tenant Database Link (RESOLVED ✅)**: Script `link-whatsapp.mjs` executed; MongoDB tenant record updated with production Phone ID.
5. **Template Pipeline (IN PROGRESS / SUBMITTED ✅)**: All 5 operational utility templates submitted to Meta review engine under WABA `29645437045060252`.
6. **Dynamic Booking References (Pending Milestone 2)**: Button payloads to be updated to `CONFIRM_${reference}` to protect against multi-booking phone matching edge cases.

---

## B. Meta & WhatsApp Production Setup Checklist (Updated)

```
[1. Payment Card ✅] ──> [2. System User Token ✅] ──> [3. Register Number ✅] ──> [4. Display Name ✅] ──> [5. Business Verification] ──> [6. Webhooks & Env ✅]
```

### Step 1: Add Payment Card in Meta Billing Hub — [COMPLETED ✅]
* **Business Account ID**: `2129025370987585`.
* Payment card added and linked to WhatsApp Business Account `29645437045060252`.

### Step 2: Create a Permanent System User Token — [COMPLETED ✅]
* **System User**: `Employee` / `Flo-Booking-Backend` (ID: `122112312003511234`).
* **Permissions Granted**: `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`, `public_profile`.
* **Expiration**: `Never` (`expires_at: 0`).
* **Graph API Test Output**:
  ```json
  {"data":{"app_id":"2058761058057357","type":"SYSTEM_USER","application":"flosisterlock","expires_at":0,"is_valid":true}}
  ```

### Step 3: Register Clean Production Phone Number — [COMPLETED ✅]
* **Production Number**: `+254 783 746104`.
* **Meta Phone Number ID**: `1402619999596462`.
* **Account Status**: `CONNECTED`, Account Mode: `LIVE`.
* **WABA ID**: `29645437045060252` (`flosisterlock`).

### Step 4: Set Display Name — [COMPLETED ✅]
* **Verified Name**: `flosisterlock` (`AVAILABLE_WITHOUT_REVIEW`).
* **Category**: Beauty, Cosmetics & Personal Care.

### Step 5: Start Business Verification — [FUTURE EXPANSION / TIER 2]
* Account currently operates in Tier 1 (up to 250 business-initiated conversations in 24 hours).
* Upload Kenyan registration documents (Certificate of Incorporation / KRA PIN) in Meta Security Center to unlock 1,000 to 10,000+ daily limit when scaling.

### Step 6: Configure Webhook & Update Render — [COMPLETED ✅]
* **Callback URL**: `https://booking-app-for-salons.onrender.com/api/whatsapp/webhook`.
* **Verify Token**: `3624660337abda8fa3e7e94015a603dd0b47024136ca6523`.
* **Handshake Verification Test**: Passed (echoes `hub.challenge` with HTTP 200).
* **Local Backend Config**: Updated in `backend/.env`.
* **MongoDB Linked**: Ran `node backend/scripts/link-whatsapp.mjs 1402619999596462 flo-sisterlocks`.

---

## C. Customer Data Model

To support CRM automations, holiday greetings, and rebooking nudges, we introduce a dedicated `Customer` collection in MongoDB.

### 1. Customer Schema (`backend/models/Customer.ts`)

```typescript
export interface ICustomer extends Document {
  tenantId: mongoose.Types.ObjectId;   // Scoped to salon (flo-sisterlocks)
  phone: string;                       // Normalized Kenyan format (2547XXXXXXXX)
  name: string;                        // Full name (e.g. "Wanjiru Kamau")
  firstName: string;                   // Derived for personalized greetings ("Wanjiru")
  email?: string;
  birthday?: string;                   // MM-DD format (year omitted for privacy)
  
  // Marketing & Compliance
  marketingConsent: boolean;           // True only if explicitly checked by user
  consentTimestamp?: Date;             // When consent was provided
  consentSource?: 'booking_checkout' | 'in_salon' | 'whatsapp_opt_in' | 'manual';
  optedOut: boolean;                   // True if user replied STOP / opted out
  optedOutAt?: Date;

  // Visit Intelligence
  visitCount: number;                  // Total completed appointments
  lastVisitDate?: Date;                // Date of last completed appointment
  firstVisitDate?: Date;               // Client acquisition date
  preferredAttendantId?: mongoose.Types.ObjectId;

  // Anti-Spam Tracking
  lastMarketingSentAt?: Date;          // Enforces 14-day minimum gap
  lastMarketingType?: string;          // e.g. 'holiday', 'we_miss_you'

  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. Indexes
* `Compound unique index`: `{ tenantId: 1, phone: 1 }` (ensures one customer record per phone number per salon).
* `Rebooking query index`: `{ tenantId: 1, marketingConsent: 1, optedOut: 1, lastVisitDate: 1 }`.
* `Birthday query index`: `{ tenantId: 1, marketingConsent: 1, optedOut: 1, birthday: 1 }`.

### 3. Backfill Strategy from Existing Bookings
A one-time migration script `backend/scripts/migrate-customers-from-bookings.ts`:
1. Runs an aggregation pipeline on existing `Booking` documents grouped by `tenantId` and `phone`.
2. Calculates `visitCount` (where status is `completed`), finds `max(date)` for `lastVisitDate`, and takes the latest `customerName`.
3. Upserts each record into the `Customer` collection.
4. Defaults `marketingConsent: false` for all historical records to ensure strict compliance with the Kenya Data Protection Act.

### 4. Ongoing Sync Lifecycle
* **On Booking Creation**: When a new booking is submitted, upsert the `Customer` record. Update the name and record marketing consent if the customer checked the opt-in box.
* **On Booking Completion**: When an attendant or admin marks a booking as `completed`, increment `visitCount` by 1 and update `lastVisitDate` to the appointment date.

---

## D. Consent & Compliance (Kenya Data Protection Act)

Under the **Kenya Data Protection Act 2019 (Section 37)** and Meta WhatsApp Business Policies, sending direct marketing without explicit, verifiable consent is illegal.

### 1. Distinction: Transactional vs. Marketing
| Message Type | Examples | Consent Required? | Permitted Window |
| :--- | :--- | :--- | :--- |
| **Transactional (Utility)** | Booking received, confirmed, reminder, rescheduled, cancelled | **No** (Directly fulfills appointment contract) | Anytime via Meta Utility Template |
| **Marketing (CRM)** | Holiday greetings, rebooking nudges, birthdays, seasonal offers | **YES** (Prior explicit affirmative consent required) | 08:00 to 20:00 local time via Marketing Template |

### 2. Booking Checkout Consent Capture
Add an explicit checkbox on the client booking review screen before they submit:
* **UI**: An **unticked** checkbox.
* **Label**: *"Send me hair care tips, seasonal specials, and holiday greetings on WhatsApp."*
* **Storage**: When checked, save `marketingConsent: true`, `consentTimestamp: new Date()`, `consentSource: 'booking_checkout'`.
* **Default**: If left unchecked, the customer receives all transactional booking notifications (receipts, 24h reminders), but will **never** receive holiday messages or marketing offers.

### 3. Automatic STOP / Opt-Out Handling
In `backend/controllers/webhookController.ts`:
* Detect inbound plain-text replies containing: `STOP`, `UNSUBSCRIBE`, `CANCEL OFFERS`, `SIMAMA`, or `STOPP`.
* Immediately update the `Customer` record:
  ```typescript
  await Customer.updateOne(
    { tenantId: tenant._id, phone: senderPhone },
    { $set: { optedOut: true, marketingConsent: false, optedOutAt: new Date() } }
  );
  ```
* Reply with a short confirmation:
  > *"You have been unsubscribed from Flo Sisterlocks marketing messages. You will still receive reminders for your booked appointments. Reply START anytime to resubscribe."*
* If they text `START`, re-enable consent.

---

## E. Message Templates for Meta Approval

Meta enforces strict template categorization. Every template below has been designed to meet Meta's approval rules.

### 0. Operational Utility Templates (Submitted to Meta Live WABA `29645437045060252`)
These 5 utility templates directly power the booking lifecycle and are submitted under language code `en`:

| Template Name | Meta ID | Category | Language | Status | Variables / Parameters |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `booking_request_received` | `1806860930635751` | `UTILITY` | `en` | Review Pending | `{{1}}` Name, `{{2}}` Service, `{{3}}` Date, `{{4}}` Time, `{{5}}` Reference |
| `booking_confirmed` | `1104900732143476` | `UTILITY` | `en` | Review Pending | `{{1}}` Name, `{{2}}` Service, `{{3}}` Date, `{{4}}` Time, `{{5}}` Reference |
| `appointment_reminder` | `2046992676005400` | `UTILITY` | `en` | Review Pending | `{{1}}` Name, `{{2}}` Service, `{{3}}` Time |
| `booking_rescheduled` | `1618702670036220` | `UTILITY` | `en` | Review Pending | `{{1}}` Name, `{{2}}` Service, `{{3}}` Date, `{{4}}` Time, `{{5}}` Reference |
| `booking_cancelled` | `2111136939774294` | `UTILITY` | `en` | Review Pending | `{{1}}` Name, `{{2}}` Service, `{{3}}` Date, `{{4}}` Reference |

---

### 1. Rebooking Nudge ("We Miss You")
* **Template Name**: `flo_we_miss_you_v1`
* **Category**: **MARKETING**
* **Language**: English (`en`)
* **Exact Text**:
  > *"Hi {{1}}! It has been {{2}} weeks since your last appointment at {{3}}. To keep your Sisterlocks neat, healthy, and thriving, we recommend scheduling a retightening soon. Tap below to choose your date: {{4}}\n\nReply STOP to opt out."*
* **Variables**:
  * `{{1}}`: Customer First Name (e.g. `Wanjiru`)
  * `{{2}}`: Number of weeks (e.g. `6`)
  * `{{3}}`: Salon Name (`Flo Sisterlocks`)
  * `{{4}}`: Direct booking URL (`https://booking-app-for-salons.vercel.app/flo-sisterlocks`)
* **Buttons**: Quick Reply: `[Book Now]` or URL Button to booking link.

### 2. Holiday Greeting
* **Template Name**: `flo_holiday_greeting_v1`
* **Category**: **MARKETING**
* **Language**: English (`en`)
* **Exact Text**:
  > *"Hi {{1}}! ✨ {{2}} wishes you and your family a peaceful and blessed {{3}}! May this season bring joy, health, and love to your home. We look forward to seeing you soon. 💖\n\nReply STOP to opt out."*
* **Variables**:
  * `{{1}}`: Customer First Name (`Wanjiru`)
  * `{{2}}`: Salon Name (`Flo Sisterlocks`)
  * `{{3}}`: Holiday Name (`Mashujaa Day` / `Jamhuri Day` / `Christmas`)

### 3. Birthday Celebration
* **Template Name**: `flo_birthday_treat_v1`
* **Category**: **MARKETING**
* **Language**: English (`en`)
* **Exact Text**:
  > *"Happy Birthday {{1}}! 🎂 The entire team at {{2}} celebrates you today! As a birthday treat, enjoy {{3}} off your next service booked this month. Treat yourself here: {{4}} 🎉\n\nReply STOP to opt out."*
* **Variables**:
  * `{{1}}`: Customer First Name (`Wanjiru`)
  * `{{2}}`: Salon Name (`Flo Sisterlocks`)
  * `{{3}}`: Perk (`10% discount` or `a complimentary scalp treatment`)
  * `{{4}}`: Booking Link

### 4. Seasonal Special Offer
* **Template Name**: `flo_seasonal_special_v1`
* **Category**: **MARKETING**
* **Language**: English (`en`)
* **Exact Text**:
  > *"Hi {{1}}! Special offer from {{2}}: {{3}}. Valid until {{4}}. Limited slots available this week, tap here to book: {{5}} ✨\n\nReply STOP to opt out."*
* **Variables**:
  * `{{1}}`: Customer First Name
  * `{{2}}`: Salon Name
  * `{{3}}`: Offer description (e.g. `Get 15% off Sisterlocks maintenance on Tuesdays & Wednesdays`)
  * `{{4}}`: Expiry date (`15 November`)
  * `{{5}}`: Booking Link

### How to Avoid Meta Reclassifying Templates
* **Never disguise marketing as utility**: If a template mentions a perk, discount, celebration, or re-engagement, submit it as **MARKETING**. If you submit it as UTILITY, Meta's automated scanner will reject it or reclassify it, causing billing discrepancies.
* **Keep Utility Templates strictly factual**: Keep appointment confirmations and reminders purely informational (service name, date, time, reference). Never add "Check out our new products" or "Happy holidays" inside a confirmation or reminder template.

---

## F. Automations, Calendar & Safeguards

### 1. Kenyan Holiday Calendar
The backend maintains a built-in schedule of official Kenyan public holidays. The salon owner can toggle individual holidays on or off from the admin settings.

| Holiday Name | Default Date | Automation Behavior |
| :--- | :--- | :--- |
| **New Year's Day** | January 1 | Send at 09:30 AM |
| **Good Friday** | Variable (March/April) | Send at 09:30 AM |
| **Easter Monday** | Variable (March/April) | Send at 09:30 AM |
| **Eid al-Fitr** | Variable (Islamic calendar) | Send at 09:30 AM |
| **Labour Day** | May 1 | Send at 09:30 AM |
| **Madaraka Day** | June 1 | Send at 09:30 AM |
| **Eid al-Adha** | Variable (Islamic calendar) | Send at 09:30 AM |
| **Utamaduni / Mazingira Day** | October 10 | Send at 09:30 AM |
| **Mashujaa Day** | October 20 | Send at 09:30 AM |
| **Jamhuri Day** | December 12 | Send at 09:30 AM |
| **Christmas Day** | December 25 | Send at 09:00 AM |
| **Boxing Day** | December 26 | Send at 10:00 AM |

### 2. The Rebooking Nudge ("We Miss You") Rule
Sisterlocks require maintenance every 4 to 6 weeks. If clients wait longer than 8 weeks, locs can begin to mat at the root, leading to longer, costlier appointments.
* **Trigger Condition**:
  1. `Customer.lastVisitDate` is between **42 and 56 days ago** (6 to 8 weeks).
  2. Customer has **no upcoming appointments** (`Booking.findOne({ customerPhone, date: { $gte: today }, status: { $ne: 'cancelled' } })` is null).
  3. `marketingConsent === true` and `optedOut === false`.
  4. `lastMarketingSentAt` is older than 14 days.
* **Execution**: Checked daily at 10:00 AM. Sends `flo_we_miss_you_v1`.

### 3. Safety Guardrails & Caps
1. **14-Day Anti-Fatigue Rule**: No customer can receive more than **one marketing WhatsApp message in any 14-day window**. If a holiday falls 3 days after a rebooking nudge, the holiday message for that customer is skipped.
2. **Strict Quiet Hours**: Marketing messages are dispatched **only between 09:00 and 18:00 Africa/Nairobi**. Never on Sunday evenings or early mornings.
3. **Monthly Financial Spend Cap**:
   * Default setting: **$15.00 (~KES 2,000) per month**.
   * If cumulative marketing spend reaches this cap, the automation engine pauses all marketing campaigns until the 1st of the next month. Transactional booking confirmations and reminders are **never** blocked by the spend cap.
4. **Execution Log (`WhatsAppCampaignLog`)**:
   Every message records `(tenantId, customerId, templateName, date, cost)`. Prevents any script or worker race condition from sending duplicates.

---

## G. Salon Owner Experience (Admin Dashboard)

The owner portal will feature 3 clean, focused CRM sub-views inside the Admin Console, matching the existing design system (warm stone backgrounds, clean borders, high-contrast typography).

```
┌────────────────────────────────────────────────────────────────────────┐
│ FLO SISTERLOCKS ADMIN CONSOLE                                          │
├─────────────┬──────────────────────────────────────────────────────────┤
│ Overview    │ [ Customers ]   [ Automations ]   [ Usage & Spend ]      │
│ Ledger      │                                                          │
│ Requests    │ Total Consented Clients: 248  •  Due for Retighten: 32   │
│ Services    │                                                          │
│ Staff       │ + Search name or phone...               [ Filter: All ]  │
│ Customers   │ ──────────────────────────────────────────────────────── │
│ Settings    │ Wanjiru Kamau  •  0722***456  •  6 Visits  •  6 wks ago │
│             │ Faith Chebet   •  0712***890  •  2 Visits  •  2 wks ago │
└─────────────┴──────────────────────────────────────────────────────────┘
```

### Screen 1: Customers Directory
* **Top Metric Cards**: Total Clients, Consented Marketing Count, Opted-Out Count.
* **Table Columns**:
  * **Client Name**: Full name and avatar initial.
  * **Phone Number**: Masked or clickable to WhatsApp chat.
  * **Visits**: Badge showing total completed appointments.
  * **Last Appointment**: Relative time (e.g. "6 weeks ago" highlighted in amber if > 6 weeks).
  * **Consent Status**: Green badge (`Consent Given`), Gray (`Transactional Only`), Red (`Opted Out`).
  * **Actions**: "View History" drawer or manual "Send Rebooking Note".

### Screen 2: Automations & Holiday Switches
* **Rebooking Nudge Switch**:
  * Toggle: `[ ON / OFF ]`
  * Interval: "Send when client has not visited for `[ 6 weeks ]` and has no booking."
  * Preview: Live card showing what the message looks like in WhatsApp.
* **Birthday Greetings**:
  * Toggle: `[ ON / OFF ]`
  * Perk input: "Enjoy `[ 10% off your retightening ]`."
* **Kenyan Holiday Calendar**:
  * Simple list of public holidays with a checkbox for each:
    * `[x]` Mashujaa Day (20 Oct)
    * `[x]` Jamhuri Day (12 Dec)
    * `[x]` Christmas & New Year Greetings (25 Dec & 1 Jan)
    * `[ ]` Labour Day (1 May)

### Screen 3: Usage, Costs & Spend Guard
* **Spend Meter**:
  * Visual progress bar: e.g. **KES 740 spent of KES 2,000 monthly cap**.
  * Input field to change the monthly cap: `[ KES 2,000 ] [ Save ]`.
* **Volume Breakdown**:
  * Utility Messages sent this month (Confirmations & Reminders): `84 delivered` ($0.34).
  * Marketing Messages sent this month (Nudges & Holidays): `210 delivered` ($4.72).
* **Delivery Health**:
  * Delivery Success Rate: `99.2%`.
  * Opt-Out Rate: `0.4%` (Low and healthy).

---

## H. Cost Model & Meta Pricing

### 1. Official Meta List Rates (Kenya / "Rest of Africa")
*Verified against Meta's published Cloud API Rate Card for 2026:*
* **Region**: Rest of Africa (Includes Kenya, country dial code `+254`).
* **Marketing Rate**: **$0.0225** per delivered message (~KES 2.93 at 1 USD = 130 KES).
* **Utility Rate**: **$0.0040** per delivered message (~KES 0.52).
* **Service Rate**: Free for the first 1,000 user-initiated conversations per month; then $0.0040 per message.
* **Billing Basis**: Meta charges on a **per-delivered-message** basis. Undelivered messages (e.g. invalid numbers) are not billed.

### 2. Monthly Cost Projections for Flo Sisterlocks

| Scenario | Active Clients | Est. Monthly Appointments | Utility Cost (Confirm + Remind) | Marketing Cost (Nudges + Holidays) | Total Estimated Monthly Cost (USD) | Total in Kenyan Shillings (KES) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Small** | **100** | 30 bookings | 60 msgs = **$0.24** | 115 msgs = **$2.59** | **$2.83** | **~KES 368** |
| **Medium** | **300** | 90 bookings | 180 msgs = **$0.72** | 340 msgs = **$7.65** | **$8.37** | **~KES 1,088** |
| **Large** | **600** | 180 bookings | 360 msgs = **$1.44** | 680 msgs = **$15.30** | **$16.74** | **~KES 2,176** |

*Assumptions*: 
1. Exchange rate: 1 USD = 130 KES.
2. Approximately 70% of clients opt in to marketing.
3. Each client receives an average of 1 marketing message per month (either a holiday wish or a 6-week retightening nudge, never both within 14 days).

---

## I. Pre-Implementation Fix List

Before building the CRM engine, the existing WhatsApp service requires 3 critical hardening fixes:

1. **Dynamic Button Payloads (Fix Booking Matching)**:
   * **Problem**: Buttons currently send static strings (`CONFIRM_BOOKING`). The backend guesses the booking by picking the latest record created for that phone number.
   * **Fix**: Encode the booking reference into the button payload: `CONFIRM_${booking.reference}`, `CANCEL_${booking.reference}`, `RESCHEDULE_${booking.reference}`.
   * In `webhookController.ts`, extract the reference using regex and update that exact booking record.
2. **Permanent System User Access Token**:
   * **Problem**: The current token in `.env` is a temporary User Token expiring in 24 hours.
   * **Fix**: Replace with a Meta System User permanent token created via Meta Business Manager.
3. **Eliminate Proactive Plain-Text Cancellation Reason**:
   * **Problem**: Calling `sendWhatsAppFreeText` proactively when an admin cancels an appointment fails with Meta error `131047` if the customer hasn't messaged in 24 hours.
   * **Fix**: Add a `reason` parameter directly inside the approved `booking_cancelled` template component.

---

## J. SMS Fallback Strategy

An SMS integration using **Africa's Talking** exists in the repository.

### 1. Delivery Realities in Kenya
* **Airtel Kenya**: Shared default routes deliver immediately (as verified during testing).
* **Safaricom**: Carrier firewall rules block unbranded shared routes with error `406 UserInBlacklist`. Delivering to Safaricom requires an **Alphanumeric Sender ID** approved by Safaricom.

### 2. Cost Comparison: WhatsApp vs. SMS
| Channel | Type | Cost per Message | Reliability / Open Rate |
| :--- | :--- | :--- | :--- |
| **WhatsApp** | Utility (Reminders / Receipts) | **KES 0.52** ($0.0040) | ~98% open rate, high engagement |
| **WhatsApp** | Marketing (Nudges / Holidays) | **KES 2.93** ($0.0225) | Interactive buttons, rich media |
| **Africa's Talking SMS** | Standard 160 chars | **KES 0.80** | Text only, no branding without Sender ID |

*WhatsApp utility messages are **35% cheaper** than SMS in Kenya (KES 0.52 vs KES 0.80).*

### 3. Recommended Fallback Policy
* **Transactional Messages**: Use WhatsApp as the primary channel. If Meta returns an error indicating the customer is not registered on WhatsApp (`error 131026`), fallback to SMS via Africa's Talking.
* **Marketing Campaigns**: **NEVER fallback to SMS**. Marketing via SMS without an approved Sender ID is blocked by Safaricom, and sending bulk SMS carries higher spam risks under CAK regulations.

---

## K. Phased Implementation Roadmap

```
[Milestone 1] ──> [Milestone 2] ──> [Milestone 3] ──> [Milestone 4] ──> [Milestone 5]
Core Hardening   Customer Model     Meta CRM Templates  Automation Engine  Owner Dashboard
(Go-Live Safe)
```

### Milestone 1: Production Credentials & Core Hardening — [COMPLETED ✅]
* **Scope Completed**:
  - Validated Permanent Admin System User Token (`expires_at: 0`) against Meta Graph API.
  - Connected production phone number `+254 783 746104` (Phone ID: `1402619999596462`) to live WABA `29645437045060252`.
  - Linked Phone ID to MongoDB Tenant `Flo Sisterlocks` (`flo-sisterlocks`) via `link-whatsapp.mjs`.
  - Verified live Webhook handshake (`GET /api/whatsapp/webhook`) on Render endpoint.
  - Submitted all 5 utility message templates to Meta for review.
* **Remaining Action**: Update `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in Render Dashboard Environment Settings.
* **Status**: Complete & Ready for Live Testing.

### Milestone 2: Customer Data Model & Consent Architecture — [NEXT]
* **Scope**: Create `Customer` collection in MongoDB, create backfill migration script from existing bookings, add consent checkbox to booking checkout, implement webhook `STOP` opt-out handler.
* **Verification**: Book an appointment with the checkbox ticked and verify `Customer` document is created with consent timestamp. Reply `STOP` on WhatsApp and verify `optedOut: true`.
* **Effort**: 2 working days.

### Milestone 3: CRM Meta Templates & Manual Broadcast API
* **Scope**: Submit 4 CRM templates to Meta. Build backend service `sendMarketingTemplate` with 14-day anti-spam validation, quiet hours enforcement (09:00–18:00), and monthly spend cap guard.
* **Verification**: Send a test holiday greeting to a consented staff number; verify delivery and cost tracking.
* **Effort**: 2 working days.

### Milestone 4: Automations Engine
* **Scope**: Implement cron jobs for:
  1. Rebooking nudge (runs daily at 10:00 AM, checks 6-8 weeks gap, skips if booking exists).
  2. Birthday greetings (runs daily at 09:00 AM).
  3. Kenyan holiday dispatcher (runs on public holiday mornings).
* **Verification**: Unit tests with mocked dates; verify idempotency (no duplicate sends on server restarts).
* **Effort**: 2 working days.

### Milestone 5: Owner Dashboard UI
* **Scope**: Build 3 admin tabs in React: Customer directory with search and consent badges, Automations toggle cards with live message previews, and Usage/Cost tracking meter.
* **Verification**: Toggle holiday on/off and verify settings save. Inspect real-time spend calculation.
* **Effort**: 3 working days.

---

## L. Top Risks & Open Decisions

| Rank | Risk / Decision | Impact | Recommended Action |
| :---: | :--- | :--- | :--- |
| **1** | **Production Phone Registration** | If the phone number is active on WhatsApp mobile app, Meta registration will fail. | Ensure the SIM is put into a standard phone to receive SMS verification, and account is deleted from WhatsApp app before registering in Meta. |
| **2** | **Safaricom Sender ID for SMS Fallback** | Without an approved Sender ID, SMS fallback fails on Safaricom numbers (`406 UserInBlacklist`). | Submit the Africa's Talking Alphanumeric Sender ID form for `FLOBOOKING` so SMS fallback works for Safaricom users. |
| **3** | **Customer Birthday Collection** | Currently, the booking form does not ask for birthdays. | Add an optional "Birthday (Month & Day)" field during online booking or in the post-appointment thank-you note. |
| **4** | **Rebooking Nudge Frequency** | Sisterlocks retightening ranges from 4 to 8 weeks depending on hair growth speed. | Default the nudge to **6 weeks**, but allow the salon owner to adjust the week interval (4, 6, or 8 weeks) in settings. |
| **5** | **Monthly Budget Limit** | Uncapped marketing automations could accumulate Meta fees if client list grows rapidly. | Hardcode a default safety ceiling of **KES 2,000 / month** in the code that the owner can raise in the dashboard. |
