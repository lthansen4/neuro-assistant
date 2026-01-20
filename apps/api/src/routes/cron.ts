import { Hono } from 'hono';
import { midnightBufferResetHandler } from '../cron/midnight-buffer-reset';
import { dailyOptimizationHandler } from '../cron/daily-optimization';

export const cronRoute = new Hono();

/**
 * POST /api/cron/buffer-reset
 * Expires unused buffer time (runs at midnight)
 */
cronRoute.post('/buffer-reset', async (c) => {
  // Verify cron secret for security
  const authHeader = c.req.header('authorization');
  const expectedSecret = process.env.CRON_SECRET || 'development-secret';
  
  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.log('[Cron] Unauthorized buffer-reset attempt');
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  console.log('[Cron] Running midnight buffer reset...');
  const result = await midnightBufferResetHandler();
  return c.json(result.body ? JSON.parse(result.body) : result, result.statusCode);
});

/**
 * POST /api/cron/daily-optimization
 * Runs daily schedule optimization for all users
 */
cronRoute.post('/daily-optimization', async (c) => {
  // Verify cron secret for security
  const authHeader = c.req.header('authorization');
  const expectedSecret = process.env.CRON_SECRET || 'development-secret';
  
  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.log('[Cron] Unauthorized daily-optimization attempt');
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  console.log('[Cron] Running daily optimization...');
  const result = await dailyOptimizationHandler();
  return c.json(result.body ? JSON.parse(result.body) : result, result.statusCode);
});

/**
 * GET /api/cron/health
 * Health check for cron service
 */
cronRoute.get('/health', (c) => {
  return c.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    jobs: ['buffer-reset', 'daily-optimization']
  });
});

