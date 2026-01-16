#!/usr/bin/env node
/**
 * Nudge Scanner Cron Job
 * 
 * Scans for classes that just ended in the last 2 minutes and creates nudges.
 * Run this every minute via cron.
 */

import { scanAndQueueNudges } from '../apps/api/src/lib/nudge-scheduler';
import { DateTime } from 'luxon';

async function run() {
  try {
    console.log(`\n========== NUDGE SCANNER CRON ==========`);
    console.log(`[NudgeCron] Starting scan at ${new Date().toISOString()}\n`);

    // Scan last 2 minutes (to account for any delays)
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 2 * 60 * 1000);

    const result = await scanAndQueueNudges(windowStart, windowEnd);

    console.log('\n[NudgeCron] Scan complete:');
    console.log(`  ✅ Queued:   ${result.queued}`);
    console.log(`  ⏰ Deferred: ${result.deferred}`);
    console.log(`  ⏭️  Skipped:  ${result.skipped}`);

    if (result.errors.length > 0) {
      console.error('\n[NudgeCron] ❌ Errors encountered:');
      result.errors.forEach(err => console.error(`  - ${err}`));
    }

    console.log(`\n========================================\n`);
    process.exit(0);
  } catch (error) {
    console.error('\n[NudgeCron] FATAL ERROR:', error);
    process.exit(1);
  }
}

run();





