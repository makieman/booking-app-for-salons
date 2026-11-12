import express from 'express';
import {
  createBooking,
  getBookings,
  lookupBookings,
  cancelBookingCustomer,
  rescheduleBookingCustomer,
} from '../controllers/bookingController';
import { requireStaffOrOwnerAuth } from '../middleware/authMiddleware';
import {
  bookingCreateLimiter,
  bookingLookupLimiter,
  bookingModifyLimiter,
} from '../middleware/rateLimiters';

const router = express.Router();

router.post('/', bookingCreateLimiter, createBooking);
router.get('/', requireStaffOrOwnerAuth, getBookings);
router.get('/lookup', bookingLookupLimiter, lookupBookings);
router.patch('/:id/cancel-customer', bookingModifyLimiter, cancelBookingCustomer);
router.patch('/:id/reschedule-customer', bookingModifyLimiter, rescheduleBookingCustomer);

export default router;
