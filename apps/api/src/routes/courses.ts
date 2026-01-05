import { Hono } from 'hono';
export const coursesRoute = new Hono();

coursesRoute.get('/', async (c) => {
  return c.json({ items: [] });
});

coursesRoute.post('/', async (c) => {
  const body = await c.req.json();
  return c.json({ ok: true, body });
});
