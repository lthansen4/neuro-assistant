import { HeuristicEngine } from '../lib/heuristic-engine';
import { db } from '../lib/db';
import { assignments } from '../../../../packages/db/src/schema';
import { gte, lte, eq } from 'drizzle-orm';

/**
 * Daily Optimization Cron Job
 * 
 * Runs at 7 AM user local time (configurable) to proactively optimize
 * each user's schedule for the day and upcoming week.
 * 
 * This would typically be triggered by a cron service like:
 * - Vercel Cron
 * - AWS EventBridge
 * - GitHub Actions
 * - or a dedicated cron service
 */

/**
 * Main cron handler - Run daily optimization for all active users
 */
export async function runDailyOptimization() {
  console.log('[DailyCron] Starting daily optimization run at', new Date().toISOString());
  
  try {
    // Get all users who have assignments due in the next 14 days
    const now = new Date();
    const futureLimit = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const upcomingAssignments = await db
      .select({
        userId: assignments.userId
      })
      .from(assignments)
      .where(
        gte(assignments.dueDate, now)
      )
      .groupBy(assignments.userId);

    const uniqueUserIds = [...new Set(upcomingAssignments.map(a => a.userId))];
    
    console.log(`[DailyCron] Found ${uniqueUserIds.length} active users with upcoming assignments`);

    let successCount = 0;
    let errorCount = 0;

    // Process each user
    for (const userId of uniqueUserIds) {
      try {
        await optimizeUserSchedule(userId);
        successCount++;
      } catch (error) {
        console.error(`[DailyCron] Failed to optimize for user ${userId}:`, error);
        errorCount++;
      }
    }

    console.log(`[DailyCron] Completed daily optimization: ${successCount} successful, ${errorCount} errors`);
    
    return {
      success: true,
      processed: uniqueUserIds.length,
      successful: successCount,
      errors: errorCount
    };

  } catch (error) {
    console.error('[DailyCron] Daily optimization run failed:', error);
    throw error;
  }
}

/**
 * Optimize schedule for a single user
 */
async function optimizeUserSchedule(userId: string) {
  console.log(`[DailyCron] Optimizing schedule for user ${userId}`);

  // Use a default moderate energy level for daily optimization
  const DEFAULT_ENERGY_LEVEL = 5;

  const engine = new HeuristicEngine(userId);
  
  const result = await engine.generateComprehensiveProposal({
    userId,
    energyLevel: DEFAULT_ENERGY_LEVEL,
    type: 'daily',
    lookaheadDays: 14
  });

  if (result.moves.length > 0) {
    console.log(`[DailyCron] Generated ${result.moves.length} optimization moves for user ${userId}`);
    
    // TODO: Send notification to user about available optimization
    // This could be:
    // - Push notification
    // - Email
    // - In-app notification
    // For now, just log
    console.log(`[DailyCron] User ${userId} has ${result.moves.length} optimization suggestions available (proposal: ${result.proposalId})`);
  } else {
    console.log(`[DailyCron] User ${userId} schedule is already optimal`);
  }

  return result;
}

/**
 * Wrapper for running as a scheduled cron job
 * Can be called from various cron services
 */
export async function dailyOptimizationHandler(event?: any) {
  console.log('[DailyCron] Handler invoked with event:', event);
  
  try {
    const result = await runDailyOptimization();
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[DailyCron] Handler error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Manual trigger endpoint (for testing)
 * Call this from: POST /api/cron/daily-optimization
 */
export async function manualTrigger(userId?: string) {
  if (userId) {
    // Optimize single user
    console.log(`[DailyCron] Manual trigger for user ${userId}`);
    return await optimizeUserSchedule(userId);
  } else {
    // Optimize all users
    console.log('[DailyCron] Manual trigger for all users');
    return await runDailyOptimization();
  }
}

// Example Vercel Cron configuration (add to vercel.json):
/*
{
  "crons": [{
    "path": "/api/cron/daily-optimization",
    "schedule": "0 7 * * *"
  }]
}
*/

// Example cron route (add to routes/cron.ts):
/*
import { Hono } from 'hono';
import { dailyOptimizationHandler } from '../cron/daily-optimization';

const cronRoute = new Hono();

cronRoute.post('/daily-optimization', async (c) => {
  // Verify cron secret for security
  const cronSecret = c.req.header('authorization');
  const expectedSecret = process.env.CRON_SECRET || 'development-secret';
  
  if (cronSecret !== `Bearer ${expectedSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const result = await dailyOptimizationHandler();
  return c.json(result);
});

export default cronRoute;
*/

