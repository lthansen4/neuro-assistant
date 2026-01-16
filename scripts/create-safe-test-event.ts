import { db } from '../apps/api/src/lib/db';
import { calendarEventsNew } from '../packages/db/src/schema';

const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';

async function main() {
  // Create event at 2 PM tomorrow (14:00 UTC) - safe time, not in sleep window
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(14, 0, 0, 0); // 2 PM UTC
  
  const endTime = new Date(tomorrow);
  endTime.setUTCHours(15, 0, 0, 0); // 3 PM UTC (1 hour duration)
  
  const [event] = await db.insert(calendarEventsNew).values({
    userId,
    title: 'Test Focus Session #1',
    eventType: 'Focus',
    startAt: tomorrow,
    endAt: endTime,
    isMovable: true,
    metadata: { test: true, testNumber: 1 }
  }).returning();
  
  console.log('Created test event:');
  console.log(`  Title: ${event.title}`);
  console.log(`  Start: ${event.startAt.toISOString()} (${event.startAt.getUTCHours()}:00 UTC)`);
  console.log(`  End: ${event.endAt.toISOString()}`);
  console.log(`  isMovable: ${event.isMovable}`);
  console.log(`  ✓ Safe time (not in 23:00-07:00 UTC sleep window)`);
  
  process.exit(0);
}

main().catch(console.error);





