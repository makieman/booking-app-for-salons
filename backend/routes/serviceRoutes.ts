import express from 'express';
import { createService, getServices } from '../controllers/serviceController';

const router = express.Router();

router.post('/', createService);
router.get('/', getServices);

export default router;
