import express from 'express';
import { createService, getServices, updateService } from '../controllers/serviceController';

const router = express.Router();

router.post('/', createService);
router.get('/', getServices);
router.patch('/:id', updateService);

export default router;
