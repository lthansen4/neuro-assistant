import { Hono } from "hono";
import { db, schema } from "../lib/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { getUserId } from "../lib/auth-utils";
import { getUserTimezone } from "../lib/timezone-utils";

export const timerRoute = new Hono();

/**
 * GET /api/timer/context
 * 
 * Returns everything needed to start a smart timer:
 * - Next scheduled focus block (if any)
 * - Suggested duration and linked assignment info
 * - Available buffer time (expires tonight)
 * - Available earned chill time (persistent)
 */
timerRoute.get("/context", async (c) => {
  try {
    const userId = await getUserId(c);
    const userTz = await getUserTimezone(userId);
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: userTz }); // YYYY-MM-DD

    // Find next scheduled Focus block
    const nextFocusBlock = await db
      .select({
        id: schema.calendarEventsNew.id,
        title: schema.calendarEventsNew.title,
        startAt: schema.calendarEventsNew.startAt,
        endAt: schema.calendarEventsNew.endAt,
        linkedAssignmentId: schema.calendarEventsNew.linkedAssignmentId,
        assignmentTitle: schema.assignments.title,
      })
      .from(schema.calendarEventsNew)
      .leftJoin(
        schema.assignments,
        eq(schema.calendarEventsNew.linkedAssignmentId, schema.assignments.id)
      )
      .where(
        and(
          eq(schema.calendarEventsNew.userId, userId),
          eq(schema.calendarEventsNew.eventType, "Focus"),
          gte(schema.calendarEventsNew.startAt, now)
        )
      )
      .orderBy(schema.calendarEventsNew.startAt)
      .limit(1);

    // Get today's productivity summary (buffer + chill balance)
    const [productivity] = await db
      .select()
      .from(schema.userDailyProductivity)
      .where(
        and(
          eq(schema.userDailyProductivity.userId, userId),
          eq(schema.userDailyProductivity.day, today)
        )
      );

    // Calculate total earned chill (cumulative across all days minus what's been used)
    const totalChillResult = await db
      .select({
        totalEarned: sql<number>`COALESCE(SUM(${schema.userDailyProductivity.earnedChillMinutes}), 0)`,
        totalUsed: sql<number>`COALESCE(SUM(${schema.userDailyProductivity.chillMinutes}), 0)`,
      })
      .from(schema.userDailyProductivity)
      .where(eq(schema.userDailyProductivity.userId, userId));

    const totalEarned = Number(totalChillResult[0]?.totalEarned || 0);
    const totalUsed = Number(totalChillResult[0]?.totalUsed || 0);
    const earnedChillAvailable = Math.max(0, totalEarned - totalUsed);

    // Buffer time (today only)
    const bufferEarned = productivity?.bufferMinutesEarned || 0;
    const bufferUsed = productivity?.bufferMinutesUsed || 0;
    const bufferAvailable = Math.max(0, bufferEarned - bufferUsed);

    // Calculate suggested duration
    let suggestedDuration = null;
    let assignmentInfo = null;

    if (nextFocusBlock.length > 0) {
      const block = nextFocusBlock[0];
      const durationMinutes = Math.round(
        (block.endAt.getTime() - block.startAt.getTime()) / 60000
      );
      
      suggestedDuration = durationMinutes;
      
      if (block.linkedAssignmentId) {
        assignmentInfo = {
          id: block.linkedAssignmentId,
          title: block.assignmentTitle || block.title,
        };
      }
    }

    console.log(`[Timer Context] User ${userId.substring(0, 8)} - Next block: ${suggestedDuration}m, Buffer: ${bufferAvailable}m, Chill: ${earnedChillAvailable}m`);

    return c.json({
      ok: true,
      nextFocusBlock: nextFocusBlock.length > 0 ? {
        id: nextFocusBlock[0].id,
        title: nextFocusBlock[0].title,
        startAt: nextFocusBlock[0].startAt.toISOString(),
        endAt: nextFocusBlock[0].endAt.toISOString(),
        suggestedDuration,
      } : null,
      assignmentInfo,
      bufferTime: {
        available: bufferAvailable,
        earned: bufferEarned,
        used: bufferUsed,
        expiresAt: `${today}T23:59:59`, // Midnight tonight in user's timezone
      },
      earnedChillTime: {
        available: earnedChillAvailable,
        totalEarned,
        totalUsed,
      },
      totalAvailableRestMinutes: bufferAvailable + earnedChillAvailable,
    });
  } catch (error: any) {
    console.error("[Timer Context] Error:", error);
    return c.json({ error: error.message || "Failed to fetch timer context" }, 500);
  }
});

/**
 * POST /api/timer/use-chill
 * Body: { minutes: number }
 * 
 * Records chill time usage (automatically prioritizes buffer time, then earned chill)
 */
timerRoute.post("/use-chill", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{ minutes: number }>();
    
    if (!body?.minutes || body.minutes <= 0) {
      return c.json({ error: "minutes must be positive" }, 400);
    }

    const userTz = await getUserTimezone(userId);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: userTz });
    
    // Get current balances
    const [productivity] = await db
      .select()
      .from(schema.userDailyProductivity)
      .where(
        and(
          eq(schema.userDailyProductivity.userId, userId),
          eq(schema.userDailyProductivity.day, today)
        )
      );

    const bufferAvailable = productivity 
      ? productivity.bufferMinutesEarned - productivity.bufferMinutesUsed 
      : 0;
    
    // Use buffer first, then earned chill
    let bufferUsed = 0;
    let earnedChillUsed = 0;
    
    if (body.minutes <= bufferAvailable) {
      // All from buffer
      bufferUsed = body.minutes;
    } else {
      // Use all buffer, rest from earned chill
      bufferUsed = bufferAvailable;
      earnedChillUsed = body.minutes - bufferAvailable;
    }

    // Update buffer usage if any
    if (bufferUsed > 0 && productivity) {
      await db
        .update(schema.userDailyProductivity)
        .set({
          bufferMinutesUsed: productivity.bufferMinutesUsed + bufferUsed,
        })
        .where(
          and(
            eq(schema.userDailyProductivity.userId, userId),
            eq(schema.userDailyProductivity.day, today)
          )
        );
    }

    // Update earned chill usage if any
    if (earnedChillUsed > 0) {
      await db
        .update(schema.userDailyProductivity)
        .set({
          chillMinutes: sql`${schema.userDailyProductivity.chillMinutes} + ${earnedChillUsed}`,
        })
        .where(
          and(
            eq(schema.userDailyProductivity.userId, userId),
            eq(schema.userDailyProductivity.day, today)
          )
        );
    }

    console.log(`[Timer] Used ${bufferUsed}m buffer + ${earnedChillUsed}m earned chill`);

    return c.json({
      ok: true,
      used: {
        buffer: bufferUsed,
        earnedChill: earnedChillUsed,
        total: body.minutes,
      },
    });
  } catch (error: any) {
    console.error("[Timer] Error using chill:", error);
    return c.json({ error: error.message || "Failed to use chill time" }, 500);
  }
});



