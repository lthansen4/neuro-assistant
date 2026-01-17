/**
 * Rescue Mode API
 * 
 * Provides endpoints for the "Rescue Mode" feature that helps
 * overwhelmed students focus on just ONE thing at a time.
 */

import { Hono } from 'hono';
import { db } from '../lib/db';
import { assignments, calendarEventsNew, users } from '../../../../packages/db/src/schema';
import { eq, and, ne, gte, lte, desc, sql } from 'drizzle-orm';
import { calculateComprehensivePriority } from '../lib/adhd-guardian';

const rescueRoute = new Hono();

/**
 * Helper to get database user ID from Clerk user ID
 */
async function getUserId(c: any): Promise<string | null> {
  const clerkUserId = c.req.header('x-clerk-user-id') || c.req.header('x-user-id');
  if (!clerkUserId) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  return user?.id || null;
}

/**
 * GET /api/rescue/priority
 * 
 * Returns the single most urgent assignment for Rescue Mode.
 * Uses the comprehensive priority calculation from adhd-guardian.
 */
rescueRoute.get('/priority', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log(`[RescueMode] Getting priority assignment for user ${userId.substring(0, 8)}...`);

    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Get all incomplete assignments due within 14 days
    const upcomingAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.userId, userId),
          ne(assignments.status, 'Completed'),
          gte(assignments.dueDate, now),
          lte(assignments.dueDate, twoWeeksFromNow)
        )
      );

    if (upcomingAssignments.length === 0) {
      console.log(`[RescueMode] No upcoming assignments found`);
      return c.json({
        ok: true,
        assignment: null,
        message: "You're all caught up! No urgent assignments right now."
      });
    }

    // Calculate priority for each assignment
    const prioritizedAssignments = await Promise.all(
      upcomingAssignments.map(async (assignment) => {
        const priority = await calculateComprehensivePriority(assignment.id);
        return { ...assignment, priorityScore: priority };
      })
    );

    // Sort by priority (highest first)
    prioritizedAssignments.sort((a, b) => b.priorityScore - a.priorityScore);

    const topPriority = prioritizedAssignments[0];

    // Get course name if available
    let courseName = null;
    if (topPriority.courseId) {
      const course = await db.query.courses.findFirst({
        where: eq(sql`id`, topPriority.courseId)
      });
      courseName = course?.name || null;
    }

    // Check if this assignment has a checklist (from Wall of Awful breakdown)
    // Checklist items are stored as JSONB in the items field
    const checklist = await db.query.assignmentChecklists.findFirst({
      where: eq(sql`assignment_id`, topPriority.id)
    });

    // Parse checklist items from JSONB
    type ChecklistItem = { label: string; duration_minutes: number; completed: boolean };
    const checklistItems: ChecklistItem[] = checklist?.items 
      ? (checklist.items as ChecklistItem[]) 
      : [];

    // Calculate time until due
    const hoursUntilDue = topPriority.dueDate 
      ? Math.round((topPriority.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60))
      : null;

    let dueDescription = 'No due date';
    if (hoursUntilDue !== null) {
      if (hoursUntilDue < 0) {
        dueDescription = 'OVERDUE';
      } else if (hoursUntilDue < 24) {
        dueDescription = `Due in ${hoursUntilDue} hours`;
      } else {
        const days = Math.round(hoursUntilDue / 24);
        dueDescription = days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
      }
    }

    console.log(`[RescueMode] Top priority: "${topPriority.title}" (score: ${topPriority.priorityScore.toFixed(3)})`);

    return c.json({
      ok: true,
      assignment: {
        id: topPriority.id,
        title: topPriority.title,
        courseName,
        dueDate: topPriority.dueDate?.toISOString() || null,
        dueDescription,
        hoursUntilDue,
        priorityScore: topPriority.priorityScore,
        effortEstimateMinutes: topPriority.effortEstimateMinutes,
        isStuck: topPriority.isStuck,
        deferralCount: topPriority.deferralCount,
        hasChecklist: checklistItems.length > 0,
        checklistItems: checklistItems.map((item, index) => ({
          id: `item-${index}`,
          text: item.label,
          isCompleted: item.completed,
          durationMinutes: item.duration_minutes
        }))
      },
      remainingCount: prioritizedAssignments.length - 1,
      message: prioritizedAssignments.length === 1 
        ? "This is your only upcoming assignment!" 
        : `Focus on this first. ${prioritizedAssignments.length - 1} more after this.`
    });

  } catch (error) {
    console.error('[RescueMode] Error getting priority:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to get priority assignment' 
    }, 500);
  }
});

/**
 * POST /api/rescue/complete/:id
 * 
 * Marks an assignment as complete and returns the next priority.
 * Used when user clicks "I finished it!" in Rescue Mode.
 */
rescueRoute.post('/complete/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const assignmentId = c.req.param('id');
    
    console.log(`[RescueMode] Marking assignment ${assignmentId} as complete`);

    // Verify ownership and update
    const [updated] = await db
      .update(assignments)
      .set({
        status: 'Completed',
        submittedAt: new Date()
      })
      .where(
        and(
          eq(assignments.id, assignmentId),
          eq(assignments.userId, userId)
        )
      )
      .returning();

    if (!updated) {
      return c.json({ error: 'Assignment not found or not owned by user' }, 404);
    }

    console.log(`[RescueMode] ✓ Completed: "${updated.title}"`);

    // Get the next priority assignment
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const remainingAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.userId, userId),
          ne(assignments.status, 'Completed'),
          gte(assignments.dueDate, now),
          lte(assignments.dueDate, twoWeeksFromNow)
        )
      );

    let nextAssignment = null;
    
    if (remainingAssignments.length > 0) {
      // Calculate priorities and find next
      const prioritized = await Promise.all(
        remainingAssignments.map(async (a) => ({
          ...a,
          priorityScore: await calculateComprehensivePriority(a.id)
        }))
      );
      prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
      
      const next = prioritized[0];
      
      // Get course name
      let courseName = null;
      if (next.courseId) {
        const course = await db.query.courses.findFirst({
          where: eq(sql`id`, next.courseId)
        });
        courseName = course?.name || null;
      }

      const hoursUntilDue = next.dueDate 
        ? Math.round((next.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60))
        : null;

      let dueDescription = 'No due date';
      if (hoursUntilDue !== null) {
        if (hoursUntilDue < 24) {
          dueDescription = `Due in ${hoursUntilDue} hours`;
        } else {
          const days = Math.round(hoursUntilDue / 24);
          dueDescription = days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
        }
      }

      nextAssignment = {
        id: next.id,
        title: next.title,
        courseName,
        dueDate: next.dueDate?.toISOString() || null,
        dueDescription,
        hoursUntilDue,
        priorityScore: next.priorityScore
      };
    }

    return c.json({
      ok: true,
      completed: {
        id: updated.id,
        title: updated.title
      },
      nextAssignment,
      remainingCount: remainingAssignments.length,
      message: nextAssignment 
        ? `Great job! Ready for the next one?`
        : `Amazing! You're all caught up! 🎉`
    });

  } catch (error) {
    console.error('[RescueMode] Error completing assignment:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to complete assignment' 
    }, 500);
  }
});

/**
 * GET /api/rescue/should-suggest
 * 
 * Checks if Rescue Mode should be auto-suggested based on:
 * - 3+ critical/high alerts
 * - 0 Focus blocks completed today
 */
rescueRoute.get('/should-suggest', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Check for Focus blocks completed today
    const todayFocusBlocks = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, userId),
          eq(calendarEventsNew.eventType, 'Focus'),
          gte(calendarEventsNew.endAt, todayStart),
          lte(calendarEventsNew.endAt, todayEnd)
        )
      );

    const focusBlocksToday = todayFocusBlocks.length;

    // Count critical situations
    const warningDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const urgentAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.userId, userId),
          ne(assignments.status, 'Completed'),
          gte(assignments.dueDate, now),
          lte(assignments.dueDate, warningDate)
        )
      );

    // Count how many are "at risk" (due soon, not enough time scheduled)
    let criticalCount = 0;
    for (const assignment of urgentAssignments) {
      if (!assignment.dueDate) continue;
      
      const hoursUntilDue = (assignment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Critical: Due within 48 hours
      if (hoursUntilDue <= 48) {
        criticalCount++;
      }
      // Also critical: Stuck assignments
      else if (assignment.isStuck) {
        criticalCount++;
      }
    }

    // Suggest Rescue Mode if:
    // - 3+ critical items AND no focus today
    // - OR 5+ critical items regardless
    const shouldSuggest = (criticalCount >= 3 && focusBlocksToday === 0) || criticalCount >= 5;

    console.log(`[RescueMode] Should suggest check: ${criticalCount} critical, ${focusBlocksToday} focus blocks today -> ${shouldSuggest ? 'YES' : 'NO'}`);

    return c.json({
      ok: true,
      shouldSuggest,
      reason: shouldSuggest 
        ? (criticalCount >= 5 
            ? `You have ${criticalCount} urgent items. Let's tackle them one at a time.`
            : `You have ${criticalCount} urgent items and haven't started yet today. Want help focusing?`)
        : null,
      criticalCount,
      focusBlocksToday
    });

  } catch (error) {
    console.error('[RescueMode] Error checking suggestion:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to check suggestion' 
    }, 500);
  }
});

export default rescueRoute;

