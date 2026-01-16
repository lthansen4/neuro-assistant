import { Hono } from "hono";
import { db, schema } from "../lib/db";
import { and, eq } from "drizzle-orm";
import { getUserId } from "../lib/auth-utils";

export const sessionsRoute = new Hono();

/**
 * POST /api/sessions
 * Body: { type: "Focus" | "Chill", startTime: ISO, endTime: ISO, assignmentId?: uuid }
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

    return c.json({ ok: true, session });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create session" }, 500);
  }
});


