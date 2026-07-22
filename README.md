# Salon Booking System

| Customer booking flow | Admin dashboard


Staff members can log in using their own credentials to view their personal dashboard, track their daily and upcoming schedules, and mark appointments as complete.

The app works as a **Progressive Web App (PWA)** — it can be installed on any phone like a native app, works offline (with a fallback UI), and receives push notifications without needing a native app store.

---

## System Design

### Architecture overview

```
┌──────────────────┐        REST API         ┌──────────────────────┐
│   React PWA      │ ──────────────────────► │   Express API        │
│   (Vite + TS)    │ ◄────────────────────── │   (Node + TS)        │
│                  │                         │                      │
│  • 6-step        │                         │  • /bookings         │
│    booking flow  │                         │  • /services         │
│  • Admin panel   │                         │  • /availability     │
│  • Staff portal  │                         │  • /admin/attendants │
│  • Service       │                         │  • /auth             │
│    worker        │                         │  • /push             │
└──────────────────┘                         └──────────┬───────────┘
                                                        │  Mongoose
                                             ┌──────────▼───────────┐
                                             │   MongoDB Atlas      │
                                             │                      │
                                             │  • Booking           │
                                             │  • Service           │
                                             │  • Attendant         │
                                             │  • PushSubscription  │
                                             └──────────────────────┘
                                                        │
                              ┌─────────────────────────┼─────────────────────────┐
                              │                         │                         │
                   ┌──────────▼──────┐      ┌──────────▼──────┐                  │
                   │  Resend (email) │      │  Web Push API   │                  │
                   │                 │      │                 │                  │
                   │  • Booking req  │      │  • Admin alert  │                  │
                   │  • Confirmed    │      │  • Confirmed    │                  │
                   │  • Cancelled    │      │  • Cancelled    │                  │
                   └─────────────────┘      └─────────────────┘                  │
                                                                                  │
                              ┌───────────────────────────────────────────────────▼─┐
                              │  Render (cloud hosting)                              │
                              │  Single web service · Express serves frontend dist   │
                              │  Auto-deploy on git push to main                     │
                              └─────────────────────────────────────────────────────┘
```

### Data models

**Booking**
```typescript
{
  customerName: string
  phone:        string
  email?:       string                // optional, used for email notifications
  serviceId:    ObjectId → Service    // populated on read
  attendantId?: ObjectId → Attendant  // optional/null if "Any Available"
  date:         string                // YYYY-MM-DD
  startTime:    string                // HH:mm
  endTime:      string                // HH:mm  (calculated from service duration)
  status:       'pending' | 'confirmed' | 'cancelled'
  completed:    boolean               // tracks if slot has been serviced
  createdAt:    Date
  updatedAt:    Date
}
```

**Service**
```typescript
{
  name:         string
  duration:     number    // minutes
  price:        number    // KES
  description?: string
  image?:       string    // URL
}
```

**Attendant (Staff)**
```typescript
{
  name:         string    // Display name shown to customers
  username:     string    // Unique login username
  pinHash:      string    // Bcrypt hashed 4-6 digit PIN
  serviceIds:   ObjectId[] → Service // Services this attendant is qualified to do
  isActive:     boolean   // Allows soft deletion/deactivation
  createdAt:    Date
  updatedAt:    Date
}
```

**PushSubscription** — stores browser push subscription objects so the backend can send notifications without the browser being open.

### Slot availability engine

The scheduling logic lives in `backend/services/slotService.ts`. It generates candidate time slots in 30-minute increments between 09:00–18:00 on the selected date.

- **Specific Attendant**: If a customer requests a specific artist, the system checks only that attendant's confirmed and pending bookings to ensure no overlaps occur.
- **Any Available**: If the customer selects "Any Available", the engine performs a unified analysis. It checks if there is *at least one* qualified attendant who is free during the slot, giving customers the maximum possible booking flexibility.

The overlap check uses Luxon intervals: `(slotStart < existingEnd) && (slotEnd > existingStart)`.

### Notification pipeline

Both email and push fire **fire-and-forget** (non-blocking) after a booking is saved, so a failed notification never fails the booking itself.

```
createBooking()
  ├── save to MongoDB
  ├── void sendBookingRequestReceived(...)    → customer email
  ├── void sendAdminNewBookingAlert(...)      → owner email
  ├── void sendPushToPhone(phone, {...})      → customer push
  └── void sendPushToAdmins({...})           → all subscribed admin/staff devices
```

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/services` | List all services |
| `POST` | `/api/services` | Create a service (Owner) |
| `PATCH` | `/api/services/:id` | Update service price/details (Owner) |
| `POST` | `/api/bookings` | Create a booking (validates no overlap) |
| `GET` | `/api/bookings?date=` | List bookings, optional date filter |
| `GET` | `/api/availability?date=&serviceId=&attendantId=` | Available slots for an attendant/service |
| `GET` | `/api/availability/any?date=&serviceId=` | Availability union for "Any Available" artist |
| `POST` | `/api/auth/attendant/login` | Attendant login via username + PIN pad |
| `GET` | `/api/admin/attendants/public?serviceId=` | Qualified active attendants for customer flow |
| `GET` | `/api/admin/attendants` | List all staff members (Owner-only) |
| `POST` | `/api/admin/attendants` | Create a new attendant account (Owner-only) |
| `PATCH` | `/api/admin/attendants/:id` | Update staff info/status/PIN (Owner-only) |
| `GET` | `/api/attendant/bookings` | List assigned bookings for logged-in staff member (JWT-protected) |
| `PATCH` | `/api/attendant/bookings/:id/complete` | Mark booking completed (JWT-protected) |
| `GET` | `/api/admin/bookings?status=` | All bookings with optional status filter (Owner-only) |
| `PATCH` | `/api/admin/bookings/:id` | Confirm or cancel a booking (Owner-only) |
| `POST` | `/api/push/subscribe` | Register a push subscription |
| `GET` | `/api/health` | Health check |

---

## Booking flow (frontend)

The customer goes through 6 sequential steps, each animated with Framer Motion:

```
[Service] → [Date] → [Artist] → [Time] → [Contact] → [Confirmation]
```

1. **Service** — searchable service cards, each showing name, duration, and price
2. **Date** — scrollable 30-day calendar grouped by month
3. **Artist** — choose a specific stylist or select "Any Available"
4. **Time** — grid of available slots (fetched live from the API for the selected service, date, and artist)
5. **Contact** — name, phone, email (email used for automated confirmation updates)
6. **Confirmation** — booking reference, appointment summary with assigned stylist

**Offline behaviour**: If the device is offline, a banner appears and the "Finalize Booking" button is disabled. Services fall back to cached mock data so the UI remains interactive and functional.

---

## Admin & Staff portals

Accessed via the settings icon (top-right). Users can log in using either the Owner PIN pad or the Staff username + PIN numpad:

### Owner Dashboard
Requires the Owner PIN. Features four tabs:
- **Daily Ledger** — today's confirmed appointments sorted by time showing the assigned attendant, with a live clock. Past appointments are dimmed automatically.
- **Pending Requests** — incoming bookings awaiting action with requested artist name. One-tap confirm or decline, triggering instant push + email notifications.
- **Staff Management** — PIN-gated tab for creating new attendants, updating their details/PINs, managing their qualified services, and toggling their active status.
- **Service Management** — inline price editing, description updates, and service creation.

### Staff Dashboard
Requires a staff username and personal PIN. 
- Features three tailored tabs: **Today** | **Upcoming** | **Completed**.
- Lists only bookings assigned to the logged-in staff member.
- Provides a one-tap **Done** action to mark active appointments as completed.

---

## PWA features

- Installable on iOS/Android/desktop via browser prompt
- Custom app icon and splash screen
- Service worker via Workbox (cache-first for assets, network-first for API)
- `sw.js` and `manifest.webmanifest` served with `no-cache` headers to prevent stale installs
- Push notifications use the Web Push Protocol (VAPID keys)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion |
| Backend | Node.js, Express, TypeScript (`tsx` for ESM) |
| Database | MongoDB via Mongoose |
| Email | Resend |
| Push | Web Push API (VAPID) |
| PWA | Workbox (via `vite-plugin-pwa`) |
| Time | Luxon (timezone-safe slot calculation) |
| Hosting | Render (single web service, monorepo) |

---

## Project structure

```
/
├── backend/
│   ├── controllers/       # Request handlers (auth, booking, attendant, etc.)
│   ├── models/            # Mongoose schemas (Booking, Service, Attendant, PushSubscription)
│   ├── routes/            # Express routers
│   ├── services/          # emailService, pushService, slotService
│   ├── middleware/        # errorHandler, authMiddleware
│   ├── config/            # MongoDB connection
│   └── server.ts          # Entry point, seeds DB on first run
│
├── frontend/
│   └── src/
│       ├── App.tsx         # Entire UI (booking flow + admin/staff dashboards)
│       ├── types.ts        # Shared TypeScript interfaces
│       ├── api/client.ts   # All API calls
│       ├── components/     # InstallPrompt, NotificationPrompt
│       └── hooks/          # usePushNotifications, useAdminPushNotifications
│
├── ship.sh                 # Dev/test/deploy script
└── render.yaml             # Render deployment config
```

---

## Local setup

```bash
# 1. Clone
git clone https://github.com/makieman/booking-app-for-salons.git
cd booking-app-for-salons

# 2. Install
npm install

# 3. Configure environment
cp backend/.env.example backend/.env
# Fill in: MONGODB_URI, RESEND_API_KEY, ADMIN_EMAIL, JWT_SECRET, OWNER_PIN, VAPID keys

# 4. Generate VAPID keys (one-time)
npx web-push generate-vapid-keys

# 5. Run dev servers + open browser
./ship.sh --dev
```

The `ship.sh` script runs both servers concurrently and opens the app automatically. For full typecheck → build → preview → push, run `./ship.sh`.

---

## Deployment

The app is deployed on **Render** as a single web service. The Express backend serves the Vite-built frontend from `/frontend/dist` in production.

```yaml
# render.yaml
buildCommand: npm install && npm run build   # installs + builds frontend
startCommand: npm start                       # starts Express
