import { db } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';

async function checkSparkles() {
  console.log('🔍 Checking Math Sparkles Assignment events...\n');
  
  const result = await db.execute(sql`
    SELECT 
      id, 
      title, 
      linked_assignment_id,
      event_type,
      start_at,
      created_at
    FROM calendar_events_new 
    WHERE title LIKE '%Sparkles%'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  
  console.log(`Found ${result.rows.length} events:\n`);
  
  result.rows.forEach((row: any, idx: number) => {
    console.log(`${idx + 1}. ${row.title}`);
    console.log(`   ID: ${row.id}`);
    console.log(`   linkedAssignmentId: ${row.linked_assignment_id || '❌ NULL'}`);
    console.log(`   eventType: ${row.event_type}`);
    console.log(`   startAt: ${row.start_at}`);
    console.log(`   createdAt: ${row.created_at}`);
    console.log('');
  });
  
  // Also check if the assignment exists
  const assignmentResult = await db.execute(sql`
    SELECT id, title, created_at
    FROM assignments
    WHERE title LIKE '%Sparkles%'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  
  if (assignmentResult.rows.length > 0) {
    const assignment = assignmentResult.rows[0] as any;
    console.log('📋 Assignment found:');
    console.log(`   ID: ${assignment.id}`);
    console.log(`   Title: ${assignment.title}`);
    console.log(`   Created: ${assignment.created_at}`);
  } else {
    console.log('❌ No assignment found for Math Sparkles');
  }
  
  process.exit(0);
}

checkSparkles().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});



