import { db, schema } from '../apps/api/src/lib/db';
import { eq, or, sql } from 'drizzle-orm';

async function deleteAllBuffers() {
  console.log('🧹 [Cleanup] Starting deletion of all Transition Buffer events...');
  
  try {
    // We target events by title OR metadata flag to be thorough
    const result = await db.delete(schema.calendarEventsNew)
      .where(
        or(
          eq(schema.calendarEventsNew.title, 'Transition Buffer'),
          sql`${schema.calendarEventsNew.metadata}->>'transitionTax' = 'true'`
        )
      )
      .returning({ id: schema.calendarEventsNew.id });
    
    console.log(`✅ [Cleanup] Successfully deleted ${result.length} transition buffer events.`);
    
    // Also check the legacy table just in case
    const legacyResult = await db.delete(schema.calendarEvents)
      .where(eq(schema.calendarEvents.title, 'Transition Buffer'))
      .returning({ id: schema.calendarEvents.id });
      
    if (legacyResult.length > 0) {
      console.log(`✅ [Cleanup] Also deleted ${legacyResult.length} legacy buffer events.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ [Cleanup] Deletion failed:', error);
    process.exit(1);
  }
}

deleteAllBuffers();

