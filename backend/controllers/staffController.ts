import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Attendant from '../models/Attendant';

const SAFE_FIELDS = '-pinHash';

/**
 * GET /api/admin/attendants/public?serviceId=xxx
 * Customer-facing — no auth. Returns active attendants for this tenant.
 */
export const publicListAttendants = async (req: Request, res: Response) => {
  try {
    const { serviceId } = req.query;
    const filter: Record<string, unknown> = { tenantId: req.tenant!._id, isActive: true };
    if (serviceId) filter.serviceIds = serviceId as string;

    const attendants = await Attendant.find(filter).select('_id name serviceIds');
    res.json(attendants);
  } catch (error) {
    console.error('[staffController] publicListAttendants:', error);
    res.status(500).json({ error: 'Failed to fetch attendants' });
  }
};

/**
 * GET /api/admin/attendants
 * Owner-only. Returns all attendants for this tenant.
 */
export const listAttendants = async (req: Request, res: Response) => {
  try {
    const { activeOnly } = req.query;
    const filter: Record<string, unknown> = { tenantId: req.tenant!._id };
    if (activeOnly === 'true') filter.isActive = true;

    const attendants = await Attendant.find(filter)
      .select(SAFE_FIELDS)
      .populate('serviceIds', 'name')
      .sort({ name: 1 });

    res.json(attendants);
  } catch (error) {
    console.error('[staffController] listAttendants:', error);
    res.status(500).json({ error: 'Failed to fetch attendants' });
  }
};

/**
 * POST /api/admin/attendants
 * Owner-only. Creates a new attendant scoped to this tenant.
 */
export const createAttendant = async (req: Request, res: Response) => {
  try {
    const { name, username, pin, serviceIds } = req.body as {
      name?: string; username?: string; pin?: string; serviceIds?: string[];
    };

    if (!name || !username || !pin) {
      return res.status(400).json({ error: 'name, username, and pin are required' });
    }

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4–6 digits' });
    }

    // Check username uniqueness within this tenant (compound index enforces it in DB too)
    const existing = await Attendant.findOne({
      tenantId: req.tenant!._id,
      username: username.toLowerCase().trim(),
    });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists for this salon' });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const attendant = await Attendant.create({
      tenantId: req.tenant!._id,
      name: name.trim(),
      username: username.toLowerCase().trim(),
      pinHash,
      isActive: true,
      serviceIds: serviceIds ?? [],
    });

    const safe = await Attendant.findById(attendant._id).select(SAFE_FIELDS).populate('serviceIds', 'name');
    res.status(201).json(safe);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Username already exists for this salon' });
    }
    console.error('[staffController] createAttendant:', error);
    res.status(500).json({ error: 'Failed to create attendant' });
  }
};

/**
 * PATCH /api/admin/attendants/:id
 * Owner-only. Updates an attendant belonging to this tenant.
 */
export const updateAttendant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, serviceIds, isActive, pin } = req.body as {
      name?: string; serviceIds?: string[]; isActive?: boolean; pin?: string;
    };

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name.trim();
    if (serviceIds !== undefined) update.serviceIds = serviceIds;
    if (isActive !== undefined) update.isActive = isActive;

    if (pin !== undefined) {
      if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be 4–6 digits' });
      }
      update.pinHash = await bcrypt.hash(pin, 10);
    }

    // Scope to tenant
    const attendant = await Attendant.findOneAndUpdate(
      { _id: id, tenantId: req.tenant!._id },
      update,
      { new: true, runValidators: true }
    ).select(SAFE_FIELDS).populate('serviceIds', 'name');

    if (!attendant) return res.status(404).json({ error: 'Attendant not found' });
    res.json(attendant);
  } catch (error) {
    console.error('[staffController] updateAttendant:', error);
    res.status(500).json({ error: 'Failed to update attendant' });
  }
};

/**
 * DELETE /api/admin/attendants/:id
 * Owner-only. Deletes an attendant belonging to this tenant.
 */
export const deleteAttendant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Scope to tenant
    const attendant = await Attendant.findOneAndDelete({ _id: id, tenantId: req.tenant!._id });
    if (!attendant) return res.status(404).json({ error: 'Attendant not found' });
    res.json({ message: 'Attendant deleted successfully', _id: id });
  } catch (error) {
    console.error('[staffController] deleteAttendant:', error);
    res.status(500).json({ error: 'Failed to delete attendant' });
  }
};
