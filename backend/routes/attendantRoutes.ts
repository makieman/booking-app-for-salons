import express from 'express';
import { getAttendantBookings, markBookingCompleted } from '../controllers/attendantController';
import { requireAttendantAuth } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require a valid attendant JWT
router.use(requireAttendantAuth);

// GET /api/attendant/bookings — fetch this attendant's own bookings
// Optional query: ?date=YYYY-MM-DD, ?status=confirmed
router.get('/bookings', getAttendantBookings);

// PATCH /api/attendant/bookings/:id/complete — mark a confirmed booking as completed
router.patch('/bookings/:id/complete', markBookingCompleted);

export default router;
