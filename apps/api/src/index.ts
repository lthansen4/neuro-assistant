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

const app = new Hono();

// Configure CORS for production and development
const allowedOrigins = [
  'http://localhost:3000',
  'https://neuroweb-production.up.railway.app',
];
const railwayRegex = /\.up\.railway\.app$/;

app.use('*', cors({
  origin: (origin) => {
    if (!origin) {
      // Fallback for same-origin requests in server contexts
      return 'https://neuroweb-production.up.railway.app';
    }
    if (allowedOrigins.includes(origin)) return origin;
    if (railwayRegex.test(origin)) return origin;
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

// Simple health check
app.get('/health', (c) => c.text('ok'));

export default app;
