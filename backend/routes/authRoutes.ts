import express from 'express';
import { loginAttendant } from '../controllers/authController';

const router = express.Router();

// POST /api/auth/attendant/login — public login, returns JWT
router.post('/attendant/login', loginAttendant);

export default router;
