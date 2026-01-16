import { db } from '../apps/api/src/lib/db';
import * as schema from '../packages/db/src/schema';

async function checkChecklists() {
  const checklists = await db.select().from(schema.assignmentChecklists);
  console.log(`\n📋 Checklists in database: ${checklists.length}\n`);
  
  if (checklists.length > 0) {
    checklists.forEach((c, i) => {
      console.log(`${i + 1}. Checklist ID: ${c.id}`);
      console.log(`   Assignment ID: ${c.assignmentId}`);
      console.log(`   Event ID: ${c.eventId || 'None'}`);
      console.log(`   Items: ${(c.items as any[]).length} tasks`);
      console.log(`   Created: ${c.createdAt}`);
      console.log(`   Completed: ${c.completedAt || 'Not completed'}\n`);
    });
  } else {
    console.log('❌ No checklists found. You need to trigger the "Wall of Awful" modal to create one.\n');
  }
  
  process.exit(0);
}

checkChecklists().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});





