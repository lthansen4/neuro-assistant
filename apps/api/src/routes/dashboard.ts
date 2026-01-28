// apps/api/src/routes/dashboard.ts
import { Hono } from "hono";
import { db, schema } from "../lib/db";
import { and, between, desc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { getUserId } from "../lib/auth-utils";

export const dashboardRoute = new Hono();

async function tableExists(name: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`select to_regclass(${name}) as regclass`);
    return Boolean(result.rows?.[0]?.regclass);
  } catch {
    return false;
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`select 1 from information_schema.columns where table_name = ${table} and column_name = ${column} limit 1`
    );
    return result.rows?.length > 0;
  } catch {
    return false;
  }
}

// GET /api/dashboard/summary?range=week|day
dashboardRoute.get("/summary", async (c) => {
  try {
    const userId = await getUserId(c);
    const range = (c.req.query("range") || "week") as "day" | "week";

    // Preferences
    const pref = (await tableExists("dashboard_preferences"))
      ? await db.query.dashboardPreferences.findFirst({
          where: eq(schema.dashboardPreferences.userId, userId),
        })
      : null;

    // Today and this week boundaries (UTC)
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfWeek = new Date(today);
    const day = startOfWeek.getUTCDay(); // 0=Sun
    const diff = (day + 6) % 7; // ISO week start (Mon)
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - diff);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6);

    // Last 7 days productivity for charts
    const last7 = new Date(today);
    last7.setUTCDate(last7.getUTCDate() - 6);
    const last7Str = last7.toISOString().split('T')[0]; // YYYY-MM-DD
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    const hasBufferColumns =
      (await columnExists("user_daily_productivity", "buffer_minutes_earned")) &&
      (await columnExists("user_daily_productivity", "buffer_minutes_used"));
    const daily = (await tableExists("user_daily_productivity")) && hasBufferColumns
      ? await db
          .select()
          .from(schema.userDailyProductivity)
          .where(
            and(
              eq(schema.userDailyProductivity.userId, userId),
              between(schema.userDailyProductivity.day, last7Str, todayStr)
            )
          )
          .orderBy(schema.userDailyProductivity.day)
      : [];

    // Weekly current summary
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0]; // YYYY-MM-DD
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekly = (await tableExists("user_weekly_productivity"))
      ? await db
          .select()
          .from(schema.userWeeklyProductivity)
          .where(
            and(
              eq(schema.userWeeklyProductivity.userId, userId),
              gte(schema.userWeeklyProductivity.startDate, startOfWeekStr),
              lte(schema.userWeeklyProductivity.endDate, endOfWeekStr)
            )
          )
          .orderBy(desc(schema.userWeeklyProductivity.startDate))
      : [];

    // Streak (productivity streak)
    const streak = (await tableExists("user_streaks"))
      ? await db.query.userStreaks.findFirst({
          where: and(
            eq(schema.userStreaks.userId, userId),
            eq(schema.userStreaks.streakType, "productivity")
          ),
        })
      : null;

    // Forecasts
    const forecasts = (await tableExists("course_grade_forecasts"))
      ? await db
          .select({
            courseId: schema.courseGradeForecasts.courseId,
            currentScore: schema.courseGradeForecasts.currentScore,
            projectedScore: schema.courseGradeForecasts.projectedScore,
            updatedAt: schema.courseGradeForecasts.updatedAt,
            courseName: schema.courses.name,
          })
          .from(schema.courseGradeForecasts)
          .leftJoin(schema.courses, eq(schema.courses.id, schema.courseGradeForecasts.courseId))
          .where(eq(schema.courseGradeForecasts.userId, userId))
      : [];

    // Assignments by status - using optimized index idx_assignments_user_status_due_date
    // Query Inbox items (including those without due dates)
    const inboxAssignments = await db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
        category: schema.assignments.category,
        status: schema.assignments.status,
        effortEstimateMinutes: schema.assignments.effortEstimateMinutes,
        courseId: schema.assignments.courseId,
        courseName: schema.courses.name,
        createdAt: schema.assignments.createdAt,
        pointsEarned: schema.assignments.pointsEarned,
        pointsPossible: schema.assignments.pointsPossible,
        graded: schema.assignments.graded,
      })
      .from(schema.assignments)
      .leftJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
      .where(
        and(
          eq(schema.assignments.userId, userId),
          eq(schema.assignments.status, "Inbox")
        )
      )
      .orderBy(sql`${schema.assignments.dueDate} ASC NULLS LAST`); // NULLS LAST for Inbox items without due dates

    // Query Scheduled items
    const scheduledAssignments = await db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
        category: schema.assignments.category,
        status: schema.assignments.status,
        effortEstimateMinutes: schema.assignments.effortEstimateMinutes,
        courseId: schema.assignments.courseId,
        courseName: schema.courses.name,
        createdAt: schema.assignments.createdAt,
        pointsEarned: schema.assignments.pointsEarned,
        pointsPossible: schema.assignments.pointsPossible,
        graded: schema.assignments.graded,
      })
      .from(schema.assignments)
      .leftJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
      .where(
        and(
          eq(schema.assignments.userId, userId),
          eq(schema.assignments.status, "Scheduled")
        )
      )
      .orderBy(schema.assignments.dueDate); // Scheduled items should have due dates

    // Query Completed items (limit to recent ones)
    const completedAssignments = await db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
        category: schema.assignments.category,
        status: schema.assignments.status,
        effortEstimateMinutes: schema.assignments.effortEstimateMinutes,
        courseId: schema.assignments.courseId,
        courseName: schema.courses.name,
        submittedAt: schema.assignments.submittedAt,
        createdAt: schema.assignments.createdAt,
        pointsEarned: schema.assignments.pointsEarned,
        pointsPossible: schema.assignments.pointsPossible,
        graded: schema.assignments.graded,
      })
      .from(schema.assignments)
      .leftJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
      .where(
        and(
          eq(schema.assignments.userId, userId),
          eq(schema.assignments.status, "Completed")
        )
      )
      .orderBy(desc(schema.assignments.submittedAt), desc(schema.assignments.createdAt))
      .limit(10); // Limit to 10 most recent completed

    return c.json({
      preferences: pref,
      range,
      daily: daily.map(d => ({
        ...d,
        bufferMinutesEarned: d.bufferMinutesEarned || 0, // Migration 0033
        bufferMinutesUsed: d.bufferMinutesUsed || 0, // Migration 0033
      })),
      weekly: weekly[0] || null,
      streak: streak || null,
      forecasts,
      assignments: {
        inbox: inboxAssignments,
        scheduled: scheduledAssignments,
        completed: completedAssignments,
      },
    });
  } catch (e: any) {
    console.error("[Dashboard] Summary error:", e);
    return c.json({ error: e.message, type: e?.name }, 400);
  }
});

// Preferences
dashboardRoute.get("/preferences", async (c) => {
  try {
    const userId = await getUserId(c);
    const pref = await db.query.dashboardPreferences.findFirst({
      where: eq(schema.dashboardPreferences.userId, userId),
    });
    return c.json(pref || null);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

dashboardRoute.put("/preferences", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{ defaultRange?: "day" | "week"; showGradeForecast?: boolean; showChillBank?: boolean }>();

    const existing = await db.query.dashboardPreferences.findFirst({
      where: eq(schema.dashboardPreferences.userId, userId),
    });

    if (existing) {
      await db
        .update(schema.dashboardPreferences)
        .set({
          defaultRange: body.defaultRange ?? existing.defaultRange,
          showGradeForecast: body.showGradeForecast ?? existing.showGradeForecast,
          showChillBank: body.showChillBank ?? existing.showChillBank,
        })
        .where(eq(schema.dashboardPreferences.userId, userId));
    } else {
      await db.insert(schema.dashboardPreferences).values({
        userId,
        defaultRange: body.defaultRange ?? "week",
        showGradeForecast: body.showGradeForecast ?? true,
        showChillBank: body.showChillBank ?? true,
      });
    }

    const pref = await db.query.dashboardPreferences.findFirst({
      where: eq(schema.dashboardPreferences.userId, userId),
    });
    return c.json(pref);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// GET /api/dashboard/assignments?status=Inbox|Scheduled|Completed|Locked_In&limit=20
// Standalone endpoint for assignments with optional status filter
dashboardRoute.get("/assignments", async (c) => {
  try {
    const userId = await getUserId(c);
    const statusFilter = c.req.query("status") as "Inbox" | "Scheduled" | "Completed" | "Locked_In" | undefined;
    const limit = parseInt(c.req.query("limit") || "50", 10);

    // Build where clause
    const whereClause = statusFilter
      ? and(
          eq(schema.assignments.userId, userId),
          eq(schema.assignments.status, statusFilter)
        )
      : eq(schema.assignments.userId, userId);

    // Build base query
    let baseQuery = db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
        category: schema.assignments.category,
        status: schema.assignments.status,
        effortEstimateMinutes: schema.assignments.effortEstimateMinutes,
        priorityScore: schema.assignments.priorityScore,
        courseId: schema.assignments.courseId,
        courseName: schema.courses.name,
        createdAt: schema.assignments.createdAt,
        submittedAt: schema.assignments.submittedAt,
        pointsEarned: schema.assignments.pointsEarned,
        pointsPossible: schema.assignments.pointsPossible,
        graded: schema.assignments.graded,
      })
      .from(schema.assignments)
      .leftJoin(schema.courses, eq(schema.courses.id, schema.assignments.courseId))
      .where(whereClause);

    // Apply ordering based on status
    if (statusFilter === "Inbox") {
      baseQuery = baseQuery.orderBy(sql`${schema.assignments.dueDate} ASC NULLS LAST`) as typeof baseQuery;
    } else if (statusFilter === "Scheduled") {
      baseQuery = baseQuery.orderBy(schema.assignments.dueDate) as typeof baseQuery;
    } else if (statusFilter === "Completed") {
      baseQuery = baseQuery.orderBy(desc(schema.assignments.submittedAt), desc(schema.assignments.createdAt)) as typeof baseQuery;
    } else {
      // Default: order by due_date ASC NULLS LAST
      baseQuery = baseQuery.orderBy(sql`${schema.assignments.dueDate} ASC NULLS LAST`) as typeof baseQuery;
    }

    // Apply limit
    const assignments = await baseQuery.limit(limit);

    return c.json({
      assignments,
      count: assignments.length,
      status: statusFilter || "all",
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Optional: recompute aggregates for a date range
dashboardRoute.post("/recompute", async (c) => {
  try {
    const userId = await getUserId(c);
    const { start, end } = await c.req.json<{ start: string; end: string }>();
    const startDate = new Date(start);
    const endDate = new Date(end);
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = d.toISOString().slice(0, 10); // YYYY-MM-DD
      await db.execute(sql`select recompute_daily_productivity(${userId}::uuid, ${ds}::date);`);
      await db.execute(sql`select recompute_weekly_productivity(${userId}::uuid, ${ds}::date);`);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// POST /api/dashboard/cleanup-orphaned
// Clean up assignments that have no calendar events (orphaned assignments)
dashboardRoute.post("/cleanup-orphaned", async (c) => {
  try {
    const userId = await getUserId(c);
    
    console.log(`[Dashboard Cleanup] Starting orphan cleanup for user ${userId}`);
    
    // Get all assignments for user
    const allAssignments = await db.query.assignments.findMany({
      where: eq(schema.assignments.userId, userId)
    });
    
    // Get all calendar events for user
    const allEvents = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    // Find assignment IDs that are linked to calendar events
    const linkedAssignmentIds = new Set<string>();
    for (const event of allEvents) {
      const metadata = event.metadata as any;
      if (metadata?.linkedAssignmentId) {
        linkedAssignmentIds.add(metadata.linkedAssignmentId);
      }
    }
    
    // Find orphaned assignments (not completed, not linked to any event)
    const orphanedAssignments = allAssignments.filter(assignment => {
      return assignment.status !== 'Completed' && !linkedAssignmentIds.has(assignment.id);
    });
    
    console.log(`[Dashboard Cleanup] Found ${orphanedAssignments.length} orphaned assignment(s)`);
    
    // Delete orphaned assignments
    let deletedCount = 0;
    for (const orphan of orphanedAssignments) {
      await db.delete(schema.assignments)
        .where(eq(schema.assignments.id, orphan.id));
      console.log(`[Dashboard Cleanup] Deleted orphaned assignment: "${orphan.title}"`);
      deletedCount++;
    }
    
    return c.json({ 
      ok: true, 
      deletedCount,
      orphanedAssignments: orphanedAssignments.map(a => ({ id: a.id, title: a.title }))
    });
  } catch (e: any) {
    console.error('[Dashboard Cleanup] Error:', e);
    return c.json({ error: e.message }, 400);
  }
});

