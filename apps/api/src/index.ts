import { Hono } from 'hono';
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

const app = new Hono();

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
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

// Simple health check
app.get('/health', (c) => c.text('ok'));

export default app;
