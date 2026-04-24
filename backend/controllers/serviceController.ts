import { Request, Response } from 'express';
import Service from '../models/Service';

/**
 * POST /api/services
 * Creates a new service (e.g., a new treatment the salon offers).
 */
export const createService = async (req: Request, res: Response) => {
  try {
    const { name, duration, price } = req.body;
    const newService = new Service({ name, duration, price });
    await newService.save();
    res.status(201).json(newService);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create service' });
  }
};

/**
 * GET /api/services
 * Returns all available services.
 */
export const getServices = async (req: Request, res: Response) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};
