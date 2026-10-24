import { Request, Response } from 'express';
import Service from '../models/Service';

/**
 * POST /api/services
 * Creates a new service for the resolved tenant.
 */
export const createService = async (req: Request, res: Response) => {
  try {
    const { name, duration, price, priceMax, description, bufferAfterMinutes, canExceedClosingTime, latestStartTime } = req.body;
    if (!name || !duration || price === undefined) {
      return res.status(400).json({ error: 'name, duration, and price are required' });
    }
    const newService = new Service({
      tenantId: req.tenant!._id,
      name,
      duration: Number(duration),
      price: Number(price),
      priceMax: priceMax !== undefined && priceMax !== null ? Number(priceMax) : undefined,
      description,
      bufferAfterMinutes: bufferAfterMinutes !== undefined ? Number(bufferAfterMinutes) : 0,
      canExceedClosingTime: canExceedClosingTime !== undefined ? Boolean(canExceedClosingTime) : false,
      latestStartTime: latestStartTime || undefined,
    });
    await newService.save();
    invalidateServicesCache(req.tenant!._id.toString());
    res.status(201).json(newService);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create service' });
  }
};

import crypto from 'crypto';

// ── In-Memory Services Cache ─────────────────────────────────────────────
const SERVICES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const servicesCache = new Map<string, { data: any[]; etag: string; expiresAt: number }>();

export function invalidateServicesCache(tenantId?: string): void {
  if (tenantId) {
    servicesCache.delete(tenantId);
  } else {
    servicesCache.clear();
  }
}

/**
 * GET /api/services
 * Returns all services for the resolved tenant with ETag delta-sync support.
 */
export const getServices = async (req: Request, res: Response) => {
  try {
    const tenantIdStr = req.tenant!._id.toString();
    const cached = servicesCache.get(tenantIdStr);

    let services: any[];
    let etag: string;

    if (cached && cached.expiresAt > Date.now()) {
      services = cached.data;
      etag = cached.etag;
    } else {
      services = await Service.find({ tenantId: req.tenant!._id }).lean();
      etag = `"${crypto.createHash('md5').update(JSON.stringify(services)).digest('hex')}"`;
      servicesCache.set(tenantIdStr, {
        data: services,
        etag,
        expiresAt: Date.now() + SERVICES_CACHE_TTL_MS,
      });
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    // Delta sync: If client's cached version matches, return 304 with 0 bytes body
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === etag) {
      return res.status(304).end();
    }

    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};

/**
 * PATCH /api/services/:id
 * Updates a service belonging to the resolved tenant.
 */
export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, duration, price, priceMax, description, bufferAfterMinutes, canExceedClosingTime, latestStartTime } = req.body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (duration !== undefined) updates.duration = Number(duration);
    if (price !== undefined) updates.price = Number(price);
    if (priceMax !== undefined) {
      updates.priceMax = priceMax !== null && priceMax !== '' ? Number(priceMax) : null;
    }
    if (description !== undefined) updates.description = description;
    if (bufferAfterMinutes !== undefined) {
      updates.bufferAfterMinutes = bufferAfterMinutes !== null ? Number(bufferAfterMinutes) : 0;
    }
    if (canExceedClosingTime !== undefined) {
      updates.canExceedClosingTime = Boolean(canExceedClosingTime);
    }
    if (latestStartTime !== undefined) {
      updates.latestStartTime = latestStartTime || null;
    }

    // Scope to tenant — prevents cross-tenant updates
    const updated = await Service.findOneAndUpdate(
      { _id: id, tenantId: req.tenant!._id },
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Service not found' });

    invalidateServicesCache(req.tenant!._id.toString());
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update service' });
  }
};
