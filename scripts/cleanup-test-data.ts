import { db, schema } from '../apps/api/src/lib/db';
import { eq } from 'drizzle-orm';

async function cleanup() {
  try {
    const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';
    
    console.log('🧹 Cleaning up test data for user:', userId);
    
    // Delete all checklists for this user's assignments
    const userAssignments = await db.query.assignments.findMany({
      where: eq(schema.assignments.userId, userId)
    });
    
    console.log(`Found ${userAssignments.length} assignments to clean`);
    
    for (const assignment of userAssignments) {
      await db.delete(schema.assignmentChecklists)
        .where(eq(schema.assignmentChecklists.assignmentId, assignment.id));
    }
    console.log('✅ Deleted checklists');
    
    // Delete all calendar events
    const deletedEvents = await db.delete(schema.calendarEventsNew)
      .where(eq(schema.calendarEventsNew.userId, userId))
      .returning();
    console.log(`✅ Deleted ${deletedEvents.length} calendar events`);
    
    // Delete all assignments
    const deletedAssignments = await db.delete(schema.assignments)
      .where(eq(schema.assignments.userId, userId))
      .returning();
    console.log(`✅ Deleted ${deletedAssignments.length} assignments`);
    
    console.log('🎉 All test data cleared! Refresh your browser.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanup();
