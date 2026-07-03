import { Request, Response } from 'express';
import Service from '../models/Service';

/**
 * POST /api/services
 * Creates a new service (e.g., a new treatment the salon offers).
 */
export const createService = async (req: Request, res: Response) => {
  try {
    const { name, duration, price, priceMax, description } = req.body;
    if (!name || !duration || price === undefined) {
      return res.status(400).json({ error: 'name, duration, and price are required' });
    }
    const newService = new Service({
      name,
      duration: Number(duration),
      price: Number(price),
      priceMax: priceMax !== undefined && priceMax !== null ? Number(priceMax) : undefined,
      description
    });
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

/**
 * PATCH /api/services/:id
 * Updates a service's editable fields (name, duration, price, description).
 */
export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, duration, price, priceMax, description } = req.body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (duration !== undefined) updates.duration = Number(duration);
    if (price !== undefined) updates.price = Number(price);
    if (priceMax !== undefined) {
      updates.priceMax = priceMax !== null && priceMax !== '' ? Number(priceMax) : null;
    }
    if (description !== undefined) updates.description = description;

    const updated = await Service.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Service not found' });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update service' });
  }
};

