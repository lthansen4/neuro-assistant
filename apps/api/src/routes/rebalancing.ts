import { Hono } from 'hono';
export const rebalancingRoute = new Hono();

rebalancingRoute.post('/propose', async (c) => {
  const body = await c.req.json();
  // TODO: compute proposals based on conflicts and priorities
  return c.json({ proposals: [], input: body });
});

rebalancingRoute.post('/confirm', async (c) => {
  const body = await c.req.json();
  // TODO: apply proposals to DB
  return c.json({ ok: true, input: body });
});
