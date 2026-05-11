import express from 'express';
import { getAdminBookings, updateBookingStatus } from '../controllers/adminController';

const router = express.Router();

// GET /api/admin/bookings — fetch all bookings (optionally ?status=pending)
router.get('/bookings', getAdminBookings);

// PATCH /api/admin/bookings/:id — confirm or cancel a booking
router.patch('/bookings/:id', updateBookingStatus);

export default router;
