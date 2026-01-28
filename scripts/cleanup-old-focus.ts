import { db } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';

async function cleanupOldFocusBlocks() {
  console.log('🧹 Cleaning up old test Focus blocks without linkedAssignmentId...');
  
  const result = await db.execute(sql`
    DELETE FROM calendar_events_new
    WHERE title LIKE 'Work on:%'
    AND linked_assignment_id IS NULL
    RETURNING id, title
  `);
  
  console.log(`✅ Deleted ${result.rowCount} old Focus blocks`);
  
  if (result.rows.length > 0) {
    console.log('Deleted events:');
    result.rows.forEach((row: any) => {
      console.log(`  - ${row.title} (${row.id})`);
    });
  }
  
  process.exit(0);
}

cleanupOldFocusBlocks().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});







