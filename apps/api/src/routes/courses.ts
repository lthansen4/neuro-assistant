import { Hono } from 'hono';
import { db, schema } from '../lib/db';
import { DateTime } from 'luxon';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getUserId } from '../lib/auth-utils';
import { percentageToLetterGrade } from '../lib/grade-calculator';

export const coursesRoute = new Hono();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_TO_NUM: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function normalizeDayToNumber(day: string): number {
  const key = (day || '').trim().toLowerCase();
  return DAY_TO_NUM[key] ?? 1;
}

function normalizeTimeString(time: string): string {
  if (!time) return '09:00:00';
  return time.length === 5 ? `${time}:00` : time;
}

function dayNumberToName(dayOfWeek: number): string {
  const idx = ((dayOfWeek % 7) + 7) % 7;
  return DAY_NAMES[idx] ?? 'Monday';
}

function parseDueDate(input?: string | null): Date | null {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(input + 'T23:59:00Z');
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

function calculatePriorityScore(category?: string | null): number {
  if (!category) return 20;
  const cat = category.toLowerCase();
  if (cat.includes('exam') || cat.includes('test') || cat.includes('midterm') || cat.includes('final')) return 90;
  if (cat.includes('project')) return 70;
  if (cat.includes('homework') || cat.includes('hw')) return 40;
  if (cat.includes('reading')) return 25;
  return 20;
}

function calculateOptimalFocusTime(dueDate: Date, timezone: string): Date {
  const dueDateTime = DateTime.fromJSDate(dueDate).setZone(timezone);
  let focusStart = dueDateTime.minus({ days: 2 }).set({ hour: 14, minute: 0, second: 0 });
  const now = DateTime.now().setZone(timezone);
  if (focusStart < now) {
    focusStart = now.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0 });
  }
  if (focusStart < now) {
    focusStart = now.plus({ hours: 2 }).set({ minute: 0, second: 0 });
  }
  return focusStart.toJSDate();
}

function calculateChunks(totalMinutes: number, dueDate: Date, timezone: string) {
  const MAX_CHUNK_MINUTES = 120;
  const MIN_GAP_HOURS = 8;
  const MAX_CHUNKS_PER_DAY = 2;
  const dueDateDT = DateTime.fromJSDate(dueDate).setZone(timezone);
  const now = DateTime.now().setZone(timezone);

  const chunks: Array<{
    label: string;
    type: 'initial' | 'consistency' | 'acceleration' | 'final' | 'buffer';
    startAt: Date;
    endAt: Date;
    durationMinutes: number;
    index: number;
  }> = [];

  let remaining = totalMinutes;
  let currentDate = dueDateDT.minus({ days: 5 }).set({ hour: 14, minute: 0, second: 0 });
  if (currentDate < now) {
    currentDate = now.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0 });
  }

  let chunkIndex = 0;
  while (remaining > 0 && chunkIndex < 20) {
    const duration = Math.min(remaining, MAX_CHUNK_MINUTES);
    const chunkStart = currentDate;
    const chunkEnd = chunkStart.plus({ minutes: duration });
    const type =
      chunkIndex === 0
        ? 'initial'
        : remaining - duration <= 0
        ? 'final'
        : chunkIndex >= 2
        ? 'acceleration'
        : 'consistency';

    chunks.push({
      label: type === 'initial' ? 'Start' : type === 'final' ? 'Final' : 'Work',
      type,
      startAt: chunkStart.toJSDate(),
      endAt: chunkEnd.toJSDate(),
      durationMinutes: duration,
      index: chunkIndex,
    });

    remaining -= duration;
    chunkIndex++;

    const sessionsToday = chunks.filter((c) =>
      DateTime.fromJSDate(c.startAt).setZone(timezone).hasSame(chunkStart, 'day')
    ).length;
    if (sessionsToday >= MAX_CHUNKS_PER_DAY) {
      currentDate = chunkStart.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0 });
    } else {
      currentDate = chunkEnd.plus({ hours: MIN_GAP_HOURS });
    }
  }

  return chunks;
}

function calculateStudyTime(category: string): number {
  const cat = category.toLowerCase();
  if (cat.includes('final')) return 360;
  if (cat.includes('midterm')) return 240;
  if (cat.includes('quiz')) return 90;
  return 180;
}

function calculateStudySessions(examDate: Date, totalMinutes: number, timezone: string) {
  const examDateTime = DateTime.fromJSDate(examDate).setZone(timezone);
  const daysToExam = Math.max(1, Math.round(examDateTime.diffNow('days').days));
  const sessions = Math.min(5, Math.max(1, daysToExam));
  const minutesPerSession = Math.max(30, Math.round(totalMinutes / sessions));

  const out: Array<{ startAt: Date; endAt: Date; sessionNumber: number }> = [];
  for (let i = sessions; i >= 1; i -= 1) {
    const dayOffset = i;
    const start = examDateTime
      .minus({ days: dayOffset })
      .set({ hour: 15, minute: 0, second: 0 });
    const end = start.plus({ minutes: minutesPerSession });
    out.push({
      startAt: start.toJSDate(),
      endAt: end.toJSDate(),
      sessionNumber: sessions - i + 1,
    });
  }

  return out;
}

async function calendarEventsNewExists(executor: typeof db | any): Promise<boolean> {
  const result: any = await executor.execute(
    sql`SELECT to_regclass('public.calendar_events_new') as reg`
  );
  return Boolean(result?.rows?.[0]?.reg);
}

async function templatesTableExists(executor: typeof db | any): Promise<boolean> {
  const result: any = await executor.execute(
    sql`SELECT to_regclass('public.calendar_event_templates') as reg`
  );
  return Boolean(result?.rows?.[0]?.reg);
}

async function classNudgesTableExists(executor: typeof db | any): Promise<boolean> {
  const result: any = await executor.execute(
    sql`SELECT to_regclass('public.class_nudges') as reg`
  );
  return Boolean(result?.rows?.[0]?.reg);
}

function buildOccurrencesForSemester(opts: {
  tz: string;
  items: { day: string; start: string; end: string; location?: string | null }[];
  title: (it: any) => string;
  type: 'Class' | 'OfficeHours';
  startDate?: Date;
  endDate?: Date;
}) {
  const { tz, items, title, type, startDate, endDate } = opts;
  const startZ = startDate
    ? DateTime.fromJSDate(startDate).setZone(tz).startOf('day')
    : DateTime.now().setZone(tz).startOf('day');
  const endZ = endDate
    ? DateTime.fromJSDate(endDate).setZone(tz).startOf('day')
    : startZ.plus({ weeks: 16 });

  const out: {
    title: string;
    type: 'Class' | 'OfficeHours';
    startTime: Date;
    endTime: Date;
    location?: string | null;
  }[] = [];

  const isoMap: Record<string, number> = {
    sun: 7, sunday: 7,
    mon: 1, monday: 1,
    tue: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
  };

  for (const it of items) {
    const isoDow = isoMap[(it.day || '').toLowerCase().trim()] ?? 1;
    for (let d = startZ; d <= endZ; d = d.plus({ days: 1 })) {
      if (d.weekday !== isoDow) continue;
      const [sh, sm] = (it.start || '09:00').split(':').map(Number);
      const [eh, em] = (it.end || '10:00').split(':').map(Number);
      const startZt = d.set({ hour: sh || 0, minute: sm || 0 });
      const endZt = d.set({ hour: eh || 0, minute: em || 0 });
      const startIso = startZt.toUTC().toISO();
      const endIso = endZt.toUTC().toISO();
      if (!startIso || !endIso) continue;
      out.push({
        title: title(it),
        type,
        startTime: new Date(startIso),
        endTime: new Date(endIso),
        location: it.location ?? null,
      });
    }
  }

  return out;
}

coursesRoute.get('/', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const courses = await db.query.courses.findMany({
      where: eq(schema.courses.userId, userId),
      orderBy: (courses, { asc }) => [asc(courses.name)],
    });

    // Add calculated letter grades
    const coursesWithGrades = courses.map(course => {
      const currentGrade = course.currentGrade ? parseFloat(course.currentGrade) : null;
      const letterGrade = currentGrade !== null ? percentageToLetterGrade(currentGrade) : null;
      
      return {
        ...course,
        currentGrade,
        letterGrade,
      };
    });

    return c.json({ ok: true, items: coursesWithGrades });
  } catch (error: any) {
    console.error('[Courses API] Error fetching courses:', error);
    return c.json({ error: error.message || 'Failed to fetch courses' }, 500);
  }
});

coursesRoute.get('/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const courseId = c.req.param('id');
    const course = await db.query.courses.findFirst({
      where: and(eq(schema.courses.id, courseId), eq(schema.courses.userId, userId)),
    });

    if (!course) return c.json({ error: 'Course not found' }, 404);

    // Add calculated letter grade to course
    const currentGradeVal = course.currentGrade ? parseFloat(course.currentGrade) : null;
    const courseWithGrade = {
      ...course,
      currentGrade: currentGradeVal,
      letterGrade: currentGradeVal !== null ? percentageToLetterGrade(currentGradeVal) : null,
    };

    const templatesExist = await templatesTableExists(db);
    let schedule: Array<{ day: string; start: string; end: string; location?: string | null }> = [];
    let officeHours: Array<{ day: string; start: string; end: string; location?: string | null }> = [];

    if (templatesExist) {
      const templates = await db
        .select({
          eventType: schema.calendarEventTemplates.eventType,
          dayOfWeek: schema.calendarEventTemplates.dayOfWeek,
          startTimeLocal: schema.calendarEventTemplates.startTimeLocal,
          endTimeLocal: schema.calendarEventTemplates.endTimeLocal,
          location: schema.calendarEventTemplates.location,
        })
        .from(schema.calendarEventTemplates)
        .where(
          and(
            eq(schema.calendarEventTemplates.userId, userId),
            eq(schema.calendarEventTemplates.courseId, courseId),
            inArray(schema.calendarEventTemplates.eventType, ['Class', 'OfficeHours'])
          )
        );

      for (const row of templates) {
        const entry = {
          day: dayNumberToName(Number(row.dayOfWeek ?? 1)),
          start: String(row.startTimeLocal || '09:00').slice(0, 5),
          end: String(row.endTimeLocal || '10:00').slice(0, 5),
          location: row.location ?? null,
        };
        if (row.eventType === 'OfficeHours') {
          officeHours.push(entry);
        } else {
          schedule.push(entry);
        }
      }
    } else {
      if (Array.isArray(course.scheduleJson)) {
        schedule = course.scheduleJson as any;
      }
      if (Array.isArray(course.officeHoursJson)) {
        officeHours = course.officeHoursJson as any;
      }
    }

    const assignments = await db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
        category: schema.assignments.category,
        effortEstimateMinutes: schema.assignments.effortEstimateMinutes,
        pointsEarned: schema.assignments.pointsEarned,
        pointsPossible: schema.assignments.pointsPossible,
        graded: schema.assignments.graded,
      })
      .from(schema.assignments)
      .where(and(eq(schema.assignments.userId, userId), eq(schema.assignments.courseId, courseId)));

    const events = await db
      .select({
        id: schema.calendarEventsNew.id,
        title: schema.calendarEventsNew.title,
        eventType: schema.calendarEventsNew.eventType,
        startAt: schema.calendarEventsNew.startAt,
        endAt: schema.calendarEventsNew.endAt,
        assignmentId: schema.calendarEventsNew.assignmentId,
      })
      .from(schema.calendarEventsNew)
      .where(
        and(
          eq(schema.calendarEventsNew.userId, userId),
          eq(schema.calendarEventsNew.courseId, courseId)
        )
      )
      .orderBy(sql`${schema.calendarEventsNew.startAt} DESC`)
      .limit(25);

    return c.json({
      ok: true,
      course: courseWithGrade,
      schedule,
      office_hours: officeHours,
      assignments,
      events,
    });
  } catch (error: any) {
    console.error('[Courses API] Error fetching course detail:', error);
    return c.json({ error: error.message || 'Failed to fetch course' }, 500);
  }
});

coursesRoute.post('/', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json<{
      course: {
        name: string;
        professor?: string | null;
        credits?: number | null;
        grade_weights?: Record<string, number> | null;
        semester_start_date?: string | null;
        semester_end_date?: string | null;
      };
      schedule?: { day: string; start: string; end: string; location?: string | null }[];
      office_hours?: { day: string; start: string; end: string; location?: string | null }[];
      assignments?: { title: string; due_date?: string | null; category?: string | null; effort_estimate_minutes?: number | null; total_pages?: number | null; schedule_mode?: "auto" | "manual" | "none"; session_start?: string | null; session_end?: string | null }[];
    }>();

    if (!body?.course?.name) return c.json({ error: 'course.name is required' }, 400);

    const schedule = Array.isArray(body.schedule) ? body.schedule : [];
    const officeHours = Array.isArray(body.office_hours) ? body.office_hours : [];
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];

    const [createdCourse] = await db
      .insert(schema.courses)
      .values({
        userId,
        name: body.course.name,
        professor: body.course.professor ?? null,
        credits: body.course.credits ?? null,
        scheduleJson: schedule as any,
        officeHoursJson: officeHours as any,
        gradeWeightsJson: body.course.grade_weights ? (body.course.grade_weights as any) : null,
      } as any)
      .returning();

    if (body.course.grade_weights && Object.keys(body.course.grade_weights).length > 0) {
      try {
        if (schema.gradingComponents) {
          await db.delete(schema.gradingComponents).where(eq(schema.gradingComponents.courseId, createdCourse.id));
          const components = Object.entries(body.course.grade_weights).map(([name, weight]) => ({
            courseId: createdCourse.id,
            name: name.trim(),
            weightPercent: Number(weight),
            source: 'manual' as const,
            parseRunId: null,
            dropLowest: null,
            sourceItemId: null,
          }));
          await db.insert(schema.gradingComponents).values(components as any);
        }
      } catch (gradingErr: any) {
        console.error('[Courses API] Failed to create grading components (skipping):', gradingErr.message);
        // Continue with course creation even if grading components fail
      }
    }

    if (officeHours.length > 0) {
      await db.delete(schema.courseOfficeHours).where(eq(schema.courseOfficeHours.courseId, createdCourse.id));
      await db.insert(schema.courseOfficeHours).values(
        officeHours.map((oh) => ({
          courseId: createdCourse.id,
          dayOfWeek: normalizeDayToNumber(oh.day),
          startTime: oh.start,
          endTime: oh.end,
          location: oh.location ?? null,
        })) as any[]
      );
    }

    const templatesExist = await templatesTableExists(db);
    if (templatesExist) {
      await db.execute(sql`
        DELETE FROM calendar_event_templates
        WHERE user_id = ${userId}::uuid AND course_id = ${createdCourse.id}::uuid
      `);

      for (const item of schedule) {
        const dayOfWeek = normalizeDayToNumber(item.day);
        await db.execute(sql`
          INSERT INTO calendar_event_templates (
            user_id, course_id, event_type, day_of_week,
            start_time_local, end_time_local, location, is_movable,
            start_date, end_date, metadata
          ) VALUES (
            ${userId}::uuid, ${createdCourse.id}::uuid, 'Class'::event_type, ${dayOfWeek}::smallint,
            ${normalizeTimeString(item.start)}::time, ${normalizeTimeString(item.end)}::time, ${item.location || null}::text,
            false,
            ${body.course.semester_start_date || null}::date,
            ${body.course.semester_end_date || null}::date,
            ${JSON.stringify({ source: 'course_edit', title: `Class: ${body.course.name}` })}::jsonb
          )
        `);
      }

      for (const item of officeHours) {
        const dayOfWeek = normalizeDayToNumber(item.day);
        await db.execute(sql`
          INSERT INTO calendar_event_templates (
            user_id, course_id, event_type, day_of_week,
            start_time_local, end_time_local, location, is_movable,
            start_date, end_date, metadata
          ) VALUES (
            ${userId}::uuid, ${createdCourse.id}::uuid, 'OfficeHours'::event_type, ${dayOfWeek}::smallint,
            ${normalizeTimeString(item.start)}::time, ${normalizeTimeString(item.end)}::time, ${item.location || null}::text,
            false,
            ${body.course.semester_start_date || null}::date,
            ${body.course.semester_end_date || null}::date,
            ${JSON.stringify({ source: 'course_edit', title: `Office Hours: ${body.course.name}` })}::jsonb
          )
        `);
      }
    } else if (schedule.length || officeHours.length) {
      const userResult = await db.execute(sql`SELECT timezone FROM users WHERE id = ${userId}::uuid`);
      const tz = (userResult.rows[0] as any)?.timezone || 'America/Chicago';
      const classEvents = buildOccurrencesForSemester({
        tz,
        items: schedule,
        title: () => `Class: ${body.course.name}`,
        type: 'Class',
        endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
      });
      const officeEvents = buildOccurrencesForSemester({
        tz,
        items: officeHours,
        title: () => `Office Hours: ${body.course.name}`,
        type: 'OfficeHours',
        endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
      });
      for (const evt of [...classEvents, ...officeEvents]) {
        await db.insert(schema.calendarEventsNew).values({
          userId,
          courseId: createdCourse.id,
          title: evt.title,
          eventType: evt.type,
          startAt: evt.startTime,
          endAt: evt.endTime,
          isMovable: false,
          metadata: { source: 'course_edit', location: evt.location } as any,
        } as any);
      }
    }

    if (assignments.length > 0) {
      const useNewTable = await calendarEventsNewExists(db);
      const userResult = await db.execute(sql`SELECT timezone FROM users WHERE id = ${userId}::uuid`);
      const tz = (userResult.rows[0] as any)?.timezone || 'America/Chicago';

      for (const item of assignments) {
        const title = (item.title || '').trim();
        if (!title) continue;
        const dueDate = parseDueDate(item.due_date);
        const scheduleMode = item.schedule_mode ?? "auto";
        const manualStart = item.session_start ? new Date(item.session_start) : null;
        const manualEnd = item.session_end ? new Date(item.session_end) : null;
        const existing = await db
          .select()
          .from(schema.assignments)
          .where(
            and(
              eq(schema.assignments.userId, userId),
              eq(schema.assignments.courseId, createdCourse.id),
              eq(schema.assignments.title, title),
              ...(dueDate ? [eq(schema.assignments.dueDate, dueDate as any)] : [])
            ) as any
          )
          .limit(1);
        if (existing.length > 0) continue;

        const priorityScore = calculatePriorityScore(item.category);
        const status = scheduleMode === "none" ? "Inbox" : "Scheduled";
        const [assign] = await db.insert(schema.assignments).values({
          userId,
          courseId: createdCourse.id,
          title,
          dueDate,
          category: item.category ?? null,
          effortEstimateMinutes: item.effort_estimate_minutes ?? null,
          totalPages: item.total_pages ?? null,
          priorityScore,
          status,
        } as any).returning();

        const category = (item.category || '').toLowerCase();
        const isExam = category.includes('exam') || category.includes('test') || category.includes('quiz') || category.includes('midterm') || category.includes('final');
        const isHomework = category.includes('homework') || category.includes('hw') || category.includes('assignment');

        if (dueDate && useNewTable) {
          const dueDateEventType = isExam
            ? (category.includes('final') ? 'Final' : category.includes('midterm') ? 'Midterm' : category.includes('quiz') ? 'Quiz' : 'Test')
            : 'DueDate';
          await db.insert(schema.calendarEventsNew).values({
            userId,
            courseId: createdCourse.id,
            assignmentId: assign.id,
            title: `📌 DUE: ${title}`,
            eventType: dueDateEventType as any,
            startAt: dueDate,
            endAt: new Date(dueDate.getTime() + 60 * 60 * 1000),
            isMovable: false,
            metadata: { source: 'course_manual', assignmentId: assign.id, isDueDate: true } as any,
          } as any);
        }

        if (useNewTable && scheduleMode === "manual" && manualStart && manualEnd) {
          await db.insert(schema.calendarEventsNew).values({
            userId,
            courseId: createdCourse.id,
            assignmentId: assign.id,
            title: `Focus: ${title}`,
            eventType: 'Focus' as any,
            startAt: manualStart,
            endAt: manualEnd,
            isMovable: true,
            metadata: { source: 'course_manual', assignmentId: assign.id, manual: true } as any,
          } as any);
        }

        if (dueDate && useNewTable && isHomework && scheduleMode === "auto") {
          let effortMinutes = item.effort_estimate_minutes;
          if (!effortMinutes || effortMinutes === 0) {
            effortMinutes = 90;
          }
          const requiresChunking = effortMinutes >= 240;
          if (requiresChunking) {
            const chunks = calculateChunks(effortMinutes, dueDate, tz);
            for (const chunk of chunks) {
              await db.insert(schema.calendarEventsNew).values({
                userId,
                courseId: createdCourse.id,
                assignmentId: assign.id,
                title: `${chunk.label}: ${title}`,
                eventType: 'Focus' as any,
                startAt: chunk.startAt,
                endAt: chunk.endAt,
                isMovable: true,
                metadata: {
                  source: 'course_manual',
                  assignmentId: assign.id,
                  chunkIndex: chunk.index,
                  totalChunks: chunks.length,
                  chunkType: chunk.type,
                  isChunked: true,
                } as any,
              } as any);
            }
          } else {
            const focusStart = calculateOptimalFocusTime(dueDate, tz);
            const focusEnd = new Date(focusStart.getTime() + effortMinutes * 60 * 1000);
            await db.insert(schema.calendarEventsNew).values({
              userId,
              courseId: createdCourse.id,
              assignmentId: assign.id,
              title: `Focus: ${title}`,
              eventType: 'Focus' as any,
              startAt: focusStart,
              endAt: focusEnd,
              isMovable: true,
              metadata: { source: 'course_manual', assignmentId: assign.id } as any,
            } as any);
          }
        }

        if (dueDate && useNewTable && isExam && scheduleMode === "auto") {
          const studyMinutes = calculateStudyTime(category);
          const studySessions = calculateStudySessions(dueDate, studyMinutes, tz);
          for (const session of studySessions) {
            await db.insert(schema.calendarEventsNew).values({
              userId,
              courseId: createdCourse.id,
              assignmentId: assign.id,
              title: `Study: ${title}`,
              eventType: 'Studying' as any,
              startAt: session.startAt,
              endAt: session.endAt,
              isMovable: true,
              metadata: {
                source: 'course_manual',
                assignmentId: assign.id,
                sessionNumber: session.sessionNumber,
                totalSessions: studySessions.length,
              } as any,
            } as any);
          }
        }
      }
    }

    return c.json({ ok: true, courseId: createdCourse.id });
  } catch (error: any) {
    console.error('[Courses API] Error creating course:', error);
    return c.json({ error: error.message || 'Failed to create course' }, 500);
  }
});

coursesRoute.put('/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const courseId = c.req.param('id');
    const body = await c.req.json<{
      course: {
        name: string;
        professor?: string | null;
        credits?: number | null;
        grade_weights?: Record<string, number> | null;
        semester_start_date?: string | null;
        semester_end_date?: string | null;
      };
      schedule?: { day: string; start: string; end: string; location?: string | null }[];
      office_hours?: { day: string; start: string; end: string; location?: string | null }[];
      assignments?: { title: string; due_date?: string | null; category?: string | null; effort_estimate_minutes?: number | null; total_pages?: number | null; schedule_mode?: "auto" | "manual" | "none"; session_start?: string | null; session_end?: string | null }[];
    }>();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:614',message:'PUT /courses/:id request received',data:{userId,courseId,courseName:body.course.name,scheduleCount:(body.schedule||[]).length,officeHoursCount:(body.office_hours||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3'})}).catch(()=>{});
    // #endregion

    if (!body?.course?.name) return c.json({ error: 'course.name is required' }, 400);

    const schedule = Array.isArray(body.schedule) ? body.schedule : [];
    const officeHours = Array.isArray(body.office_hours) ? body.office_hours : [];
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];

    await db.transaction(async (tx) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:640',message:'Starting transaction',data:{action:'update_course'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H4'})}).catch(()=>{});
      // #endregion
      
      await tx
        .update(schema.courses)
        .set({
          name: body.course.name,
          professor: body.course.professor ?? null,
          credits: body.course.credits ?? null,
          scheduleJson: schedule as any,
          officeHoursJson: officeHours as any,
          gradeWeightsJson: body.course.grade_weights ? (body.course.grade_weights as any) : null,
        } as any)
        .where(and(eq(schema.courses.id, courseId), eq(schema.courses.userId, userId)));

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:651',message:'Course basic info updated',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      // Update grading components if the table exists
      if (body.course.grade_weights && Object.keys(body.course.grade_weights).length > 0) {
        try {
          if (schema.gradingComponents) {
            await tx.delete(schema.gradingComponents).where(eq(schema.gradingComponents.courseId, courseId));
            const components = Object.entries(body.course.grade_weights).map(([name, weight]) => ({
              courseId,
              name: name.trim(),
              weightPercent: Number(weight),
              source: 'manual' as const,
              parseRunId: null,
              dropLowest: null,
              sourceItemId: null,
            }));
            await tx.insert(schema.gradingComponents).values(components as any);
          }
        } catch (gradingErr: any) {
          console.error('[Courses API] Failed to update grading components (skipping):', gradingErr.message);
          // Continue with course update even if grading components fail
        }
      }

      await tx.delete(schema.courseOfficeHours).where(eq(schema.courseOfficeHours.courseId, courseId));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:680',message:'Office hours deleted, about to insert',data:{officeHoursToInsert:officeHours.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      if (officeHours.length > 0) {
        await tx.insert(schema.courseOfficeHours).values(
          officeHours.map((oh) => ({
            courseId,
            dayOfWeek: normalizeDayToNumber(oh.day),
            startTime: oh.start,
            endTime: oh.end,
            location: oh.location ?? null,
          })) as any[]
        );
      }

      const templatesExist = await templatesTableExists(tx);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:693',message:'templatesExist check',data:{templatesExist,scheduleLength:schedule.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      if (templatesExist) {
        await tx.execute(sql`
          DELETE FROM calendar_event_templates
          WHERE user_id = ${userId}::uuid AND course_id = ${courseId}::uuid
        `);

        for (const item of schedule) {
          const dayOfWeek = normalizeDayToNumber(item.day);
          await tx.execute(sql`
            INSERT INTO calendar_event_templates (
              user_id, course_id, event_type, day_of_week,
              start_time_local, end_time_local, location, is_movable,
              start_date, end_date, metadata
            ) VALUES (
              ${userId}::uuid, ${courseId}::uuid, 'Class'::event_type, ${dayOfWeek}::smallint,
              ${normalizeTimeString(item.start)}::time, ${normalizeTimeString(item.end)}::time, ${item.location || null}::text,
              false,
              ${body.course.semester_start_date || null}::date,
              ${body.course.semester_end_date || null}::date,
              ${JSON.stringify({ source: 'course_edit', title: `Class: ${body.course.name}` })}::jsonb
            )
          `);
        }

        for (const item of officeHours) {
          const dayOfWeek = normalizeDayToNumber(item.day);
          await tx.execute(sql`
            INSERT INTO calendar_event_templates (
              user_id, course_id, event_type, day_of_week,
              start_time_local, end_time_local, location, is_movable,
              start_date, end_date, metadata
            ) VALUES (
              ${userId}::uuid, ${courseId}::uuid, 'OfficeHours'::event_type, ${dayOfWeek}::smallint,
              ${normalizeTimeString(item.start)}::time, ${normalizeTimeString(item.end)}::time, ${item.location || null}::text,
              false,
              ${body.course.semester_start_date || null}::date,
              ${body.course.semester_end_date || null}::date,
              ${JSON.stringify({ source: 'course_edit', title: `Office Hours: ${body.course.name}` })}::jsonb
            )
          `);
        }
      }
      if (!templatesExist && (schedule.length || officeHours.length)) {
        const userResult = await tx.execute(sql`SELECT timezone FROM users WHERE id = ${userId}::uuid`);
        const tz = (userResult.rows[0] as any)?.timezone || 'America/Chicago';
        const classEvents = buildOccurrencesForSemester({
          tz,
          items: schedule,
          title: () => `Class: ${body.course.name}`,
          type: 'Class',
          endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
        });
        const officeEvents = buildOccurrencesForSemester({
          tz,
          items: officeHours,
          title: () => `Office Hours: ${body.course.name}`,
          type: 'OfficeHours',
          endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
        });
        await tx.delete(schema.calendarEventsNew).where(
          and(
            eq(schema.calendarEventsNew.userId, userId),
            eq(schema.calendarEventsNew.courseId, courseId),
            inArray(schema.calendarEventsNew.eventType, ['Class', 'OfficeHours'])
          )
        );
        for (const evt of [...classEvents, ...officeEvents]) {
          await tx.insert(schema.calendarEventsNew).values({
            userId,
            courseId,
            title: evt.title,
            eventType: evt.type,
            startAt: evt.startTime,
            endAt: evt.endTime,
            isMovable: false,
            metadata: { source: 'course_edit', location: evt.location } as any,
          } as any);
        }
      }

      await tx.delete(schema.nudges).where(
        and(
          eq(schema.nudges.userId, userId),
          eq(schema.nudges.courseId, courseId),
          sql`${schema.nudges.triggerAt} >= NOW()`
        )
      );

      const classNudgesExist = await classNudgesTableExists(tx);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:762',message:'classNudges table exists',data:{classNudgesExist},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      if (classNudgesExist) {
        await tx.delete(schema.classNudges).where(
          and(
            eq(schema.classNudges.userId, userId),
            eq(schema.classNudges.courseId, courseId),
            sql`${schema.classNudges.scheduledAt} >= NOW()`
          )
        );
      }

      if (assignments.length > 0) {
        const useNewTable = await calendarEventsNewExists(tx);
        const userResult = await tx.execute(sql`SELECT timezone FROM users WHERE id = ${userId}::uuid`);
        const tz = (userResult.rows[0] as any)?.timezone || 'America/Chicago';

        for (const item of assignments) {
          const title = (item.title || '').trim();
          if (!title) continue;
          const dueDate = parseDueDate(item.due_date);
          const scheduleMode = item.schedule_mode ?? "auto";
          const manualStart = item.session_start ? new Date(item.session_start) : null;
          const manualEnd = item.session_end ? new Date(item.session_end) : null;

          const existing = await tx
            .select()
            .from(schema.assignments)
            .where(
              and(
                eq(schema.assignments.userId, userId),
                eq(schema.assignments.courseId, courseId),
                eq(schema.assignments.title, title),
                ...(dueDate ? [eq(schema.assignments.dueDate, dueDate as any)] : [])
              ) as any
            )
            .limit(1);
          if (existing.length > 0) continue;

          const priorityScore = calculatePriorityScore(item.category);
          const status = scheduleMode === "none" ? "Inbox" : "Scheduled";
          const [assign] = await tx.insert(schema.assignments).values({
            userId,
            courseId,
            title,
            dueDate,
            category: item.category ?? null,
            effortEstimateMinutes: item.effort_estimate_minutes ?? null,
            totalPages: item.total_pages ?? null,
            priorityScore,
            status,
          } as any).returning();

          const category = (item.category || '').toLowerCase();
          const isExam = category.includes('exam') || category.includes('test') || category.includes('quiz') || category.includes('midterm') || category.includes('final');
          const isHomework = category.includes('homework') || category.includes('hw') || category.includes('assignment');

          if (dueDate && useNewTable) {
            const dueDateEventType = isExam
              ? (category.includes('final') ? 'Final' : category.includes('midterm') ? 'Midterm' : category.includes('quiz') ? 'Quiz' : 'Test')
              : 'DueDate';
            await tx.insert(schema.calendarEventsNew).values({
              userId,
              courseId,
              assignmentId: assign.id,
              title: `📌 DUE: ${title}`,
              eventType: dueDateEventType as any,
              startAt: dueDate,
              endAt: new Date(dueDate.getTime() + 60 * 60 * 1000),
              isMovable: false,
              metadata: { source: 'course_manual', assignmentId: assign.id, isDueDate: true } as any,
            } as any);
          }

          if (useNewTable && scheduleMode === "manual" && manualStart && manualEnd) {
            await tx.insert(schema.calendarEventsNew).values({
              userId,
              courseId,
              assignmentId: assign.id,
              title: `Focus: ${title}`,
              eventType: 'Focus' as any,
              startAt: manualStart,
              endAt: manualEnd,
              isMovable: true,
              metadata: { source: 'course_manual', assignmentId: assign.id, manual: true } as any,
            } as any);
          }

          if (dueDate && useNewTable && isHomework && scheduleMode === "auto") {
            let effortMinutes = item.effort_estimate_minutes;
            if (!effortMinutes || effortMinutes === 0) {
              effortMinutes = 90;
            }
            const requiresChunking = effortMinutes >= 240;
            if (requiresChunking) {
              const chunks = calculateChunks(effortMinutes, dueDate, tz);
              for (const chunk of chunks) {
                await tx.insert(schema.calendarEventsNew).values({
                  userId,
                  courseId,
                  assignmentId: assign.id,
                  title: `${chunk.label}: ${title}`,
                  eventType: 'Focus' as any,
                  startAt: chunk.startAt,
                  endAt: chunk.endAt,
                  isMovable: true,
                  metadata: {
                    source: 'course_manual',
                    assignmentId: assign.id,
                    chunkIndex: chunk.index,
                    totalChunks: chunks.length,
                    chunkType: chunk.type,
                    isChunked: true,
                  } as any,
                } as any);
              }
            } else {
              const focusStart = calculateOptimalFocusTime(dueDate, tz);
              const focusEnd = new Date(focusStart.getTime() + effortMinutes * 60 * 1000);
              await tx.insert(schema.calendarEventsNew).values({
                userId,
                courseId,
                assignmentId: assign.id,
                title: `Focus: ${title}`,
                eventType: 'Focus' as any,
                startAt: focusStart,
                endAt: focusEnd,
                isMovable: true,
                metadata: { source: 'course_manual', assignmentId: assign.id } as any,
              } as any);
            }
          }

          if (dueDate && useNewTable && isExam && scheduleMode === "auto") {
            const studyMinutes = calculateStudyTime(category);
            const studySessions = calculateStudySessions(dueDate, studyMinutes, tz);
            for (const session of studySessions) {
              await tx.insert(schema.calendarEventsNew).values({
                userId,
                courseId,
                assignmentId: assign.id,
                title: `Study: ${title}`,
                eventType: 'Studying' as any,
                startAt: session.startAt,
                endAt: session.endAt,
                isMovable: true,
                metadata: {
                  source: 'course_manual',
                  assignmentId: assign.id,
                  sessionNumber: session.sessionNumber,
                  totalSessions: studySessions.length,
                } as any,
              } as any);
            }
          }
        }
      }
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:918',message:'Transaction completed successfully',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3,H4'})}).catch(()=>{});
    // #endregion

    return c.json({ ok: true });
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'courses.ts:920',message:'PUT /courses/:id error',data:{errorMessage:error.message,errorName:error.name,stack:(error.stack||'').substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3,H4'})}).catch(()=>{});
    // #endregion
    console.error('[Courses API] Error updating course:', error);
    return c.json({ error: error.message || 'Failed to update course' }, 500);
  }
});
