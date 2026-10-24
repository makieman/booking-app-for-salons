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

// Load environment variables before importing routes that depend on process.env
dotenv.config({ path: path.resolve(__dirname, '.env') });


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
import whatsappRoutes from './routes/whatsappRoutes';
import { startReminderScheduler } from './services/reminderService';
import { resolveTenant } from './middleware/resolveTenant';
import { migratePushSubscriptionIndexes } from './scripts/migratePushSubscriptionIndex';
import { verifyEmailConfig } from './services/emailService';

import Tenant from './models/Tenant';
import Attendant from './models/Attendant';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Seeds a default tenant (flo-sisterlocks) and default services/attendants if the DB is empty.
 * Only runs if SEED_DEFAULT_TENANT === 'true' and never logs credentials in production.
 */
export async function seedDefaultTenant(): Promise<void> {
  if (process.env.SEED_DEFAULT_TENANT !== 'true') {
    return;
  }
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ Skipping database seeding: No active MongoDB connection.');
    return;
  }
  try {
    const tenantCount = await Tenant.countDocuments();
    if (tenantCount === 0) {
      console.log('🌱 No tenants found in database. Auto-seeding default tenant "flo-sisterlocks"...');
      const randomPassword = crypto.randomBytes(8).toString('hex');
      const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const tenant = await Tenant.create({
        name: 'Flo Sisterlocks',
        slug: 'flo-sisterlocks',
        ownerEmail: 'owner@flosisterlocks.com',
        ownerPasswordHash: passwordHash,
        timezone: 'Africa/Nairobi',
        workingHours: { start: '09:00', end: '18:00' },
        branding: {
          primaryColor: '#C4466F',
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
      const pinHash = await bcrypt.hash(randomPin, 10);
      await Attendant.create({
        name: 'Flora',
        username: 'flo',
        pinHash,
        isActive: true,
        serviceIds: services.map(s => s._id),
        tenantId: tenant._id,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Default tenant "flo-sisterlocks" auto-seeded successfully!');
        console.log(`🔑 Owner Login: owner@flosisterlocks.com / ${randomPassword}`);
        console.log(`🔑 Staff Login: flo / PIN ${randomPin}`);
      } else {
        console.log('✅ Default tenant auto-seeded (credentials withheld in production).');
      }
    }
  } catch (error) {
    console.error('❌ Failed to seed default tenant:', error);
  }
}

/**
 * Creates and configures the Express application with all middlewares, routes, and error handling.
 */
export function createApp(): Express {
  const app: Express = express();

  // Trust first proxy (Render/Vercel load balancer)
  app.set('trust proxy', 1);

  // Lightweight health check route registered before other middlewares/rate-limiters
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── Middleware ────────────────────────────────────────────
  app.use(cors({
    exposedHeaders: ['ETag']
  }));

  // Parse JSON and keep req.rawBody buffer for HMAC signature verification (e.g. Meta WhatsApp)
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

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
  // Applied to every /api route EXCEPT the public endpoints below.
  const PUBLIC_PATHS = [
    '/api/auth/tenant/register',
    '/api/auth/owner/login',
    '/api/auth/owner/forgot-password',
    '/api/auth/owner/reset-password',
    '/api/health',
    // WhatsApp Cloud API webhook — Meta sends no X-Tenant-Slug
    '/api/whatsapp/webhook',
  ];
  app.use('/api', (req, res, next) => {
    const fullPath = '/api' + req.path;
    if (PUBLIC_PATHS.includes(fullPath)) return next();
    return resolveTenant(req, res, next);
  });

  // ── WhatsApp Cloud API webhook (no tenant middleware) ────────────────────
  app.use('/api/whatsapp', whatsappRoutes);

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

  // ── Error Handler (must be last) ────────────────────────
  app.use(errorHandler);

  return app;
}

/**
 * Starts the Express server.
 * - Connects to MongoDB
 * - Seeds initial data
 * - Registers API routes
 * - Starts listening on the configured PORT
 */
async function startServer(): Promise<void> {
  const PORT = parseInt(process.env.PORT || '5000', 10);

  // ── Database ─────────────────────────────────────────────
  await connectDB();
  await seedDefaultTenant();

  // ── Safe Migrations & Production Verifications ────────────
  try {
    await migratePushSubscriptionIndexes();
  } catch (err) {
    console.warn('[server] Warning: PushSubscription index migration failed:', err);
  }
  verifyEmailConfig();

  // ── Reminder Scheduler (starts after DB is ready) ────────
  startReminderScheduler();

  const app = createApp();

  // ── Render Free Tier Keep-Warm Ping ───────────────────────
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
  if (externalUrl) {
    const RENDER_PING_INTERVAL_MS = 14 * 60 * 1000;
    setInterval(async () => {
      try {
        await fetch(`${externalUrl}/health`);
      } catch {
        // Silently catch to avoid polluting logs
      }
    }, RENDER_PING_INTERVAL_MS);
  }

  // ── Static Files (Production) ────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.join(__dirname, '../frontend/dist');

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

    app.use(
      '/assets',
      express.static(path.join(frontendDist, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }),
    );

    app.use(express.static(frontendDist, { maxAge: '1h' }));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // ── Start Server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  });
}

const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isExecutedDirectly = (executedFile === currentFile || executedFile.endsWith('server.ts') || executedFile.endsWith('server.js')) && !process.argv.some(arg => arg.includes('test'));

if (isExecutedDirectly) {
  startServer().catch((err) => {
    console.error('❌ Fatal error in startServer:', err);
  });
}
