import express from 'express';
import { getAvailability, getAnyAvailability } from '../controllers/availabilityController';

const router = express.Router();

// GET /api/availability?date=YYYY-MM-DD&serviceId=xxx[&attendantId=yyy]
// Returns available time slots; scoped to attendant when attendantId is provided
router.get('/', getAvailability);

// GET /api/availability/any?date=YYYY-MM-DD&serviceId=xxx
// Returns slots + per-attendant breakdown for "Any Available" customer choice
router.get('/any', getAnyAvailability);

export default router;
