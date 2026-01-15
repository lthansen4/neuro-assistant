import { db } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';

async function checkLinkedIds() {
  console.log('🔍 Checking linkedAssignmentId for Tripoly events...\n');
  
  const result = await db.execute(sql`
    SELECT 
      id, 
      title, 
      linked_assignment_id,
      event_type,
      start_at,
      is_movable
    FROM calendar_events_new 
    WHERE title LIKE '%Tripoly%'
    ORDER BY start_at
    LIMIT 10
  `);
  
  console.log(`Found ${result.rows.length} events:\n`);
  
  result.rows.forEach((row: any, idx: number) => {
    console.log(`${idx + 1}. ${row.title}`);
    console.log(`   ID: ${row.id}`);
    console.log(`   linkedAssignmentId: ${row.linked_assignment_id || '❌ NULL'}`);
    console.log(`   eventType: ${row.event_type}`);
    console.log(`   startAt: ${row.start_at}`);
    console.log(`   isMovable: ${row.is_movable}`);
    console.log('');
  });
  
  process.exit(0);
}

checkLinkedIds().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});




