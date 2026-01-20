import { Hono } from "hono";
import { db, schema } from "../lib/db";
import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "../lib/auth-utils";
import { getUserTimezone } from "../lib/timezone-utils";

export const sessionsRoute = new Hono();

/**
 * POST /api/sessions
 * Body: { type: "Focus" | "Chill", startTime: ISO, endTime: ISO, assignmentId?: uuid }
 * 
 * When Focus session is logged, awards 15 minutes of buffer time (refreshes to 15, doesn't stack)
 */
sessionsRoute.post("/", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{
      type: "Focus" | "Chill";
      startTime: string;
      endTime: string;
      assignmentId?: string | null;
    }>();

    if (!body?.type || !body?.startTime || !body?.endTime) {
      return c.json({ error: "type, startTime, and endTime are required" }, 400);
    }

    const start = new Date(body.startTime);
    const end = new Date(body.endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return c.json({ error: "Invalid startTime/endTime" }, 400);
    }

    if (end <= start) {
      return c.json({ error: "endTime must be after startTime" }, 400);
    }

    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    const [session] = await db
      .insert(schema.sessions)
      .values({
        userId,
        assignmentId: body.assignmentId || null,
        type: body.type,
        startTime: start,
        endTime: end,
        plannedDuration: durationMinutes,
        actualDuration: durationMinutes,
      })
      .returning();

    // Award buffer time for Focus sessions
    let bufferBalance = null;
    if (body.type === "Focus") {
      const userTz = await getUserTimezone(userId);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: userTz }); // YYYY-MM-DD in user's timezone
      
      // Upsert buffer time: set to 15 (refresh, don't stack)
      await db
        .insert(schema.userDailyProductivity)
        .values({
          userId,
          day: today,
          focusMinutes: 0,
          chillMinutes: 0,
          earnedChillMinutes: 0,
          bufferMinutesEarned: 15, // Always 15, refreshes
          bufferMinutesUsed: 0,
        })
        .onConflictDoUpdate({
          target: [schema.userDailyProductivity.userId, schema.userDailyProductivity.day],
          set: {
            bufferMinutesEarned: 15, // Refresh to 15 minutes
          },
        });
      
      // Fetch updated balance
      const [productivity] = await db
        .select()
        .from(schema.userDailyProductivity)
        .where(
          and(
            eq(schema.userDailyProductivity.userId, userId),
            eq(schema.userDailyProductivity.day, today)
          )
        );
      
      if (productivity) {
        bufferBalance = {
          earned: productivity.bufferMinutesEarned,
          used: productivity.bufferMinutesUsed,
          available: productivity.bufferMinutesEarned - productivity.bufferMinutesUsed,
        };
      }
      
      console.log(`[Sessions] Focus session complete - awarded 15 min buffer time (available: ${bufferBalance?.available || 0}m)`);
    }

    return c.json({ ok: true, session, bufferBalance });
  } catch (error: any) {
    console.error("[Sessions] Error creating session:", error);
    return c.json({ error: error.message || "Failed to create session" }, 500);
  }
});


