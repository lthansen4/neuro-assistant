// apps/api/src/routes/planner.ts
import { Hono } from "hono";
import { db, schema } from "../lib/db";
import { and, eq, gte, sql, asc, or } from "drizzle-orm";
import { DateTime } from "luxon";

export const plannerRoute = new Hono();

// Helper to get userId from header or query
async function getUserId(c: any): Promise<string> {
  const uid = c.req.header("x-user-id") || c.req.header("x-clerk-user-id") || c.req.query("userId") || c.req.query("clerkUserId");
  if (!uid) throw new Error("Missing userId (header x-user-id or x-clerk-user-id, or query ?userId=...)");
  
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  if (!isUUID || uid.startsWith("user_")) {
    const dbUser = await db.query.users.findFirst({
      where: eq(schema.users.clerkUserId, uid),
    });
    if (!dbUser) {
      throw new Error(`No database user found for Clerk ID: ${uid}`);
    }
    return dbUser.id;
  }
  
  return uid;
}

// GET /api/planner/summary
// Returns grouped assignments for Reading, Homework, and Test views
plannerRoute.get("/summary", async (c) => {
  try {
    const userId = await getUserId(c);
    const userTz = c.req.query("tz") || "UTC";
    const now = DateTime.now().setZone(userTz);

    // Fetch all incomplete assignments for this user
    const assignments = await db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
        category: schema.assignments.category,
        status: schema.assignments.status,
        courseName: schema.courses.name,
        totalPages: schema.assignments.totalPages,
        pagesCompleted: schema.assignments.pagesCompleted,
        readingQuestions: schema.assignments.readingQuestions,
        effortEstimateMinutes: schema.assignments.effortEstimateMinutes,
      })
      .from(schema.assignments)
      .leftJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
      .where(
        and(
          eq(schema.assignments.userId, userId),
          sql`${schema.assignments.status} != 'Completed'`
        )
      )
      .orderBy(asc(schema.assignments.dueDate));

    const result = {
      reading: { today: [], tomorrow: [], thisWeek: [], thisMonth: [], later: [] },
      homework: { overdue: [], today: [], tomorrow: [], thisWeek: [], nextWeek: [], later: [] },
      tests: [], // Sorted list by date
    };

    for (const a of assignments) {
      const category = (a.category || "").toLowerCase();
      const dueDate = a.dueDate ? DateTime.fromJSDate(new Date(a.dueDate)).setZone(userTz) : null;

      // --- TEST VIEW ---
      if (category.includes("test") || category.includes("exam") || category.includes("midterm") || category.includes("final") || category.includes("quiz")) {
        (result.tests as any).push({
          ...a,
          daysRemaining: dueDate ? Math.ceil(dueDate.diff(now, "days").days) : null,
        });
        continue;
      }

      // --- READING VIEW ---
      if (category.includes("reading") || category.includes("read")) {
        if (!dueDate) {
          (result.reading.later as any).push(a);
        } else if (dueDate.hasSame(now, "day")) {
          (result.reading.today as any).push(a);
        } else if (dueDate.hasSame(now.plus({ days: 1 }), "day")) {
          (result.reading.tomorrow as any).push(a);
        } else if (dueDate <= now.endOf("week")) {
          (result.reading.thisWeek as any).push(a);
        } else if (dueDate <= now.endOf("month")) {
          (result.reading.thisMonth as any).push(a);
        } else {
          (result.reading.later as any).push(a);
        }
        continue;
      }

      // --- HOMEWORK VIEW ---
      // Everything else or explicitly homework
      if (!dueDate) {
        (result.homework.later as any).push(a);
      } else if (dueDate < now.startOf("day")) {
        (result.homework.overdue as any).push(a);
      } else if (dueDate.hasSame(now, "day")) {
        (result.homework.today as any).push(a);
      } else if (dueDate.hasSame(now.plus({ days: 1 }), "day")) {
        (result.homework.tomorrow as any).push(a);
      } else if (dueDate <= now.endOf("week")) {
        (result.homework.thisWeek as any).push(a);
      } else if (dueDate <= now.plus({ weeks: 1 }).endOf("week")) {
        (result.homework.nextWeek as any).push(a);
      } else {
        (result.homework.later as any).push(a);
      }
    }

    return c.json({ ok: true, summary: result });
  } catch (e: any) {
    console.error("[Planner API] Error:", e);
    return c.json({ error: e.message }, 400);
  }
});

