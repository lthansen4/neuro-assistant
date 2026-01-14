import { db, schema } from '../apps/api/src/lib/db';
import { eq } from 'drizzle-orm';

async function deleteChecklists() {
  try {
    console.log('🧹 Deleting all checklists...');
    
    const deleted = await db.delete(schema.assignmentChecklists).returning();
    
    console.log(`✅ Deleted ${deleted.length} checklists`);
    console.log('🎉 Clean slate! Now test fresh with the proper flow.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteChecklists();
