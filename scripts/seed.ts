// scripts/seed.ts
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";
import { eq, sql } from "drizzle-orm";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  // Demo user (replace clerkUserId later with your real Clerk user)
  const clerkUserId = "demo_user_1";
  let user = await db.query.users.findFirst({ where: eq(schema.users.clerkUserId, clerkUserId) });
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ clerkUserId, timezone: "America/New_York", targetStudyRatio: "3.00" })
      .returning();
  }

  // Course
  const courseVals = {
    userId: user.id,
    name: "Math 101",
    professor: "Dr. Euler",
    colorCode: "#2563eb",
    credits: 3,
    scheduleJson: JSON.stringify([{ day: "Mon", start: "09:00", end: "09:50", location: "Rm 101" }]),
    officeHoursJson: JSON.stringify([{ day: "Tue", start: "14:00", end: "15:00", location: "Rm 304" }]),
    gradeWeightsJson: JSON.stringify({ Exams: 50, Homework: 30, Participation: 20 }),
  } as any;

  const [course] = await db.insert(schema.courses).values(courseVals).returning();

  // Assignments
  const [exam, hw] = await db
    .insert(schema.assignments)
    .values([
      {
        userId: user.id,
        courseId: course.id,
        title: "Midterm Exam",
        category: "Exam",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        effortEstimateMinutes: 240,
        priorityScore: 90,
        status: "Inbox",
      },
      {
        userId: user.id,
        courseId: course.id,
        title: "Homework 1",
        category: "Homework",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        effortEstimateMinutes: 90,
        priorityScore: 40,
        status: "Inbox",
      },
    ])
    .returning();

  // Sessions: yesterday focus+chill, today focus
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const mk = (d: Date, h1: number, m1: number, h2: number, m2: number) => {
    const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h1, m1));
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h2, m2));
    return { s, e };
  };

  const s1 = mk(yesterday, 14, 0, 16, 0); // 2h focus
  const s2 = mk(yesterday, 20, 0, 21, 0); // 1h chill
  const s3 = mk(today, 10, 0, 11, 0); // 1h focus

  await db.insert(schema.sessions).values([
    { userId: user.id, assignmentId: exam.id, type: "Focus", startTime: s1.s, endTime: s1.e, plannedDuration: 120, actualDuration: 120 },
    { userId: user.id, type: "Chill", startTime: s2.s, endTime: s2.e, plannedDuration: 60, actualDuration: 60 },
    { userId: user.id, assignmentId: hw.id, type: "Focus", startTime: s3.s, endTime: s3.e, plannedDuration: 60, actualDuration: 60 },
  ]);

  // Calendar example
  await db.insert(schema.calendarEvents).values([
    {
      userId: user.id,
      courseId: course.id,
      type: "Class",
      title: "Class: Math 101",
      startTime: new Date(),
      endTime: new Date(Date.now() + 60 * 60 * 1000),
      isMovable: false,
    },
  ]);

  // Recompute aggregates for last 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const ds = d.toISOString().slice(0, 10);
    await db.execute(sql`select recompute_daily_productivity(${user.id}::uuid, ${ds}::date);`);
    await db.execute(sql`select recompute_weekly_productivity(${user.id}::uuid, ${ds}::date);`);
  }

  console.log("Seed complete. Demo user:", user.id);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});

