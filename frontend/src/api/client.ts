/**
 * API Client — Centralized functions for communicating with the backend.
 *
 * All requests go to '/api/...' which Vite's dev server proxy forwards
 * to http://localhost:5000 during development. In production, you'd
 * configure your reverse proxy (nginx, etc.) to handle this.
 */

const API_BASE = '/api';

/**
 * Fetches all available services from the backend.
 * Endpoint: GET /api/services
 */
export async function getServices() {
  const res = await fetch(`${API_BASE}/services`);
  if (!res.ok) throw new Error('Failed to fetch services');
  return res.json();
}

/**
 * Creates a new service.
 * Endpoint: POST /api/services
 */
export async function createService(data: { name: string; duration: number; price: number; description?: string }) {
  const res = await fetch(`${API_BASE}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create service');
  }
  return res.json();
}

/**
 * Fetches bookings, optionally filtered by date.
 * Endpoint: GET /api/bookings?date=YYYY-MM-DD
 */
export async function getBookings(date?: string) {
  const url = date
    ? `${API_BASE}/bookings?date=${date}`
    : `${API_BASE}/bookings`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch bookings');
  return res.json();
}

/**
 * Creates a new booking.
 * Endpoint: POST /api/bookings
 */
export async function createBooking(data: {
  customerName: string;
  phone: string;
  email?: string;     // Optional — used for email notifications
  serviceId: string;
  date: string;
  startTime: string;
}) {
  const res = await fetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create booking');
  }
  return res.json();
}

/**
 * Fetches available time slots for a given date and service.
 * Endpoint: GET /api/availability?date=YYYY-MM-DD&serviceId=xxx
 * Returns an array of time strings like ["09:00", "09:30", "10:00"]
 */
export async function getAvailability(date: string, serviceId: string) {
  const res = await fetch(
    `${API_BASE}/availability?date=${date}&serviceId=${serviceId}`
  );
  if (!res.ok) throw new Error('Failed to fetch availability');
  return res.json();
}

/**
 * Admin: Fetches all bookings, optionally filtered by status.
 * Endpoint: GET /api/admin/bookings?status=pending
 */
export async function getAdminBookings(status?: string) {
  const url = status
    ? `${API_BASE}/admin/bookings?status=${status}`
    : `${API_BASE}/admin/bookings`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch admin bookings');
  return res.json();
}

/**
 * Admin: Confirm or cancel a booking.
 * Endpoint: PATCH /api/admin/bookings/:id
 */
export async function updateBookingStatus(id: string, status: 'confirmed' | 'cancelled') {
  const res = await fetch(`${API_BASE}/admin/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update booking status');
  }
  return res.json();
}

/**
 * Admin: Update a service's details (name, duration, price, description).
 * Endpoint: PATCH /api/services/:id
 */
export async function updateService(id: string, data: Partial<{ name: string; duration: number; price: number; description: string }>) {
  const res = await fetch(`${API_BASE}/services/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update service');
  }
  return res.json();
}

