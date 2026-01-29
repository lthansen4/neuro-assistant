/**
 * Gesso API Server
 * v1.3.0 - Fixed quickAdd to use calendarEventsNew table
 * Build: 2026-01-16T15:50:00Z
 */
import { Hono } from 'hono';

// Startup log to verify deployment version - UNIQUE BUILD ID: BUILD_20260116_1550
console.log('[Gesso API] Starting server v1.3.0 (Build: 2026-01-16T15:50)');
console.log('[Gesso API] Description field support: ENABLED');
console.log('[Gesso API] Using calendarEventsNew for all calendar operations');
import { cors } from 'hono/cors';
import { coursesRoute } from './routes/courses';
import { assignmentsRoute } from './routes/assignments';
import { calendarRoute } from './routes/calendar';
import rebalancingRoute from './routes/rebalancing';
import { uploadRoute } from './routes/upload';
import { dashboardRoute } from './routes/dashboard';
import { quickAddRoute } from './routes/quickAdd';
import { userRoute } from './routes/user';
import energyRoute from './routes/energy';
import { nudgesRoute } from './routes/nudges';
import adhdFeaturesRoute from './routes/adhd-features';
import { sessionsRoute } from './routes/sessions';
import { plannerRoute } from './routes/planner';
import rescueRoute from './routes/rescue';
import { timerRoute } from './routes/timer';
import { cronRoute } from './routes/cron';

import { runMigrations } from './lib/migrations';

const app = new Hono();

// Manual migration trigger (Failsafe)
app.get('/api/admin/migrate', async (c) => {
  console.log('🛡️ [Admin] Manual migration trigger called');
  const secret = c.req.query('secret');
  if (secret !== process.env.CRON_SECRET && secret !== 'FORCE_MIGRATE') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    await runMigrations();
    return c.json({ ok: true, message: 'Migrations completed' });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Configure CORS for production and development
const allowedOrigins = [
  'http://localhost:3000',
  'https://neuroweb-production.up.railway.app',
  'https://gessoweb-production.up.railway.app',
  'https://gesso-web-production.up.railway.app',
];
const envOrigins = (process.env.CORS_ALLOW_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const isRailwayOrigin = (origin: string) => {
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith('.up.railway.app');
  } catch {
    return false;
  }
};

app.use('*', cors({
  origin: (origin) => {
    if (!origin) {
      // Fallback for same-origin requests in server contexts
      return allowedOrigins[0];
    }
    if (envOrigins.includes(origin)) return origin;
    if (allowedOrigins.includes(origin)) return origin;
    if (isRailwayOrigin(origin)) return origin;
    return ''; // block everything else
  },
  allowHeaders: ['Content-Type', 'Authorization', 'x-clerk-user-id'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.route('/api/courses', coursesRoute);
app.route('/api/assignments', assignmentsRoute);
app.route('/api/calendar', calendarRoute);
app.route('/api/rebalancing', rebalancingRoute);
app.route('/api/upload', uploadRoute);
app.route('/api/dashboard', dashboardRoute);
app.route('/api/quick-add', quickAddRoute);
app.route('/api/user', userRoute);
app.route('/api/energy', energyRoute);
app.route('/api/nudges', nudgesRoute);
app.route('/api/adhd', adhdFeaturesRoute); // Priority 2 ADHD features
app.route('/api/sessions', sessionsRoute);
app.route('/api/planner', plannerRoute);
app.route('/api/rescue', rescueRoute); // Rescue Mode for overwhelmed students
app.route('/api/timer', timerRoute); // Epic 4: Timer context and buffer time management
app.route('/api/cron', cronRoute); // Scheduled jobs (buffer reset, daily optimization)

// Simple health check
app.get('/health', (c) => c.text('ok'));

export default app;
