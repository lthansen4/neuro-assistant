import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { coursesRoute } from './routes/courses';
import { assignmentsRoute } from './routes/assignments';
import { calendarRoute } from './routes/calendar';
import { rebalancingRoute } from './routes/rebalancing';
import { uploadRoute } from './routes/upload';

const app = new Hono();
app.use('*', cors());

app.route('/api/courses', coursesRoute);
app.route('/api/assignments', assignmentsRoute);
app.route('/api/calendar', calendarRoute);
app.route('/api/rebalancing', rebalancingRoute);
app.route('/api/upload', uploadRoute);

export default app;
