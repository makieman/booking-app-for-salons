import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import { errorHandler } from './middleware/errorHandler';
import Service from './models/Service';

// Routes
import serviceRoutes from './routes/serviceRoutes';
import bookingRoutes from './routes/bookingRoutes';
import availabilityRoutes from './routes/availabilityRoutes';

// Load environment variables from .env file
dotenv.config();

/**
 * Seeds the database with initial services if none exist.
 * This runs once on startup so you always have sample data.
 */
async function seedServices(): Promise<void> {
  const count = await Service.countDocuments();
  if (count === 0) {
    const services = [
      {
        name: 'Sisterlocks™ Installation',
        duration: 1200,
        price: 10000,
        description: 'Professional installation by a certified consultant.',
        image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?auto=format&fit=crop&q=80&w=400',
      },
      {
        name: 'Retightening & Maintenance',
        duration: 240,
        price: 3500,
        description: 'Regular maintenance to keep your Sisterlocks neat and healthy.',
        image: 'https://images.unsplash.com/photo-1620331311520-246422fd82f9?auto=format&fit=crop&q=80&w=400',
      },
      {
        name: 'Consultation',
        duration: 60,
        price: 1000,
        description: 'Mandatory session before installation.',
        image: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?auto=format&fit=crop&q=80&w=400',
      },
    ];
    await Service.insertMany(services);
    console.log('🌱 Database seeded with initial services');
  }
}

/**
 * Starts the Express server.
 * - Connects to MongoDB
 * - Seeds initial data
 * - Registers API routes
 * - Starts listening on the configured PORT
 */
async function startServer(): Promise<void> {
  const app: Express = express();
  const PORT = parseInt(process.env.PORT || '5000', 10);

  // ── Middleware ────────────────────────────────────────────
  app.use(cors());          // Allow cross-origin requests from the frontend
  app.use(express.json());  // Parse JSON request bodies

  // ── Database ─────────────────────────────────────────────
  await connectDB();
  await seedServices();

  // ── API Routes ───────────────────────────────────────────
  app.use('/api/services', serviceRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/availability', availabilityRoutes);

  // ── Health Check ─────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Error Handler (must be last) ────────────────────────
  app.use(errorHandler);

  // ── Start Server ─────────────────────────────────────────
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
