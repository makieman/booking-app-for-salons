/**
 * API Client — Centralized functions for communicating with the backend.
 *
 * All requests go to '/api/...' which Vite's dev server proxy forwards
 * to http://localhost:5000 during development. In production, you'd
 * configure your reverse proxy (nginx, etc.) to handle this.
 */

import type { Attendant, Booking } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** Adds Authorization Bearer header when a token is provided */
function authHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}


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
export async function createService(data: { name: string; duration: number; price: number; priceMax?: number; description?: string }) {
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

// ── Bookings ───────────────────────────────────────────────────────────────

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
  email?: string;
  serviceId: string;
  date: string;
  startTime: string;
  attendantId?: string | null;
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

// ── Availability ───────────────────────────────────────────────────────────

/**
 * Fetches available time slots for a given date, service, and optional attendant.
 * Endpoint: GET /api/availability?date=YYYY-MM-DD&serviceId=xxx[&attendantId=yyy]
 * Returns an array of time strings like ["09:00", "09:30", "10:00"]
 */
export async function getAvailability(date: string, serviceId: string, attendantId?: string | null) {
  let url = `${API_BASE}/availability?date=${date}&serviceId=${serviceId}`;
  if (attendantId) url += `&attendantId=${attendantId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch availability');
  return res.json();
}

/**
 * Fetches slots across ALL active attendants for the "Any Available" option.
 * Endpoint: GET /api/availability/any?date=YYYY-MM-DD&serviceId=xxx
 */
export async function getAnyAvailability(date: string, serviceId: string): Promise<{
  slots: string[];
  attendantSlots: { attendantId: string; name: string; slots: string[] }[];
}> {
  const res = await fetch(`${API_BASE}/availability/any?date=${date}&serviceId=${serviceId}`);
  if (!res.ok) throw new Error('Failed to fetch availability');
  return res.json();
}

// ── Admin: Bookings ────────────────────────────────────────────────────────

/**
 * Admin: Fetches all bookings, optionally filtered by status and/or attendant.
 * Endpoint: GET /api/admin/bookings?status=pending&attendantId=xxx
 */
export async function getAdminBookings(status?: string, attendantId?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (attendantId) params.set('attendantId', attendantId);
  const url = params.toString()
    ? `${API_BASE}/admin/bookings?${params}`
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
export async function updateService(id: string, data: Partial<{ name: string; duration: number; price: number; priceMax: number | null; description: string }>) {
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

// ── Admin: Attendants ──────────────────────────────────────────────────────

/**
 * Customer-facing: fetch active attendants for a service (no auth).
 * Endpoint: GET /api/admin/attendants/public?serviceId=xxx
 */
export async function getAttendantsForService(serviceId: string): Promise<Pick<Attendant, '_id' | 'name' | 'serviceIds'>[]> {
  const res = await fetch(`${API_BASE}/admin/attendants/public?serviceId=${serviceId}`);
  if (!res.ok) throw new Error('Failed to fetch attendants');
  return res.json();
}

/**
 * Owner: Fetch all staff accounts.
 * Endpoint: GET /api/admin/attendants
 * Requires X-Owner-Pin header.
 */
export async function getAttendants(ownerPin: string): Promise<Attendant[]> {
  const res = await fetch(`${API_BASE}/admin/attendants`, {
    headers: { 'Content-Type': 'application/json', 'X-Owner-Pin': ownerPin },
  });
  if (!res.ok) throw new Error('Failed to fetch attendants');
  return res.json();
}

/**
 * Owner: Create a new staff account.
 * Endpoint: POST /api/admin/attendants
 */
export async function createAttendant(
  ownerPin: string,
  data: { name: string; username: string; pin: string; serviceIds: string[] }
): Promise<Attendant> {
  const res = await fetch(`${API_BASE}/admin/attendants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Owner-Pin': ownerPin },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create attendant');
  }
  return res.json();
}

/**
 * Owner: Update a staff account (name, serviceIds, isActive, pin reset).
 * Endpoint: PATCH /api/admin/attendants/:id
 */
export async function updateAttendant(
  ownerPin: string,
  id: string,
  data: Partial<{ name: string; pin: string; serviceIds: string[]; isActive: boolean }>
): Promise<Attendant> {
  const res = await fetch(`${API_BASE}/admin/attendants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Owner-Pin': ownerPin },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update attendant');
  }
  return res.json();
}

/**
 * Owner: Delete a staff account.
 * Endpoint: DELETE /api/admin/attendants/:id
 */
export async function deleteAttendant(ownerPin: string, id: string): Promise<{ message: string, _id: string }> {
  const res = await fetch(`${API_BASE}/admin/attendants/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-Owner-Pin': ownerPin },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete attendant');
  }
  return res.json();
}

// ── Auth: Attendant Login ──────────────────────────────────────────────────

/**
 * Log in as an attendant. Returns JWT + attendant info.
 * Endpoint: POST /api/auth/attendant/login
 */
export async function loginAttendant(
  username: string,
  pin: string
): Promise<{ token: string; attendant: { _id: string; name: string; serviceIds: string[] } }> {
  const res = await fetch(`${API_BASE}/auth/attendant/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, pin }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Login failed');
  }
  return res.json();
}

// ── Attendant: Own Dashboard ───────────────────────────────────────────────

/**
 * Fetch the authenticated attendant's own bookings.
 * Endpoint: GET /api/attendant/bookings?date=&status=
 */
export async function getAttendantBookings(
  token: string,
  params?: { date?: string; status?: string }
): Promise<Booking[]> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.status) query.set('status', params.status);
  const url = query.toString()
    ? `${API_BASE}/attendant/bookings?${query}`
    : `${API_BASE}/attendant/bookings`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch bookings');
  return res.json();
}

/**
 * Mark a booking as completed (attendant only).
 * Endpoint: PATCH /api/attendant/bookings/:id/complete
 */
export async function markBookingCompleted(token: string, bookingId: string): Promise<Booking> {
  const res = await fetch(`${API_BASE}/attendant/bookings/${bookingId}/complete`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to mark booking complete');
  }
  return res.json();
}

/**
 * Looks up bookings by reference or phone.
 * Endpoint: GET /api/bookings/lookup?reference=xxx or ?phone=yyy
 */
export async function lookupBookings(params: { reference?: string; phone?: string }): Promise<Booking[]> {
  const query = new URLSearchParams();
  if (params.reference) query.set('reference', params.reference);
  if (params.phone) query.set('phone', params.phone);
  const res = await fetch(`${API_BASE}/bookings/lookup?${query}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to find bookings');
  }
  return res.json();
}

/**
 * Customers can cancel their booking.
 * Endpoint: PATCH /api/bookings/:id/cancel-customer
 */
export async function cancelBookingCustomer(id: string): Promise<Booking> {
  const res = await fetch(`${API_BASE}/bookings/${id}/cancel-customer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to cancel booking');
  }
  return res.json();
}

/**
 * Customers can reschedule their booking.
 * Endpoint: PATCH /api/bookings/:id/reschedule-customer
 */
export async function rescheduleBookingCustomer(id: string, data: { date: string; startTime: string }): Promise<Booking> {
  const res = await fetch(`${API_BASE}/bookings/${id}/reschedule-customer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to reschedule booking');
  }
  return res.json();
}

/**
 * Helper to build auth headers for notifications (Bearer token or X-Owner-Pin)
 */
function notificationHeaders(auth: { token?: string; ownerPin?: string }): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.ownerPin) {
    headers['X-Owner-Pin'] = auth.ownerPin;
  } else if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  return headers;
}

/**
 * Fetch top 50 notifications from backend
 */
export async function getBackendNotifications(auth: { token?: string; ownerPin?: string }): Promise<any[]> {
  const res = await fetch(`${API_BASE}/notifications`, {
    headers: notificationHeaders(auth),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to load notifications');
  }
  return res.json();
}

/**
 * Mark a single notification as read
 */
export async function markBackendNotificationAsRead(id: string, auth: { token?: string; ownerPin?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: notificationHeaders(auth),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to mark notification read');
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllBackendNotificationsRead(auth: { token?: string; ownerPin?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/read-all`, {
    method: 'POST',
    headers: notificationHeaders(auth),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to mark all notifications read');
  }
}

/**
 * Delete a single notification
 */
export async function deleteBackendNotification(id: string, auth: { token?: string; ownerPin?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications/${id}`, {
    method: 'DELETE',
    headers: notificationHeaders(auth),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete notification');
  }
}

/**
 * Clear all notifications
 */
export async function clearAllBackendNotifications(auth: { token?: string; ownerPin?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/notifications`, {
    method: 'DELETE',
    headers: notificationHeaders(auth),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to clear notifications');
  }
}