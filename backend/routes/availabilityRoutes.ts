import express from 'express';
import { getAvailability } from '../controllers/availabilityController';

const router = express.Router();

router.get('/', getAvailability);

export default router;
