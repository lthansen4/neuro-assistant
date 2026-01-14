import { Hono } from 'hono';
import { db } from '../lib/db';
import { assignments, courses } from '../../../../packages/db/src/schema';
import { eq } from 'drizzle-orm';

export const assignmentsRoute = new Hono();

// Helper to get userId
async function getUserId(c: any): Promise<string | null> {
  const clerkUserId = c.req.header('x-clerk-user-id');
  if (!clerkUserId) {
    console.error('[Assignments API] Missing x-clerk-user-id header');
    return null;
  }

  const { users } = await import('../../../../packages/db/src/schema');
  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  });

  return user?.id || null;
}

/**
 * POST /api/assignments/quick-add
 * 
 * Quick add an assignment with AI auto-categorization and scoring
 */
assignmentsRoute.post('/quick-add', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { title, courseId, dueDate, category, effortEstimateMinutes } = body;

    if (!title || !dueDate) {
      return c.json({ error: 'title and dueDate are required' }, 400);
    }

    console.log(`[Assignments API] Quick-adding assignment: "${title}" for user ${userId}`);

    // Calculate priority score based on due date (urgency)
    const now = new Date();
    const due = new Date(dueDate);
    const daysUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    let priorityScore = 0;
    if (daysUntilDue < 1) {
      priorityScore = 100; // Critical
    } else if (daysUntilDue < 3) {
      priorityScore = 80; // Urgent
    } else if (daysUntilDue < 7) {
      priorityScore = 50; // Moderate
    } else {
      priorityScore = 20; // Low
    }

    // Adjust priority based on category (impact)
    if (category === 'Exam' || category === 'Project') {
      priorityScore += 20; // Boost for high-impact work
    } else if (category === 'Quiz' || category === 'Reading') {
      priorityScore -= 10; // Lower for quick tasks
    }

    // Clamp to 0-100
    priorityScore = Math.max(0, Math.min(100, priorityScore));

    console.log(`[Assignments API] Auto-calculated priority: ${priorityScore} (days until due: ${daysUntilDue.toFixed(1)})`);

    // Create the assignment with 'Scheduled' status (ADHD-friendly: no manual approval)
    const [assignment] = await db.insert(assignments).values({
      userId,
      courseId: courseId || null,
      title,
      dueDate: due,
      category: category || 'Assignment',
      effortEstimateMinutes: effortEstimateMinutes || 60,
      priorityScore,
      status: 'Scheduled', // Auto-schedule quick-add assignments
    }).returning();

    console.log(`[Assignments API] Created assignment ${assignment.id} with priority ${priorityScore}`);

    return c.json({
      ok: true,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate?.toISOString(),
        category: assignment.category,
        priorityScore: assignment.priorityScore,
        effortEstimateMinutes: assignment.effortEstimateMinutes,
        status: assignment.status,
      }
    });

  } catch (error: any) {
    console.error('[Assignments API] Error in quick-add:', error);
    return c.json({ error: error.message || 'Failed to create assignment' }, 500);
  }
});
