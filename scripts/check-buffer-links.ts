import { db, schema } from '../apps/api/src/lib/db';
import { eq } from 'drizzle-orm';

async function checkBuffers() {
  try {
    const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';
    
    const events = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    const buffers = events.filter(e => e.title === 'Transition Buffer');
    
    console.log(`Found ${buffers.length} transition buffers:\n`);
    
    for (const buffer of buffers) {
      console.log(`Buffer ID: ${buffer.id}`);
      console.log(`  Time: ${buffer.startAt.toISOString()}`);
      console.log(`  Metadata:`, buffer.metadata);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBuffers();
