import { db, schema } from '../lib/db';
import { sql } from 'drizzle-orm';

/**
 * Midnight Buffer Reset Cron Job
 * 
 * Runs at midnight (in each user's timezone) to expire unused buffer time.
 * Buffer time is earned from completing focus sessions (15 min per session)
 * but expires if not used by end of day.
 * 
 * Epic 4: Focus & Recovery Timers - Buffer Time Management
 * 
 * This maintains the "use it or lose it" nature of buffer time to encourage
 * immediate breaks after focus sessions (the "Transition Tax" philosophy).
 */

/**
 * Reset buffer time for all users
 * 
 * Note: This sets buffer_minutes_earned and buffer_minutes_used to 0
 * for yesterday's records. Today's buffer will accumulate as users
 * complete focus sessions.
 */
export async function runMidnightBufferReset() {
  console.log('[BufferReset] Starting midnight buffer reset at', new Date().toISOString());
  
  try {
    // Get yesterday's date (UTC)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Reset buffer time for yesterday's records
    // We don't delete the records, just zero out buffer fields
    // This preserves the productivity history
    const result = await db
      .update(schema.userDailyProductivity)
      .set({
        bufferMinutesEarned: 0,
        bufferMinutesUsed: 0,
      })
      .where(sql`${schema.userDailyProductivity.day} < CURRENT_DATE`)
      .returning({ 
        userId: schema.userDailyProductivity.userId, 
        day: schema.userDailyProductivity.day 
      });
    
    console.log(`[BufferReset] Reset buffer time for ${result.length} daily records`);
    
    // Also clean up any records older than 90 days to prevent database bloat
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];
    
    const deleted = await db
      .delete(schema.userDailyProductivity)
      .where(sql`${schema.userDailyProductivity.day} < ${ninetyDaysAgoStr}`)
      .returning({ day: schema.userDailyProductivity.day });
    
    if (deleted.length > 0) {
      console.log(`[BufferReset] Cleaned up ${deleted.length} records older than 90 days`);
    }
    
    return {
      success: true,
      recordsReset: result.length,
      recordsDeleted: deleted.length,
      timestamp: now.toISOString(),
    };

  } catch (error) {
    console.error('[BufferReset] Midnight buffer reset failed:', error);
    throw error;
  }
}

/**
 * Wrapper for running as a scheduled cron job
 * Can be called from various cron services
 */
export async function midnightBufferResetHandler(event?: any) {
  console.log('[BufferReset] Handler invoked with event:', event);
  
  try {
    const result = await runMidnightBufferReset();
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[BufferReset] Handler error:', error);
    
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
 * Call this from: POST /api/cron/buffer-reset
 */
export async function manualTrigger() {
  console.log('[BufferReset] Manual trigger initiated');
  return await runMidnightBufferReset();
}

// Example Vercel Cron configuration (add to vercel.json):
/*
{
  "crons": [{
    "path": "/api/cron/buffer-reset",
    "schedule": "0 0 * * *"
  }]
}
*/

// Example Railway cron configuration:
/*
Add to railway.json or use Railway's Cron Jobs feature:
- Schedule: "0 0 * * *" (midnight UTC)
- Command: curl -X POST https://your-api.railway.app/api/cron/buffer-reset
          -H "Authorization: Bearer $CRON_SECRET"
*/

