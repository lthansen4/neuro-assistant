import { Hono } from 'hono';
import { db, schema } from '../lib/db';
import { assignments, courses } from '../../../../packages/db/src/schema';
import { and, eq, or, sql } from 'drizzle-orm';
import { getUserId } from '../lib/auth-utils';

export const assignmentsRoute = new Hono();

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
    if (typeof body.description === 'string' || body.description === null) updatePayload.description = body.description || null;
    if (typeof body.category === 'string' || body.category === null) updatePayload.category = body.category || null;
    if (typeof body.effortEstimateMinutes === 'number' || body.effortEstimateMinutes === null) {
      updatePayload.effortEstimateMinutes = body.effortEstimateMinutes ?? null;
    }
    if (typeof body.dueDate === 'string' || body.dueDate === null) {
      updatePayload.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (typeof body.lastDeferredAt === 'string' || body.lastDeferredAt === null) {
      updatePayload.lastDeferredAt = body.lastDeferredAt ? new Date(body.lastDeferredAt) : null;
    }
    if (typeof body.totalPages === 'number' || body.totalPages === null) {
      updatePayload.totalPages = body.totalPages ?? null;
    }
    if (typeof body.pagesCompleted === 'number' || body.pagesCompleted === null) {
      updatePayload.pagesCompleted = body.pagesCompleted ?? null;
    }
    if (typeof body.totalProblems === 'number' || body.totalProblems === null) {
      updatePayload.totalProblems = body.totalProblems ?? null;
    }
    if (typeof body.problemsCompleted === 'number' || body.problemsCompleted === null) {
      updatePayload.problemsCompleted = body.problemsCompleted ?? null;
    }
    if (typeof body.completionPercentage === 'number' || body.completionPercentage === null) {
      updatePayload.completionPercentage = body.completionPercentage ?? 0;
      
      // Auto-complete status logic
      if (updatePayload.completionPercentage === 100) {
        updatePayload.status = 'Completed';
        updatePayload.submittedAt = new Date();
      } else if (updatePayload.completionPercentage > 0 && existing.status === 'Inbox') {
        updatePayload.status = 'Scheduled';
      }
    }
    if (Array.isArray(body.readingQuestions) || body.readingQuestions === null) {
      updatePayload.readingQuestions = body.readingQuestions ?? null;
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

    const assignmentEvents = await db.query.calendarEventsNew.findMany({
      where: and(
        eq(schema.calendarEventsNew.userId, userId),
        or(
          eq(schema.calendarEventsNew.assignmentId, assignmentId),
          eq(schema.calendarEventsNew.linkedAssignmentId, assignmentId),
          sql`${schema.calendarEventsNew.metadata} ->> 'assignmentId' = ${assignmentId}`
        )
      )
    });

    const eventIds = assignmentEvents.map((evt) => evt.id);
    if (eventIds.length > 0) {
      // Delete any linked transition buffers for these events
      await db.delete(schema.calendarEventsNew).where(
        and(
          eq(schema.calendarEventsNew.userId, userId),
          sql`(${schema.calendarEventsNew.metadata} ->> 'linkedToEvent')::uuid in (${sql.join(
            eventIds.map((id) => sql`${id}::uuid`),
            sql`,`
          )})`
        )
      );

      // Delete assignment-related events (including due date markers)
      await db.delete(schema.calendarEventsNew).where(
        and(
          eq(schema.calendarEventsNew.userId, userId),
          sql`${schema.calendarEventsNew.id} in (${sql.join(
            eventIds.map((id) => sql`${id}::uuid`),
            sql`,`
          )})`
        )
      );
    } else {
      // Fallback: delete by assignment linkage in case metadata wasn't captured in query
      await db.delete(schema.calendarEventsNew).where(
        and(
          eq(schema.calendarEventsNew.userId, userId),
          or(
            eq(schema.calendarEventsNew.assignmentId, assignmentId),
            eq(schema.calendarEventsNew.linkedAssignmentId, assignmentId),
            sql`${schema.calendarEventsNew.metadata} ->> 'assignmentId' = ${assignmentId}`
          )
        )
      );
    }

    await db.delete(assignments).where(and(eq(assignments.id, assignmentId), eq(assignments.userId, userId)));

    return c.json({ ok: true, deletedAssignmentId: assignmentId });
  } catch (error: any) {
    console.error('[Assignments API] Error deleting assignment:', error);
    return c.json({ error: error.message || 'Failed to delete assignment' }, 500);
  }
});

/**
 * GET /api/assignments/search
 * Search assignments by title or course name
 */
assignmentsRoute.get('/search', async (c) => {
  try {
    const userId = await getUserId(c);
    const query = c.req.query('q') || '';

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log(`[Assignments API] Searching assignments for user ${userId}, query: "${query}"`);

    const results = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        category: assignments.category,
        totalPages: assignments.totalPages,
        pagesCompleted: assignments.pagesCompleted,
        totalProblems: assignments.totalProblems,
        problemsCompleted: assignments.problemsCompleted,
        completionPercentage: assignments.completionPercentage,
        courseName: courses.name,
      })
      .from(assignments)
      .leftJoin(courses, eq(assignments.courseId, courses.id))
      .where(
        and(
          eq(assignments.userId, userId),
          or(
            sql`${assignments.title} ILIKE ${'%' + query + '%'}`,
            sql`${courses.name} ILIKE ${'%' + query + '%'}`
          )
        )
      )
      .limit(10);

    return c.json({ ok: true, assignments: results });
  } catch (error: any) {
    console.error('[Assignments API] Search error:', error);
    return c.json({ error: error.message || 'Failed to search assignments' }, 500);
  }
});

/**
 * GET /api/assignments/:id/details
 * Returns assignment details plus linked Focus blocks
 */
assignmentsRoute.get('/:id/details', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const assignmentId = c.req.param('id');
    const [assignment] = await db
      .select({
        id: assignments.id,
        userId: assignments.userId,
        courseId: assignments.courseId,
        title: assignments.title,
        description: assignments.description,
        dueDate: assignments.dueDate,
        category: assignments.category,
        effortEstimateMinutes: assignments.effortEstimateMinutes,
        status: assignments.status,
        totalPages: assignments.totalPages,
        pagesCompleted: assignments.pagesCompleted,
        readingQuestions: assignments.readingQuestions,
        courseName: courses.name,
      })
      .from(assignments)
      .leftJoin(courses, eq(assignments.courseId, courses.id))
      .where(and(eq(assignments.id, assignmentId), eq(assignments.userId, userId)))
      .limit(1);

    if (!assignment) {
      return c.json({ error: 'Assignment not found' }, 404);
    }

    const focusBlocks = await db
      .select({
        id: schema.calendarEventsNew.id,
        title: schema.calendarEventsNew.title,
        startAt: schema.calendarEventsNew.startAt,
        endAt: schema.calendarEventsNew.endAt,
        eventType: schema.calendarEventsNew.eventType,
        metadata: schema.calendarEventsNew.metadata,
      })
      .from(schema.calendarEventsNew)
      .where(and(
        eq(schema.calendarEventsNew.userId, userId),
        or(
          eq(schema.calendarEventsNew.eventType, 'Focus'),
          eq(schema.calendarEventsNew.eventType, 'Studying')
        ),
        or(
          eq(schema.calendarEventsNew.linkedAssignmentId, assignmentId),
          eq(schema.calendarEventsNew.assignmentId, assignmentId),
          sql`${schema.calendarEventsNew.metadata} ->> 'assignmentId' = ${assignmentId}`
        )
      ))
      .orderBy(schema.calendarEventsNew.startAt);

    return c.json({
      ok: true,
      assignment,
      focusBlocks,
    });
  } catch (error: any) {
    console.error('[Assignments API] Error fetching details:', error);
    return c.json({ error: error.message || 'Failed to fetch assignment details' }, 500);
  }
});
