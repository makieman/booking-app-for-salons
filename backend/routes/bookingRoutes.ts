import express from 'express';
import {
  createBooking,
  getBookings,
  lookupBookings,
  cancelBookingCustomer,
  rescheduleBookingCustomer,
} from '../controllers/bookingController';

const router = express.Router();

router.post('/', createBooking);
router.get('/', getBookings);
router.get('/lookup', lookupBookings);
router.patch('/:id/cancel-customer', cancelBookingCustomer);
router.patch('/:id/reschedule-customer', rescheduleBookingCustomer);

export default router;
