import { db, schema } from '../apps/api/src/lib/db';
import { eq } from 'drizzle-orm';

async function updateEventDurations() {
  try {
    const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';
    
    console.log('🔧 Updating event durations to match checklists...');
    
    // Get all checklists for this user
    const checklists = await db.query.assignmentChecklists.findMany({});
    
    console.log(`Found ${checklists.length} checklists`);
    
    for (const checklist of checklists) {
      if (!checklist.eventId) continue;
      
      const items = checklist.items as any[];
      const totalMinutes = items.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
      
      // Get the event
      const event = await db.query.calendarEventsNew.findFirst({
        where: eq(schema.calendarEventsNew.id, checklist.eventId)
      });
      
      if (!event) {
        console.log(`⚠️ Event ${checklist.eventId} not found`);
        continue;
      }
      
      const oldDuration = (event.endAt.getTime() - event.startAt.getTime()) / (60 * 1000);
      const newEndAt = new Date(event.startAt.getTime() + totalMinutes * 60 * 1000);
      
      if (totalMinutes !== oldDuration) {
        await db.update(schema.calendarEventsNew)
          .set({ endAt: newEndAt })
          .where(eq(schema.calendarEventsNew.id, checklist.eventId));
        
        console.log(`✅ Updated "${event.title}" from ${oldDuration}m to ${totalMinutes}m`);
      } else {
        console.log(`⏭️ "${event.title}" already correct (${totalMinutes}m)`);
      }
    }
    
    console.log('🎉 All event durations updated! Now check for conflicts manually in the app.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateEventDurations();
