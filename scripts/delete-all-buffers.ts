import { db, schema } from '../apps/api/src/lib/db';
import { eq, or, sql } from 'drizzle-orm';

async function deleteAllBuffers() {
  console.log('🧹 [Cleanup] Starting deletion of all Transition Buffer events...');
  
  try {
    // 1. Delete from calendar_events_new (the primary table)
    // We target by title, metadata flag, or specific purpose string to be exhaustive
    const result = await db.delete(schema.calendarEventsNew)
      .where(
        or(
          eq(schema.calendarEventsNew.title, 'Transition Buffer'),
          eq(schema.calendarEventsNew.title, 'CHILL'),
          sql`${schema.calendarEventsNew.metadata}->>'transitionTax' = 'true'`,
          sql`${schema.calendarEventsNew.metadata}->>'purpose' ILIKE '%Context switching%'`
        )
      )
      .returning({ id: schema.calendarEventsNew.id, title: schema.calendarEventsNew.title });
    
    console.log(`✅ [Cleanup] Successfully deleted ${result.length} transition buffer/chill events from calendar_events_new.`);
    
    // 2. Also check the legacy calendar_events table just in case
    const legacyResult = await db.delete(schema.calendarEvents)
      .where(
        or(
          eq(schema.calendarEvents.title, 'Transition Buffer'),
          eq(schema.calendarEvents.title, 'CHILL')
        )
      )
      .returning({ id: schema.calendarEvents.id });
      
    if (legacyResult.length > 0) {
      console.log(`✅ [Cleanup] Also deleted ${legacyResult.length} legacy buffer events.`);
    }

    console.log('\n✨ Cleanup complete! Your calendar should now be free of glitched buffers.');
    process.exit(0);
  } catch (error) {
    console.error('❌ [Cleanup] Deletion failed:', error);
    process.exit(1);
  }
}

deleteAllBuffers();

