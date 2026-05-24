import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Attendant from '../models/Attendant';

/**
 * POST /api/auth/attendant/login
 * Validates username + PIN, returns a signed JWT on success.
 *
 * Body: { username: string; pin: string }
 * Response 200: { token: string; attendant: { _id, name, serviceIds } }
 * Response 401: { error: 'Invalid credentials' }
 */
export const loginAttendant = async (req: Request, res: Response) => {
  try {
    const { username, pin } = req.body as { username?: string; pin?: string };

    if (!username || !pin) {
      return res.status(400).json({ error: 'username and pin are required' });
    }

    // Find by username (stored lowercase)
    const attendant = await Attendant.findOne({
      username: username.toLowerCase().trim(),
    });

    // Use a constant-time comparison (bcrypt handles timing safety)
    if (!attendant || !attendant.isActive) {
      // Still call compare to prevent username-enumeration timing attacks
      await bcrypt.compare(pin, '$2b$10$invalidhashpaddingtomakeitconstanttime');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(pin, attendant.pinHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[authController] JWT_SECRET not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { sub: attendant._id.toString(), role: 'attendant', name: attendant.name },
      secret,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      attendant: {
        _id: attendant._id,
        name: attendant.name,
        serviceIds: attendant.serviceIds,
      },
    });
  } catch (error) {
    console.error('[authController] loginAttendant error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};
