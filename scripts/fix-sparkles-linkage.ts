import { db } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';

async function fixSparklesLinkage() {
  console.log('🔧 Fixing Math Sparkles Assignment linkage...\n');
  
  // Get the assignment ID
  const assignmentResult = await db.execute(sql`
    SELECT id FROM assignments WHERE title LIKE '%Sparkles%' ORDER BY created_at DESC LIMIT 1
  `);
  
  if (assignmentResult.rows.length === 0) {
    console.log('❌ No assignment found');
    process.exit(1);
  }
  
  const assignmentId = (assignmentResult.rows[0] as any).id;
  console.log(`📋 Assignment ID: ${assignmentId}\n`);
  
  // Update all Sparkles events to link to this assignment
  const updateResult = await db.execute(sql`
    UPDATE calendar_events_new
    SET linked_assignment_id = ${assignmentId}::uuid
    WHERE title LIKE '%Sparkles%'
    AND event_type = 'Focus'
    RETURNING id, title
  `);
  
  console.log(`✅ Updated ${updateResult.rowCount} Focus blocks to link to assignment\n`);
  
  updateResult.rows.forEach((row: any) => {
    console.log(`   - ${row.title} (${row.id})`);
  });
  
  process.exit(0);
}

fixSparklesLinkage().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

