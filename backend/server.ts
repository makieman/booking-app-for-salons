import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import { errorHandler } from './middleware/errorHandler';
import Service from './models/Service';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
import serviceRoutes from './routes/serviceRoutes';
import bookingRoutes from './routes/bookingRoutes';
import availabilityRoutes from './routes/availabilityRoutes';
import adminRoutes from './routes/adminRoutes';
import pushRoutes from './routes/pushRoutes';
import notificationRoutes from './routes/notificationRoutes';
import authRoutes from './routes/authRoutes';
import attendantRoutes from './routes/attendantRoutes';
import tenantRoutes from './routes/tenantRoutes';
import { startReminderScheduler } from './services/reminderService';
import { resolveTenant } from './middleware/resolveTenant';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Tenant from './models/Tenant';
import Attendant from './models/Attendant';
import bcrypt from 'bcrypt';

/**
 * Seeds a default tenant (flo-sisterlocks) and default services/attendants if the DB is empty.
 * This ensures the application is ready to use in development/test environments.
 */
async function seedDefaultTenant(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ Skipping database seeding: No active MongoDB connection.');
    return;
  }
  try {
    const tenantCount = await Tenant.countDocuments();
    if (tenantCount === 0) {
      console.log('🌱 No tenants found in database. Auto-seeding default tenant "flo-sisterlocks"...');
      const passwordHash = await bcrypt.hash('password123', 10);
      const tenant = await Tenant.create({
        name: 'Flo Sisterlocks',
        slug: 'flo-sisterlocks',
        ownerEmail: 'owner@flosisterlocks.com',
        ownerPasswordHash: passwordHash,
        timezone: 'Africa/Nairobi',
        workingHours: { start: '09:00', end: '18:00' },
        branding: {
          primaryColor: '#B08968',
        },
        locale: 'en',
        supportPhone: '0721530120',
        supportEmail: 'support@flosisterlocks.com',
        plan: 'free',
        isActive: true,
      });

      const DEFAULT_SERVICES = [
        {
          name: 'Sisterlocks™ Installation',
          duration: 1200,
          price: 10000,
          description: 'Professional installation by a certified consultant.',
          image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?auto=format&fit=crop&q=80&w=400',
          tenantId: tenant._id,
        },
        {
          name: 'Retightening & Maintenance',
          duration: 240,
          price: 3500,
          description: 'Regular maintenance to keep your Sisterlocks neat and healthy.',
          image: 'https://images.unsplash.com/photo-1620331311520-246422fd82f9?auto=format&fit=crop&q=80&w=400',
          tenantId: tenant._id,
        },
        {
          name: 'Consultation',
          duration: 60,
          price: 1000,
          description: 'Mandatory session before installation.',
          image: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?auto=format&fit=crop&q=80&w=400',
          tenantId: tenant._id,
        },
      ];

      const services = await Service.insertMany(DEFAULT_SERVICES);

      // Seed default attendant "flo"
      const pinHash = await bcrypt.hash('1234', 10);
      await Attendant.create({
        name: 'Florence',
        username: 'flo',
        pinHash,
        isActive: true,
        serviceIds: services.map(s => s._id),
        tenantId: tenant._id,
      });

      console.log('✅ Default tenant "flo-sisterlocks" auto-seeded successfully!');
      console.log('🔑 Owner Login: owner@flosisterlocks.com / password123');
      console.log('🔑 Staff Login: flo / PIN 1234');
    }
  } catch (error) {
    console.error('❌ Failed to seed default tenant:', error);
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

  // Trust first proxy (Render load balancer)
  app.set('trust proxy', 1);

  // Lightweight health check route registered before other middlewares/rate-limiters
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── Middleware ────────────────────────────────────────────
  app.use(cors());          // Allow cross-origin requests from the frontend
  app.use(express.json());  // Parse JSON request bodies

  // ── Database ─────────────────────────────────────────────
  await connectDB();
  await seedDefaultTenant();

  // ── Reminder Scheduler (starts after DB is ready) ────────
  startReminderScheduler();

  // ── DB Status Middleware ─────────────────────────────────
  // Prevents Mongoose buffering timeouts by returning 503 if DB is down
  app.use((req, res, next) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    const isApiRoute = req.path.startsWith('/api');
    const isHealthCheck = req.path === '/api/health';

    if (isApiRoute && !isHealthCheck && !isDbConnected) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database is currently disconnected. Please check MONGODB_URI.',
        code: 'DB_DISCONNECTED'
      });
    }
    next();
  });

  // ── Tenant Resolution ───────────────────────────────────
  // Applied to every /api route EXCEPT the three public endpoints below.
  // The skip-list must stay in sync with authRoutes.ts.
  const PUBLIC_PATHS = [
    '/api/auth/tenant/register',
    '/api/auth/owner/login',
    '/api/health',
  ];
  app.use('/api', (req, res, next) => {
    const fullPath = '/api' + req.path;
    if (PUBLIC_PATHS.includes(fullPath)) return next();
    return resolveTenant(req, res, next);
  });

  // Single-tenant auto-seed removed.
  // New tenants receive default services via POST /api/auth/tenant/register.

  // ── API Routes ───────────────────────────────────────────
  app.use('/api/services', serviceRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/availability', availabilityRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/attendant', attendantRoutes);
  app.use('/api/tenant', tenantRoutes);

  // ── Health Check ─────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Static Files (Production) ────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.join(__dirname, '../frontend/dist');

    // Serve sw.js and manifest with no-cache so browsers always get the
    // latest version. Stale service workers are the #1 cause of PWA bugs.
    app.use((req, res, next) => {
      if (
        req.path === '/sw.js' ||
        req.path === '/manifest.webmanifest' ||
        req.path.endsWith('.webmanifest')
      ) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
      next();
    });

    // Serve hashed assets with long-lived immutable caching for performance.
    app.use(
      '/assets',
      express.static(path.join(frontendDist, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }),
    );

    // Serve remaining static files (icons, favicon, etc.) with a short cache.
    app.use(express.static(frontendDist, { maxAge: '1h' }));

    // Handle SPA routing: serve index.html for any unknown routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next(); // Let 404 handler or error handler catch missing API routes
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // ── Error Handler (must be last) ────────────────────────
  app.use(errorHandler);

  // ── Start Server ─────────────────────────────────────────
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
// Backend restart trigger
