import express from 'express';
import { getAdminBookings, updateBookingStatus, createAdminBooking } from '../controllers/adminController';
import {
  listAttendants,
  createAttendant,
  updateAttendant,
  publicListAttendants,
  deleteAttendant,
} from '../controllers/staffController';
import { requireOwnerAuth } from '../middleware/authMiddleware';

const router = express.Router();

// ── Booking management (owner-only with JWT) ──────────────────────────────────
// GET /api/admin/bookings — fetch all bookings with optional search & filters
router.get('/bookings', requireOwnerAuth, getAdminBookings);

// POST /api/admin/bookings — create walk-in / phone booking directly
router.post('/bookings', requireOwnerAuth, createAdminBooking);

// PATCH /api/admin/bookings/:id — confirm, reschedule, or cancel a booking
router.patch('/bookings/:id', requireOwnerAuth, updateBookingStatus);

// ── Attendant / Staff management (owner-only) ─────────────────────────────────
// GET /api/admin/attendants/public?serviceId=xxx — customer-facing, no auth
router.get('/attendants/public', publicListAttendants);

// GET /api/admin/attendants — list all staff (owner only)
router.get('/attendants', requireOwnerAuth, listAttendants);

// POST /api/admin/attendants — create new staff account (owner only)
router.post('/attendants', requireOwnerAuth, createAttendant);

// PATCH /api/admin/attendants/:id — update staff (owner only)
router.patch('/attendants/:id', requireOwnerAuth, updateAttendant);

// DELETE /api/admin/attendants/:id — delete staff (owner only)
router.delete('/attendants/:id', requireOwnerAuth, deleteAttendant);

export default router;
