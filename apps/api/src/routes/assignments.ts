import { Hono } from 'hono';
import { db, schema } from '../lib/db';
import { assignments, courses } from '../../../../packages/db/src/schema';
import { and, eq, or } from 'drizzle-orm';

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

/**
 * PUT /api/assignments/:id
 * Update assignment fields
 */
assignmentsRoute.put('/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const assignmentId = c.req.param('id');
    const body = await c.req.json();
    const existing = await db.query.assignments.findFirst({
      where: and(eq(assignments.id, assignmentId), eq(assignments.userId, userId)),
    });

    if (!existing) {
      return c.json({ error: 'Assignment not found' }, 404);
    }

    const updatePayload: Partial<typeof assignments.$inferInsert> = {};
    if (typeof body.title === 'string') updatePayload.title = body.title.trim();
    if (typeof body.category === 'string' || body.category === null) updatePayload.category = body.category || null;
    if (typeof body.effortEstimateMinutes === 'number' || body.effortEstimateMinutes === null) {
      updatePayload.effortEstimateMinutes = body.effortEstimateMinutes ?? null;
    }
    if (typeof body.dueDate === 'string' || body.dueDate === null) {
      updatePayload.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }

    const [updated] = await db
      .update(assignments)
      .set(updatePayload)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.userId, userId)))
      .returning();

    return c.json({ ok: true, assignment: updated });
  } catch (error: any) {
    console.error('[Assignments API] Error updating assignment:', error);
    return c.json({ error: error.message || 'Failed to update assignment' }, 500);
  }
});

/**
 * DELETE /api/assignments/:id
 * Delete assignment and related calendar events
 */
assignmentsRoute.delete('/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const assignmentId = c.req.param('id');
    const existing = await db.query.assignments.findFirst({
      where: and(eq(assignments.id, assignmentId), eq(assignments.userId, userId)),
    });

    if (!existing) {
      return c.json({ error: 'Assignment not found' }, 404);
    }

    await db.delete(schema.calendarEventsNew).where(
      and(
        eq(schema.calendarEventsNew.userId, userId),
        or(
          eq(schema.calendarEventsNew.assignmentId, assignmentId),
          eq(schema.calendarEventsNew.linkedAssignmentId, assignmentId)
        )
      )
    );

    await db.delete(assignments).where(and(eq(assignments.id, assignmentId), eq(assignments.userId, userId)));

    return c.json({ ok: true, deletedAssignmentId: assignmentId });
  } catch (error: any) {
    console.error('[Assignments API] Error deleting assignment:', error);
    return c.json({ error: error.message || 'Failed to delete assignment' }, 500);
  }
});
