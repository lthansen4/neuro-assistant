import { db } from '../apps/api/src/lib/db';
import { calendarEventsNew } from '../packages/db/src/schema';
import { eq } from 'drizzle-orm';

const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';

async function main() {
  const allEvents = await db.query.calendarEventsNew.findMany({
    where: eq(calendarEventsNew.userId, userId),
    limit: 10
  });

  console.log('Total events for user:', allEvents.length);
  
  const classEvents = allEvents.filter(e => e.eventType === 'Class');
  const movableEvents = allEvents.filter(e => e.isMovable);
  
  console.log('Class events:', classEvents.length);
  console.log('Movable events:', movableEvents.length);
  
  console.log('\nSample events:');
  allEvents.slice(0, 5).forEach(e => {
    console.log(`  - ${e.eventType}: ${e.title?.substring(0, 40)} | isMovable: ${e.isMovable}`);
  });
  
  process.exit(0);
}

main().catch(console.error);





