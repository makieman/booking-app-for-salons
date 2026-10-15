# Admin Operations & Schedule Management: Comprehensive Architecture & Fix Plan

## Executive Summary
This document provides a verified architectural analysis and phased implementation plan to transform the admin side of the multi-tenant salon booking application (React 19 + Vite + Tailwind v4 frontend, Express + TypeScript + MongoDB backend). 

Currently, `AdminView` is an monolithic component spanning ~1,900 lines embedded inside a 5,039-line [`frontend/src/App.tsx`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx). It suffers from critical operational limitations: confirmed bookings are confined to a single day's read-only ledger with no date navigation, no week view, no per-stylist columns, no administrative reschedule/cancel/complete capabilities, no walk-in/phone creation, and silent data-staleness bugs.

This plan details the verified findings, the new minimal-design admin user experience, and an incremental 4-phase rollout designed so every phase is independently testable, backward-compatible, and shippable.

---

## 1. Verified Findings Matrix

| ID | Area | Severity | File & Line Evidence | Status | Impact / Description |
|---|---|---|---|---|---|
| **1** | Schedule View | **High** | [`frontend/src/App.tsx:2341-2342`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2341-L2342), [`3064-3135`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L3064-L3135) | **CONFIRMED** | Ledger strictly filters `b.date === todayStr && b.status === 'confirmed'`. No date picker, no forward/backward date navigation, no week view, no multi-column view per stylist. |
| **2** | Booking Actions | **High** | [`backend/controllers/adminController.ts:47-49`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts#L47-L49), [`frontend/src/App.tsx:3051-3140`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L3051-L3140) | **CONFIRMED** | Admin PATCH endpoint enforces `['confirmed', 'cancelled']`. The Ledger data table has no action buttons. Admins cannot reschedule, cancel confirmed bookings, mark as completed, or mark no-show. |
| **3** | Walk-in Booking | **High** | [`backend/routes/adminRoutes.ts:14-20`](file:///d:/booking%20app/booking%20app/backend/routes/adminRoutes.ts#L14-L20), [`frontend/src/App.tsx:2239-4130`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2239-L4130) | **CONFIRMED** | No route, controller, or UI exists for an admin to enter a walk-in, phone call, or in-person appointment. Admin must sign out to use client booking flow. |
| **4** | Completed Bookings Disappear | **Medium** | [`frontend/src/App.tsx:2342`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2342), [`backend/models/Booking.ts:33`](file:///d:/booking%20app/booking%20app/backend/models/Booking.ts#L33) | **CONFIRMED** | Ledger filters exclusively for `b.status === 'confirmed'`. When a stylist marks an appointment complete (`status: 'completed'`), the booking vanishes from the Ledger immediately. |
| **5** | Search & Filtering | **Medium** | [`frontend/src/App.tsx:2921-3143`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2921-L3143), [`3145-3300`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L3145-L3300) | **CONFIRMED** | Neither the Daily Ledger nor Pending Requests provides search inputs or dropdown filters for client name, phone, stylist, service, date, or status. |
| **6** | Availability Granularity | **High** | [`backend/models/Tenant.ts:97-100`](file:///d:/booking%20app/booking%20app/backend/models/Tenant.ts#L97-L100), [`backend/services/slotService.ts:25-58, 193`](file:///d:/booking%20app/booking%20app/backend/services/slotService.ts#L25-L58), [`backend/models/Attendant.ts:1-64`](file:///d:/booking%20app/booking%20app/backend/models/Attendant.ts#L1-L64) | **CONFIRMED** | Working hours exist only on `Tenant` (`start: '09:00', end: '18:00'`). `Attendant` has zero working hour/schedule fields. No breaks, holidays, or blocked times exist. Slot generator increments by a hardcoded 30 min (`currentSlot.plus({ minutes: 30 })`) with no buffer or lead time. |
| **7** | Full Unpaginated Fetch | **Medium** | [`backend/controllers/adminController.ts:26-30`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts#L26-L30), [`frontend/src/App.tsx:2260-2271`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2260-L2271) | **CONFIRMED** | `GET /api/admin/bookings` runs `Booking.find(query).sort({ createdAt: -1 })` without `skip` or `limit`. The admin loads the salon's entire historical database into memory on initial mount. |
| **8** | Stale Dashboard Stats | **Medium** | [`frontend/src/App.tsx:2408-2423`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2408-L2423), [`frontend/src/components/SalonDashboard.tsx:21-27`](file:///d:/booking%20app/booking%20app/frontend/src/components/SalonDashboard.tsx#L21-L27) | **CONFIRMED** | When an admin confirms or declines a booking in `handleStatusUpdate`, `setPendingBookings` and `setConfirmedBookings` update, but `allTenantBookings` (passed into `SalonDashboard`) is omitted. Dashboard metrics remain stale. |
| **9** | Service Saving Spinner Broken | **Low** | [`frontend/src/App.tsx:2425-2446`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2425-L2446), [`3318`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L3318), [`3366-3374`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L3366-L3374) | **CONFIRMED** | In `handleServiceEdit`, `setSavingPrice(serviceId)` is never invoked. `isSaving` is computed as `savingPrice === service._id`, so it is always `false`. Save spinner never renders, button is not disabled during save. |
| **10** | UTC Date vs Nairobi Timezone | **High** | [`frontend/src/App.tsx:2341, 4145, 215, 342, 647, 907, 1867, 2217`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2341), [`DateTimeSelectionScreen.tsx:32`](file:///d:/booking%20app/booking%20app/frontend/src/components/DateTimeSelectionScreen.tsx#L32) vs [`SalonDashboard.tsx:14-19, 33`](file:///d:/booking%20app/booking%20app/frontend/src/components/SalonDashboard.tsx#L14-L19) | **CONFIRMED** | `new Date().toISOString().split('T')[0]` returns the UTC date. In Kenya (UTC+3), between 00:00 and 03:00 local time, UTC is still the previous day. `SalonDashboard` uses local `d.getFullYear()`, `d.getMonth() + 1`, `d.getDate()`. They disagree by 1 full day for 3 hours every night. |
| **11** | Group Booking Segment Fragmentation | **Medium** | [`frontend/src/App.tsx:3167-3273`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L3167-L3273), [`2413`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2413), [`backend/controllers/adminController.ts:63-67`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts#L63-L67) | **CONFIRMED** | Multi-service appointments produce multiple booking docs with identical `groupId`. In Pending Requests, each segment renders as an isolated card. Displayed price is only the segment base price. Confirming one card updates all segments in the DB, but local state only removes the clicked card. |
| **12** | Race Conditions in Overlap & Admin Confirmation | **High** | [`backend/controllers/bookingController.ts:66-70, 97-112, 170-224`](file:///d:/booking%20app/booking%20app/backend/controllers/bookingController.ts#L66-L70), [`backend/controllers/adminController.ts:42-60`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts#L42-L60) | **CONFIRMED** | `Booking.find` followed by in-memory conflict check and `doc.save` is vulnerable to TOCTOU race conditions. No compound unique index on `(tenantId, attendantId, date, startTime)` exists. Furthermore, `adminController.updateBookingStatus` blindly flips status to `confirmed` without checking if another booking took the slot. |
| **13** | Visual Clutter & Micro-Typography | **Medium** | [`frontend/src/App.tsx:2509, 2540, 2563, 2722, 3129, etc.`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2509) | **CONFIRMED** | Over 170 occurrences of `text-[9px]`, `text-[10px]`, and `text-[11px]` with heavy letter-spacing (`tracking-[0.2em]...[0.4em]`) exist. Excessive bouncing bells, pulsing badges, and emojis (`🎵`, `✨`, `🛎️`) undermine professional density. #B08968 on cream (#FAF7F3) has a contrast ratio of ~2.8:1 (fails WCAG AA 4.5:1). |
| **14** | Misleading Color Token Names | **Low** | [`frontend/src/index.css:16-33`](file:///d:/booking%20app/booking%20app/frontend/src/index.css#L16-L33) | **CONFIRMED** | `--color-brand-gray-300: #B08968;` is warm wood/tan, not gray. `--color-brand-sage: #B08968;` is brown/tan, not sage green. `--color-brand-white` and `--color-brand-gray-50` are both `#FAF7F3`. |
| **15** | Mobile Navigation Concealment | **Medium** | [`frontend/src/App.tsx:2485-2486, 2680-2760`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2485-L2486) | **CONFIRMED** | Mobile nav splits tabs into `primaryTabs` (first 3) and `moreTabs` (Services, Staff, Settings), burying crucial operational tools inside a nested popup menu. |
| **16** | Monolithic Codebase & Missing Tab Routing | **High** | [`frontend/src/App.tsx:2239-4132`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2239-L4132) | **CONFIRMED** | `AdminView` contains 1,894 lines in a single component. Tab state is local component memory (`activeTab`). Page refresh always forces users back to the dashboard, losing deep-link context. |
| **17** | Silent Error Swallowing in Admin Actions | **Medium** | [`frontend/src/App.tsx:2418-2420`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx#L2418-L2420) | **CONFIRMED (Additional)** | When `updateBookingStatus` fails (e.g., network failure, 500 server error, expired token), `handleStatusUpdate` catches the error and executes `console.error` only. No toast or visual feedback is provided; the action button simply resets silently. |
| **18** | Missing Cancellation Reason Flow | **Low** | [`backend/controllers/adminController.ts:109-137`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts#L109-L137) | **CONFIRMED (Additional)** | When an admin cancels a booking, no cancellation reason or note can be supplied. Customers receive a generic cancellation notice with zero context. |
| **19** | Destructive Staff Deletion Breaks Historical Records | **Medium** | [`backend/controllers/staffController.ts:138-149`](file:///d:/booking%20app/booking%20app/backend/controllers/staffController.ts#L138-L149) | **CONFIRMED (Additional)** | `deleteAttendant` executes `findOneAndDelete`. Any historical bookings referencing this `attendantId` now populate to `null`, displaying "Unassigned" in audit logs and analytics. |

---

## 2. Target Admin Design

The target admin experience replaces the disjointed tabs and inert tables with an integrated studio management workspace. 

### Visual Identity & Design Principles
- **Minimal, Restrained Palette**: Replace tan "gray" tokens with genuine neutral slates (`#0F172A`, `#334155`, `#64748B`, `#F8FAFC`, `#FFFFFF`) with subtle warm accents only on brand surfaces.
- **Typographic Rigor**: Standardize on standard body sizes: 13px–15px for dense tables and controls, 11px–12px uppercase for table headers and metadata with restrained tracking (`tracking-wider` or `0.05em`). Eradicate 9px micro-type and illegible tan-on-cream text.
- **High-Density, Zero Fluff**: Eliminate pulsing emojis, swinging elements, and unnecessary bounce keyframes. Statuses use crisp, high-contrast, accessible badges (`Confirmed` = neutral emerald, `Pending` = warm amber, `Cancelled` = muted rose, `Completed` = slate blue, `No-Show` = neutral gray).

### Key Architectural Views
1. **Interactive Schedule View (Replacing Static Ledger)**:
   - **Day View (Per-Stylist Columns)**: The default operations view. A time axis (e.g. 08:00 to 20:00 in configurable intervals) with a dedicated vertical column for each active attendant, plus an "Unassigned" column.
   - **Week View**: A 7-day overview showing appointment counts and hourly density bars to gauge workload across the week.
   - **Date Bar**: Quick controls for **[Today]**, **[< Prev]**, **[Next >]**, an explicit date picker input, and an attendant multi-select filter.
2. **Booking Detail & Action Drawer**:
   - Clicking any appointment card or table row slides open a focused detail panel.
   - Displays client contact, reference ID, group segments, notes, and pricing breakdown.
   - Immediate actions:
     - **Confirm**: Verifies slot availability before executing; prevents double-booking.
     - **Reschedule**: Date/time/stylist picker with real-time overlap validation.
     - **Cancel**: Allows the admin to specify an optional cancellation reason sent to the customer via SMS/WhatsApp/Email.
     - **Mark Completed**: Records service completion and records attendance.
     - **Mark No-Show**: Flags customer attendance without blocking historical slot auditing.
3. **Walk-in & Phone Booking Modal**:
   - Easily accessible from a global `+ New Booking` button at the top of the admin interface.
   - Allows instant entry of customer name, phone, optional email, service(s), stylist assignment, date, and start time.
   - Offers a toggle: `"Mark Confirmed Immediately (Walk-in / Phone)"` or `"Leave as Pending Request"`.
4. **Staff Availability & Exception Management**:
   - Per-stylist custom working hours (overriding salon defaults).
   - Lunch break / daily rest interval configuration.
   - Time-off and vacation blocking (single date or range).

---

## 3. Phased Implementation Plan

### Phase 1: Architectural Modularization, Bug Fixes & Design Tokens
*Goal: De-monolith `AdminView`, repair stale state bugs, standardize date handling to Nairobi timezone, and establish clean typographic/color tokens.*

#### Tasks
1. **Token & CSS Clean-up**:
   - In [`frontend/src/index.css`](file:///d:/booking%20app/booking%20app/frontend/src/index.css), rename confusing color aliases (`--color-brand-gray-300`, `--color-brand-sage`). Establish a semantic palette (`--color-surface`, `--color-surface-subtle`, `--color-border`, `--color-text-main`, `--color-text-muted`, `--color-status-*`).
   - Remove 9px font utilities and excessive tracking.
2. **Modularize Admin View**:
   - Extract `AdminView` into dedicated files under `frontend/src/components/admin/`:
     - `AdminLayout.tsx` (sidebar, mobile navigation, top bar, push notification banner)
     - `AdminDashboardTab.tsx` (analytics overview wrapper)
     - `AdminScheduleTab.tsx` (ledger/calendar schedule view)
     - `AdminRequestsTab.tsx` (pending queue management)
     - `AdminServicesTab.tsx` (service catalog & pricing)
     - `AdminStaffTab.tsx` (staff accounts & PIN management)
     - `AdminSettingsTab.tsx` (salon profile, branding, working hours)
3. **Fix Date Utility (Nairobi Timezone)**:
   - Create `frontend/src/utils/dateUtils.ts` providing `getNairobiDateString(d?: Date): string` using `Intl.DateTimeFormat` with `timeZone: 'Africa/Nairobi'` (or tenant timezone).
   - Replace all `new Date().toISOString().split('T')[0]` occurrences in `App.tsx`, `DateTimeSelectionScreen.tsx`, and admin views.
4. **Fix Stale Dashboard State**:
   - In `handleStatusUpdate`, ensure `setAllTenantBookings(prev => prev.map(b => ...))` updates alongside `pendingBookings` and `confirmedBookings`.
5. **Fix Service Save Spinner**:
   - In `handleServiceEdit`, invoke `setSavingPrice(serviceId)` at the start of the request.
6. **Fix Group Booking Pending Cards**:
   - Group pending bookings by `groupId` (or `reference`). Render a unified card displaying all segments, combined duration, stylist assignments, and total group price. Confirming or declining updates all items in local state at once.
7. **URL-based Sub-tab Navigation**:
   - Sync active tab with URL query parameter (`?tab=schedule`, `?tab=requests`, etc.) so refreshing does not reset to the dashboard.

#### Files Touched
- [`frontend/src/index.css`](file:///d:/booking%20app/booking%20app/frontend/src/index.css)
- [`frontend/src/utils/dateUtils.ts`](file:///d:/booking%20app/booking%20app/frontend/src/utils/dateUtils.ts) *(new)*
- `frontend/src/components/admin/*` *(new components)*
- [`frontend/src/App.tsx`](file:///d:/booking%20app/booking%20app/frontend/src/App.tsx)

#### API & Schema Changes
- None (pure frontend refactor & bug fix).

#### Risks & Effort
- *Risks*: State regressions during component extraction.
- *Effort*: **Medium (M)**.
- *Acceptance Criteria*:
  - Admin view split into distinct component files; `App.tsx` reduced by ~1,800 lines.
  - Between 00:00 and 03:00 Nairobi time, dashboard and ledger display the correct calendar day.
  - Service price edit button shows spinner while saving and disables button.
  - Multi-segment pending appointments show as a single grouped request card.
  - Tab state persists across page reload.

---

### Phase 2: Interactive Schedule View & Booking Detail/Action Panel
*Goal: Replace the single-day read-only table with an interactive multi-view schedule and complete booking lifecycle actions (confirm, reschedule, cancel, complete, no-show).*

#### Tasks
1. **Backend Admin Action Expansion**:
   - Update `PATCH /api/admin/bookings/:id` in [`backend/controllers/adminController.ts`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts):
     - Support statuses: `'confirmed' | 'cancelled' | 'completed' | 'no-show'`.
     - Support payload fields: `reason?: string`, `reschedule?: { date: string; startTime: string; attendantId?: string }`.
     - In case of confirmation or reschedule, execute an explicit overlap check to reject conflicting bookings with `409 Conflict`.
     - When marking `cancelled`, persist optional `cancellationReason` on the booking document and include it in email/WhatsApp notifications.
   - Update `Booking` Mongoose model:
     - Expand `status` enum to `['pending', 'confirmed', 'cancelled', 'completed', 'no-show']`.
     - Add `cancellationReason?: string`, `completedAt?: Date`.
2. **Interactive Schedule Component (`AdminScheduleTab.tsx`)**:
   - **Date Navigator**: `[Today]`, date picker input, previous/next day buttons.
   - **View Switcher**: Day View (Stylist Columns), List/Ledger View, and Week Summary View.
   - **Stylist Day Columns**: Vertical timeline grid mapping active stylists side-by-side. Slots display appointment cards color-coded by status.
   - Include bookings with status `confirmed`, `completed`, and `no-show` (with status-specific visual treatments).
3. **Booking Detail Drawer (`BookingDetailDrawer.tsx`)**:
   - Slide-over panel triggered by clicking any booking in the schedule.
   - Complete metadata: client name, telephone (with click-to-call / click-to-WhatsApp link), service list, pricing, group reference.
   - Action buttons:
     - `[Confirm]` (if pending)
     - `[Reschedule]` (opens inline time/stylist selector)
     - `[Mark Completed]` (marks service finished)
     - `[Mark No-Show]` (records no-show)
     - `[Cancel Appointment]` (prompts for cancellation reason)

#### Files Touched
- [`backend/models/Booking.ts`](file:///d:/booking%20app/booking%20app/backend/models/Booking.ts)
- [`backend/controllers/adminController.ts`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts)
- [`backend/services/emailService.ts`](file:///d:/booking%20app/booking%20app/backend/services/emailService.ts)
- [`backend/services/whatsappService.ts`](file:///d:/booking%20app/booking%20app/backend/services/whatsappService.ts)
- [`frontend/src/api/client.ts`](file:///d:/booking%20app/booking%20app/frontend/src/api/client.ts)
- [`frontend/src/types.ts`](file:///d:/booking%20app/booking%20app/frontend/src/types.ts)
- `frontend/src/components/admin/AdminScheduleTab.tsx`
- `frontend/src/components/admin/BookingDetailDrawer.tsx`

#### API & Schema Changes
```typescript
// Mongoose BookingSchema update
status: {
  type: String,
  enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
  default: 'pending',
},
cancellationReason: { type: String, default: null },
completedAt: { type: Date, default: null }
```

#### Risks & Effort
- *Risks*: Modifying booking status enum requires auditing attendant app queries (`AttendantView` also uses `status: 'completed'`).
- *Effort*: **Large (L)**.
- *Acceptance Criteria*:
  - Admin can navigate to any date (past or future) and view all scheduled appointments.
  - Day view renders a column per stylist with time-aligned appointment cards.
  - Admin can reschedule any booking to a free slot without conflicts.
  - Admin can complete or cancel bookings directly from the schedule. Completed appointments stay visible in the schedule with a completed badge.

---

### Phase 3: Walk-in/Phone Booking Creation, Search, Filters & Scoped Pagination
*Goal: Enable admins to book appointments directly for walk-in or telephone clients, and implement server-scoped search and date-range filtering.*

#### Tasks
1. **Admin Booking Creation Endpoint**:
   - Create `POST /api/admin/bookings` in [`backend/controllers/adminController.ts`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts).
   - Reuses `slotService` validation and overlap checks, but allows:
     - Direct creation in `confirmed` status (or `pending`).
     - Optional client email (phone and name required).
     - Custom notes / walk-in tags.
     - Dispatches confirmation notifications (SMS/WhatsApp/Push) unless flagged as silent.
2. **Walk-in Modal (`AdminCreateBookingModal.tsx`)**:
   - Fast, keyboard-accessible booking form:
     - Client Name & Phone Number.
     - Service selector (single or multi-service).
     - Stylist assignment (or auto-assign).
     - Date & time slot picker.
     - Checkbox: "Send confirmation SMS / WhatsApp to customer" (default checked).
3. **Server-Side Date-Range & Search API**:
   - Enhance `GET /api/admin/bookings` with query params:
     - `startDate=YYYY-MM-DD` & `endDate=YYYY-MM-DD`
     - `search=string` (matches customerName, phone, reference)
     - `stylistId=string`
     - `status=string`
     - `page=number` & `limit=number` (default limit 50, maximum 200)
   - Add MongoDB compound indexes:
     - `{ tenantId: 1, date: 1, status: 1 }`
     - `{ tenantId: 1, customerName: 'text', phone: 'text', reference: 'text' }` (or regex prefix search index)
4. **Admin Search & Filter Bar**:
   - Search input across all bookings by name, phone, or reference.
   - Quick filters: Stylist dropdown, Service dropdown, Status pill filters (`All`, `Pending`, `Confirmed`, `Completed`, `Cancelled`, `No-Show`).

#### Files Touched
- [`backend/controllers/adminController.ts`](file:///d:/booking%20app/booking%20app/backend/controllers/adminController.ts)
- [`backend/routes/adminRoutes.ts`](file:///d:/booking%20app/booking%20app/backend/routes/adminRoutes.ts)
- [`backend/models/Booking.ts`](file:///d:/booking%20app/booking%20app/backend/models/Booking.ts)
- [`frontend/src/api/client.ts`](file:///d:/booking%20app/booking%20app/frontend/src/api/client.ts)
- `frontend/src/components/admin/AdminCreateBookingModal.tsx` *(new)*
- `frontend/src/components/admin/AdminScheduleTab.tsx`

#### Risks & Effort
- *Risks*: Ensuring walk-in creation does not bypass tenant isolation or concurrency locks.
- *Effort*: **Medium (M)**.
- *Acceptance Criteria*:
  - Admin can create an appointment for a walk-in client in under 20 seconds.
  - Searching by phone or reference instantly locates past and future appointments.
  - Network requests fetch only the active date window rather than full history.

---

### Phase 4: Granular Stylist Availability, Breaks, Holidays & Slot Engine Overhaul [COMPLETED & VERIFIED]
*Goal: Support per-stylist schedules, recurring breaks, days off, holiday time blocks, slot buffer times, and minimum booking notice.*

#### Tasks
1. **Attendant Availability Schema Expansion**:
   - In [`backend/models/Attendant.ts`](file:///d:/booking%20app/booking%20app/backend/models/Attendant.ts), add:
     - `schedule`: Weekly schedule per day-of-week (Mon–Sun) with `isWorkingDay: boolean`, `shifts: [{ start: string, end: string }]`, and `breaks: [{ start: string, end: string, label?: string }]`.
     - `daysOff`: Array of specific dates (`YYYY-MM-DD`) when the attendant is unavailable.
2. **Tenant-Level Schedule Rules**:
   - In [`backend/models/Tenant.ts`](file:///d:/booking%20app/booking%20app/backend/models/Tenant.ts), add:
     - `bookingRules`:
       - `slotInterval`: minutes (`15 | 30 | 45 | 60`, default `30`).
       - `bufferMinutes`: buffer between appointments (default `0`).
       - `minNoticeHours`: minimum advance notice required for online booking (default `2`).
       - `holidays`: Array of dates when the salon is fully closed (`YYYY-MM-DD`).
3. **Slot Engine Overhaul (`slotService.ts`)**:
   - Refactor `generateAvailableSlots` and `generateMultiServiceSlots`:
     - Determine available windows from the attendant's specific shifts minus their breaks and days off.
     - Respect tenant closed dates/holidays.
     - Apply `minNoticeHours` against current timestamp.
     - Apply `bufferMinutes` to service duration.
     - Step through time slots using `slotInterval` rather than hardcoded 30 min.
4. **Attendant Management UI (`AdminStaffTab.tsx`)**:
   - Staff schedule editor: set working days, shift hours, and breaks per stylist.
   - Quick "Mark Day Off" calendar action.
5. **Salon Settings Overhaul (`AdminSettingsTab.tsx`)**:
   - Salon operating hours editor (default salon hours).
   - Booking rules editor: slot interval, buffer time, and minimum booking notice.

#### Files Touched
- [`backend/models/Attendant.ts`](file:///d:/booking%20app/booking%20app/backend/models/Attendant.ts)
- [`backend/models/Tenant.ts`](file:///d:/booking%20app/booking%20app/backend/models/Tenant.ts)
- [`backend/services/slotService.ts`](file:///d:/booking%20app/booking%20app/backend/services/slotService.ts)
- [`backend/controllers/availabilityController.ts`](file:///d:/booking%20app/booking%20app/backend/controllers/availabilityController.ts)
- [`backend/controllers/staffController.ts`](file:///d:/booking%20app/booking%20app/backend/controllers/staffController.ts)
- `frontend/src/components/admin/AdminStaffTab.tsx`
- `frontend/src/components/admin/AdminSettingsTab.tsx`

#### API & Schema Changes
```typescript
// Attendant schema additions
schedule: [{
  dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 = Sun, 1 = Mon...
  isWorkingDay: { type: Boolean, default: true },
  start: { type: String, default: '09:00' },
  end: { type: String, default: '18:00' },
  breaks: [{ start: String, end: String, label: String }],
}],
daysOff: [{ type: String }], // YYYY-MM-DD

// Tenant schema additions
bookingRules: {
  slotInterval: { type: Number, default: 30 },
  bufferMinutes: { type: Number, default: 0 },
  minNoticeHours: { type: Number, default: 2 },
  holidays: [{ type: String }],
}
```

#### Migration Notes
- For existing attendants without `schedule`, fall back seamlessly to tenant `workingHours` (`09:00–18:00`) and Monday–Saturday active.
- For existing tenants without `bookingRules`, apply defaults: `slotInterval: 30`, `bufferMinutes: 0`, `minNoticeHours: 2`.

#### Risks & Effort
- *Risks*: High complexity in slot generation algorithm. Must preserve backward-compatibility with public client booking flow.
- *Effort*: **Large (L)**.
- *Acceptance Criteria*:
  - If a stylist is marked off on a date or on lunch break, slots during that time are not bookable.
  - Buffer time is automatically respected between back-to-back bookings.
  - Admins can configure salon slot intervals (15, 30, 45, or 60 min).

---

## 4. Backend Rules & Invariants to Preserve

1. **Strict Tenant Scoping on Every Operation**:
   - Every MongoDB query and update MUST include `{ tenantId: req.tenant._id }`. Never rely solely on `_id`.
   - Admin JWT authentication must verify `req.owner.tenantId === req.tenant._id`.
2. **Atomic Multi-Service Group Integrity**:
   - A multi-service booking is linked by `groupId` and `reference`.
   - Status updates, cancellations, or reschedules of a group booking must update all segments atomically or roll back.
3. **Unified Notification Pipeline**:
   - When a booking is confirmed, cancelled, or rescheduled by an admin, dispatch notifications via all configured channels (Web Push, Nodemailer Email, and Cloud API WhatsApp).
   - Multi-service bookings MUST send a single consolidated customer notification with the combined price and service list, while sending specific push alerts to each assigned attendant.
4. **Zero Downtime & Backward Compatibility**:
   - Existing bookings in MongoDB (which may lack `groupId`, `groupOrder`, or `cancellationReason`) must load and display properly without schema validation errors.

---

## 5. Comprehensive Test Plan

### Manual Verification Checklist
1. **Schedule Navigation**:
   - Navigate to today, tomorrow, and past dates. Verify bookings match the selected date.
   - Test at 01:00 AM (or by simulating Nairobi timezone) to confirm day alignment.
2. **Booking Lifecycle**:
   - Create pending booking -> Confirm in admin -> Verify it appears on schedule.
   - Reschedule booking to another stylist/time -> Verify customer notification and calendar position.
   - Mark as completed -> Verify booking remains visible with "Completed" indicator.
   - Cancel booking with reason -> Verify customer notification includes reason.
3. **Walk-in Booking**:
   - Enter walk-in booking for today -> Verify it immediately blocks that slot on the public client booking screen.
4. **Concurrency & Conflicts**:
   - Open two tabs; attempt to book or confirm the same stylist for the same slot -> Verify second attempt is cleanly rejected with an informative error toast.

### Automated Test Suite Recommendation
Currently, the codebase has 0 automated tests. We propose adding lightweight tests using Node's built-in test runner or Vitest:
- `backend/tests/slotService.test.ts`: Unit test availability generation, break exclusions, buffer calculations, and multi-service sequencing.
- `backend/tests/adminController.test.ts`: Integration test tenant isolation, status transitions, and group booking updates.
- `frontend/src/utils/dateUtils.test.ts`: Unit test timezone-safe date formatting across Nairobi (UTC+3) and UTC boundaries.

---

## 6. Dependencies Evaluation
- **No Heavy External Calendar Libraries**:
  - Schedulers like FullCalendar or React-Big-Calendar introduce heavy bundle bloat (100KB+), rigid styling that conflicts with Tailwind v4, and poor mobile touch responsiveness.
  - **Recommendation**: Implement a custom lightweight CSS Grid schedule view (~250 lines of React/Tailwind). It offers total control over styling, fluid responsive layouts, and zero third-party dependencies.
- **Date Handling**:
  - `luxon` is already installed and utilized on the backend.
  - The frontend can leverage native modern `Intl.DateTimeFormat` or existing date formatting helpers without adding `date-fns` or `moment`.

---

## 7. Open Questions for the Salon Owner

1. **Cancellation Window & Penalties**: Should there be a cutoff time after which customers cannot cancel online (e.g. within 2 hours of appointment)?
2. **Attendant Permission Scope**: Can attendants see only their own column, or should they be allowed to view the entire salon's schedule?
3. **Buffer Times**: Does the salon want a universal cleaning/prep buffer between appointments (e.g. 10 or 15 minutes), or does buffer time vary by service?
4. **Deposit / Advance Payment**: Are there plans to require M-Pesa deposits for high-value services to combat no-shows?
