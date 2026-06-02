import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Attendant from '../models/Attendant';

// Fields safe to return to the client — pinHash is always excluded
const SAFE_FIELDS = '-pinHash';

/**
 * GET /api/attendants/public?serviceId=xxx
 * Customer-facing — no auth required.
 * Returns only active attendants that can perform the requested service.
 * Response shape: [{ _id, name }]
 */
export const publicListAttendants = async (req: Request, res: Response) => {
  try {
    const { serviceId } = req.query;

    const filter: Record<string, unknown> = { isActive: true };
    if (serviceId) {
      filter.serviceIds = serviceId as string;
    }

    const attendants = await Attendant.find(filter).select('_id name serviceIds');
    res.json(attendants);
  } catch (error) {
    console.error('[staffController] publicListAttendants:', error);
    res.status(500).json({ error: 'Failed to fetch attendants' });
  }
};

/**
 * GET /api/attendants
 * Owner-only. Returns all attendants (active and inactive).
 * Optional ?activeOnly=true to filter.
 */
export const listAttendants = async (req: Request, res: Response) => {
  try {
    const { activeOnly } = req.query;
    const filter = activeOnly === 'true' ? { isActive: true } : {};

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
 * POST /api/attendants
 * Owner-only. Creates a new attendant account.
 *
 * Body: { name, username, pin (plaintext), serviceIds[] }
 */
export const createAttendant = async (req: Request, res: Response) => {
  try {
    const { name, username, pin, serviceIds } = req.body as {
      name?: string;
      username?: string;
      pin?: string;
      serviceIds?: string[];
    };

    if (!name || !username || !pin) {
      return res.status(400).json({ error: 'name, username, and pin are required' });
    }

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4–6 digits' });
    }

    // Check username uniqueness
    const existing = await Attendant.findOne({ username: username.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const attendant = await Attendant.create({
      name: name.trim(),
      username: username.toLowerCase().trim(),
      pinHash,
      isActive: true,
      serviceIds: serviceIds ?? [],
    });

    // Return without pinHash
    const safe = await Attendant.findById(attendant._id)
      .select(SAFE_FIELDS)
      .populate('serviceIds', 'name');

    res.status(201).json(safe);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('[staffController] createAttendant:', error);
    res.status(500).json({ error: 'Failed to create attendant' });
  }
};

/**
 * PATCH /api/attendants/:id
 * Owner-only. Updates name, serviceIds, isActive, or resets PIN.
 *
 * Body (all optional): { name?, serviceIds?, isActive?, pin? }
 */
export const updateAttendant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, serviceIds, isActive, pin } = req.body as {
      name?: string;
      serviceIds?: string[];
      isActive?: boolean;
      pin?: string;
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

    const attendant = await Attendant.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .select(SAFE_FIELDS)
      .populate('serviceIds', 'name');

    if (!attendant) {
      return res.status(404).json({ error: 'Attendant not found' });
    }

    res.json(attendant);
  } catch (error) {
    console.error('[staffController] updateAttendant:', error);
    res.status(500).json({ error: 'Failed to update attendant' });
  }
};

export const deleteAttendant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const attendant = await Attendant.findByIdAndDelete(id);

    if (!attendant) {
      return res.status(404).json({ error: 'Attendant not found' });
    }

    res.json({ message: 'Attendant deleted successfully', _id: id });
  } catch (error) {
    console.error('[staffController] deleteAttendant:', error);
    res.status(500).json({ error: 'Failed to delete attendant' });
  }
};

