/**
 * Nudges API Routes
 * 
 * Endpoints for post-class nudge interactions
 */

import { Hono } from 'hono';
import { db } from '../lib/db';
import { nudges, nudgeActions, streakCounters, users } from '../../../../packages/db/src/schema';
import { eq, and, sql, or } from 'drizzle-orm';
import { DateTime } from 'luxon';

// Helper: get userId (UUID) from header or query - supports Clerk user ID lookup
async function getUserId(c: any): Promise<string> {
  const uid = c.req.header("x-user-id") || c.req.header("x-clerk-user-id") || c.req.query("userId") || c.req.query("clerkUserId");
  if (!uid) throw new Error("Missing userId (header x-user-id or x-clerk-user-id, or query ?userId=...)");
  
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  if (!isUUID || uid.startsWith("user_")) {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkUserId, uid)
    });
    if (dbUser) {
      return dbUser.id;
    } else {
      throw new Error("User not found in database for Clerk ID");
    }
  }
  return uid;
}

export const nudgesRoute = new Hono();

/**
 * GET /nudges/pending
 * 
 * Get pending nudges for the current user (in-app banner)
 */
nudgesRoute.get('/pending', async (c) => {
  try {
    const userId = await getUserId(c);

    // Fetch pending nudges (queued or deferred, not yet resolved/expired)
    const pendingNudges = await db
      .select()
      .from(nudges)
      .where(
        and(
          eq(nudges.userId, userId),
          or(
            eq(nudges.status, 'queued'),
            eq(nudges.status, 'deferred'),
            eq(nudges.status, 'delivered')
          ),
          sql`${nudges.expiresAt} > NOW()`
        )
      )
      .orderBy(sql`${nudges.triggerAt} DESC`)
      .limit(10);

    console.log(`[NudgesAPI] Found ${pendingNudges.length} pending nudges for user ${userId}`);

    return c.json({
      ok: true,
      nudges: pendingNudges.map(n => ({
        id: n.id,
        courseId: n.courseId,
        courseName: (n.metadata as any)?.courseName || 'Unknown Course',
        courseCode: (n.metadata as any)?.courseCode || '',
        triggerAt: n.triggerAt.toISOString(),
        status: n.status,
        metadata: n.metadata
      }))
    });
  } catch (error) {
    console.error('[NudgesAPI] Error fetching pending nudges:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch nudges' 
    }, 500);
  }
});

/**
 * POST /nudges/:id/resolve
 * 
 * User responds to a nudge
 * Body: { action: 'NO_UPDATES' | 'ADD_ASSIGNMENT' | 'LOG_FOCUS' | 'DISMISSED', payload: {...} }
 */
nudgesRoute.post('/:id/resolve', async (c) => {
  try {
    const userId = await getUserId(c);
    const nudgeId = c.req.param('id');
    const body = await c.req.json<{ 
      action: string; 
      payload?: { text?: string; focusMinutes?: number } 
    }>();

    if (!body.action) {
      return c.json({ error: 'action is required' }, 400);
    }

    // Validate action
    const validActions = ['NO_UPDATES', 'ADD_ASSIGNMENT', 'LOG_FOCUS', 'DISMISSED'];
    if (!validActions.includes(body.action)) {
      return c.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, 400);
    }

    // Fetch the nudge
    const nudge = await db.query.nudges.findFirst({
      where: and(
        eq(nudges.id, nudgeId),
        eq(nudges.userId, userId)
      )
    });

    if (!nudge) {
      return c.json({ error: 'Nudge not found' }, 404);
    }

    if (nudge.status === 'resolved' || nudge.status === 'expired') {
      return c.json({ error: 'Nudge already resolved or expired' }, 400);
    }

    // Record the action
    await db.insert(nudgeActions).values({
      nudgeId,
      userId,
      action: body.action,
      payload: body.payload || {}
    });

    // If LOG_FOCUS, create a Focus block on the calendar
    let focusBlock = null;
    if (body.action === 'LOG_FOCUS' && body.payload?.focusMinutes) {
      const { calendarEventsNew } = await import('../../../../packages/db/src/schema');
      const { DateTime } = await import('luxon');
      
      const now = DateTime.now().setZone('America/Chicago'); // TODO: Get user's actual timezone
      const courseId = (body.payload as any).courseId || nudge.courseId;
      const courseName = (body.payload as any).courseName || (nudge.metadata as any)?.courseName || 'Study';
      const courseCode = courseName.split(':')[0].trim(); // Extract "CS101" from "CS101: Introduction..."
      const description = (body.payload as any).description || 'Focus session';
      const focusMinutes = body.payload.focusMinutes;
      
      // Find the next available time slot (avoiding conflicts with classes)
      const nextClasses = await db
        .select()
        .from(calendarEventsNew)
        .where(
          and(
            eq(calendarEventsNew.userId, userId),
            eq(calendarEventsNew.eventType, 'Class'),
            sql`${calendarEventsNew.startAt} > NOW()`,
            sql`${calendarEventsNew.startAt} < NOW() + INTERVAL '12 hours'` // Look ahead 12 hours
          )
        )
        .orderBy(sql`${calendarEventsNew.startAt} ASC`)
        .limit(5);
      
      let startTime: DateTime;
      
      if (nextClasses.length > 0) {
        const nextClass = nextClasses[0];
        const nextClassStart = DateTime.fromJSDate(nextClass.startAt).setZone('America/Chicago');
        const minutesUntilClass = nextClassStart.diff(now, 'minutes').minutes;
        
        // If there's enough time before next class (at least duration + 30 min buffer)
        if (minutesUntilClass >= focusMinutes + 30) {
          // Schedule it right after current time (round up to next 5 min mark)
          const minutes = now.minute;
          const roundedMinutes = Math.ceil(minutes / 5) * 5;
          startTime = now.set({ minute: roundedMinutes, second: 0, millisecond: 0 });
          
          // Make sure there's still enough time after rounding
          const updatedMinutesUntilClass = nextClassStart.diff(startTime, 'minutes').minutes;
          if (updatedMinutesUntilClass < focusMinutes + 15) {
            // Not enough time, schedule after last class instead
            const lastClassToday = nextClasses[nextClasses.length - 1];
            const lastClassEnd = DateTime.fromJSDate(lastClassToday.endAt).setZone('America/Chicago');
            startTime = lastClassEnd.plus({ minutes: 30 }).set({ second: 0, millisecond: 0 });
          }
        } else {
          // Not enough time before next class - schedule after the last class today
          const lastClassToday = nextClasses[nextClasses.length - 1];
          const lastClassEnd = DateTime.fromJSDate(lastClassToday.endAt).setZone('America/Chicago');
          
          // Schedule 30 minutes after last class ends (buffer for transition)
          startTime = lastClassEnd.plus({ minutes: 30 }).set({ second: 0, millisecond: 0 });
          
          // If that's past 8 PM, schedule for tomorrow at 2 PM
          if (startTime.hour >= 20) {
            startTime = now.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
          }
        }
      } else {
        // No classes coming up today - schedule for a reasonable time
        // If it's before 8 PM, schedule in 30 minutes
        // If it's after 8 PM, schedule for tomorrow at 2 PM
        if (now.hour < 20) {
          startTime = now.plus({ minutes: 30 }).set({ second: 0, millisecond: 0 });
        } else {
          startTime = now.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
        }
      }
      
      const endTime = startTime.plus({ minutes: focusMinutes });
      
      const [createdEvent] = await db.insert(calendarEventsNew).values({
        userId,
        courseId,
        title: `Focus: ${courseCode} - ${description}`,
        eventType: 'Focus',
        startAt: startTime.toJSDate(),
        endAt: endTime.toJSDate(),
        isMovable: true,
        metadata: {
          source: 'post_class_nudge',
          nudgeId,
          courseName,
          description,
          focusMinutes: body.payload.focusMinutes
        }
      }).returning();
      
      focusBlock = createdEvent;
      console.log(`[NudgesAPI] Created Focus block: ${createdEvent.title} from ${startTime.toISO()} to ${endTime.toISO()}`);
    }

    // Mark nudge as resolved
    await db
      .update(nudges)
      .set({
        status: 'resolved',
        responseAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(nudges.id, nudgeId));

    // Update streak
    const streak = await updateStreak(userId);

    console.log(`[NudgesAPI] Resolved nudge ${nudgeId} with action ${body.action}`);

    return c.json({
      ok: true,
      message: 'Nudge resolved',
      focusBlock, // Return the created focus block
      streak: {
        current: streak.currentStreak,
        longest: streak.longestStreak
      }
    });
  } catch (error) {
    console.error('[NudgesAPI] Error resolving nudge:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to resolve nudge' 
    }, 500);
  }
});

/**
 * Update user's streak counter
 */
async function updateStreak(userId: string): Promise<{ currentStreak: number; longestStreak: number }> {
  const today = DateTime.now().toISODate();

  // Fetch or create streak counter
  let counter = await db.query.streakCounters.findFirst({
    where: eq(streakCounters.userId, userId)
  });

  if (!counter) {
    // Create new counter
    const [newCounter] = await db
      .insert(streakCounters)
      .values({
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActionDate: today
      })
      .returning();
    return { currentStreak: 1, longestStreak: 1 };
  }

  // Check if action already recorded today
  if (counter.lastActionDate === today) {
    // Already counted today, return current streak
    return {
      currentStreak: counter.currentStreak,
      longestStreak: counter.longestStreak
    };
  }

  // Calculate days since last action
  const lastActionDate = DateTime.fromISO(counter.lastActionDate || today);
  const daysSince = DateTime.fromISO(today).diff(lastActionDate, 'days').days;

  let newStreak = counter.currentStreak;
  let newLongest = counter.longestStreak;

  if (daysSince <= 1) {
    // Continue streak
    newStreak = counter.currentStreak + 1;
    newLongest = Math.max(newStreak, counter.longestStreak);
  } else {
    // Streak broken, restart
    newStreak = 1;
  }

  // Update counter
  await db
    .update(streakCounters)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActionDate: today,
      updatedAt: new Date()
    })
    .where(eq(streakCounters.userId, userId));

  return {
    currentStreak: newStreak,
    longestStreak: newLongest
  };
}

/**
 * GET /nudges/streak
 * 
 * Get current streak for user
 */
nudgesRoute.get('/streak', async (c) => {
  try {
    const userId = await getUserId(c);

    const counter = await db.query.streakCounters.findFirst({
      where: eq(streakCounters.userId, userId)
    });

    if (!counter) {
      return c.json({
        ok: true,
        streak: {
          currentCount: 0,
          longestCount: 0,
          lastIncrementedOn: null
        }
      });
    }

    return c.json({
      ok: true,
      streak: {
        currentCount: counter.currentStreak,
        longestCount: counter.longestStreak,
        lastIncrementedOn: counter.lastActionDate
      }
    });
  } catch (error) {
    console.error('[NudgesAPI] Error fetching streak:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch streak' 
    }, 500);
  }
});




