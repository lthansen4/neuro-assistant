import { Hono } from 'hono';
export const calendarRoute = new Hono();

calendarRoute.post('/event-drop', async (c) => {
  const body = await c.req.json();
  // TODO: update event times if is_movable
  return c.json({ ok: true, body });
});
