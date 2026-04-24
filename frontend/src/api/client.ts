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
