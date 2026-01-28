import { db } from '../apps/api/src/lib/db';
import * as schema from '../packages/db/src/schema';
import { eq } from 'drizzle-orm';

const assignmentId = 'c6e4c49f-a972-47b6-b0ae-fdf5fc3759e4';

async function debugAssignment() {
  console.log(`\n🔍 Debugging assignment ${assignmentId}...\n`);
  
  // Check if checklist exists
  const checklists = await db.select().from(schema.assignmentChecklists)
    .where(eq(schema.assignmentChecklists.assignmentId, assignmentId));
  
  console.log(`Existing checklists: ${checklists.length}`);
  if (checklists.length > 0) {
    console.log('⚠️  Checklist already exists! This would cause UNIQUE constraint violation.');
    console.log(JSON.stringify(checklists, null, 2));
  }
  
  // Check assignment details
  const [assignment] = await db.select().from(schema.assignments)
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  
  if (!assignment) {
    console.log('❌ Assignment not found!');
  } else {
    console.log(`\n✅ Assignment found:`);
    console.log(`   Title: ${assignment.title}`);
    console.log(`   Category: ${assignment.category || '(none)'}`);
    console.log(`   User ID: ${assignment.userId}`);
    console.log(`   Course ID: ${assignment.courseId || '(none)'}`);
    console.log(`   Due Date: ${assignment.dueDate}`);
    console.log(`   Is Stuck: ${assignment.isStuck}`);
    console.log(`   Deferral Count: ${assignment.deferralCount}`);
  }
  
  process.exit(0);
}

debugAssignment().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});







