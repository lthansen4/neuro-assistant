import { db, schema } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';

async function checkEvents() {
  try {
    const events = await db.query.calendarEventsNew.findMany({
      limit: 50
    });
    
    console.log('--- LATEST 50 EVENTS ---');
    events.forEach(e => {
      console.log(`Title: "${e.title}" | Type: ${e.eventType} | Start: ${e.startAt.toISOString()}`);
    });
    
    const countResult = await db.execute(sql`SELECT count(*) FROM calendar_events_new`);
    console.log(`\nTotal events in calendar_events_new: ${countResult.rows[0].count}`);
    
    const colCheck = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'completion_percentage'`);
    console.log(`\nColumn 'completion_percentage' exists: ${colCheck.rows.length > 0 ? 'YES' : 'NO'}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEvents();

