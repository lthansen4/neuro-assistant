import { db, schema } from '../apps/api/src/lib/db';
import { eq } from 'drizzle-orm';

async function checkEvents() {
  try {
    const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';
    
    console.log('🔍 Checking event metadata...');
    
    const events = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    console.log(`Found ${events.length} events\n`);
    
    const workEvents = events.filter(e => e.title.includes('Work on:'));
    
    for (const event of workEvents) {
      console.log(`📅 "${event.title}"`);
      console.log(`   ID: ${event.id}`);
      console.log(`   metadata:`, event.metadata);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEvents();
