import { Hono } from 'hono';
export const assignmentsRoute = new Hono();

assignmentsRoute.post('/', async (c) => {
  const body = await c.req.json();
  // TODO: quick add parsing and creation
  return c.json({ ok: true, body });
});
