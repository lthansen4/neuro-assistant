import { db, schema } from './db';
import { eq, and, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { createHash } from 'crypto';

// Day mapping: ISO format (Mon=1, Sun=7)
const DOW: Record<string, number> = {
  sun: 7, sunday: 7,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function mapDayToIso(day: string): number {
  const k = (day || '').toLowerCase().trim();
  return DOW[k] ?? 1; // default Monday
}

// Parse due date strings safely
function parseDueDate(input?: string | null): Date | null {
  if (!input) return null;
  // If date-only (yyyy-mm-dd), set end-of-day UTC for safety
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(input + 'T23:59:00Z');
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

// Build 14-day occurrences in timezone, output JS Dates in UTC
function buildOccurrencesForSemester(opts: {
  tz: string;
  items: { day: string; start: string; end: string; location?: string | null }[];
  title: (it: any) => string;
  type: 'Class' | 'OfficeHours';
  startDate?: Date; // Optional: semester start date (defaults to today)
  endDate?: Date; // Optional: semester end date (defaults to 16 weeks from start)
}) {
  const { tz, items, title, type, startDate, endDate } = opts;
  
  // Determine date range: default to 16 weeks (full semester) from today
  const startZ = startDate 
    ? DateTime.fromJSDate(startDate).setZone(tz).startOf('day')
    : DateTime.now().setZone(tz).startOf('day');
  
  const endZ = endDate
    ? DateTime.fromJSDate(endDate).setZone(tz).startOf('day')
    : startZ.plus({ weeks: 16 }); // 16 weeks = full semester
  
  console.log(`[buildOccurrences] Generating events from ${startZ.toISO()} to ${endZ.toISO()} (${Math.ceil(endZ.diff(startZ, 'days').days)} days)`);
  
  const out: {
    title: string;
    type: 'Class' | 'OfficeHours';
    startTime: Date;
    endTime: Date;
    location?: string | null;
  }[] = [];

  for (const it of items) {
    const isoDow = mapDayToIso(it.day); // ISO: Mon=1..Sun=7
    // iterate each day in range, add when weekday matches
    let dayCount = 0;
    let eventCount = 0;
    for (let d = startZ; d <= endZ; d = d.plus({ days: 1 })) {
      dayCount++;
      if (d.weekday !== isoDow) continue;
      
      const [sh, sm] = (it.start || '09:00').split(':').map(Number);
      const [eh, em] = (it.end || '10:00').split(':').map(Number);

      const startZt = d.set({ hour: sh || 0, minute: sm || 0 });
      const endZt = d.set({ hour: eh || 0, minute: em || 0 });

      // Luxon handles DST in the zone; convert to UTC JS Date
      const startUtc = new Date(startZt.toUTC().toISO());
      const endUtc = new Date(endZt.toUTC().toISO());

      out.push({
        title: title(it),
        type,
        startTime: startUtc,
        endTime: endUtc,
        location: it.location ?? null,
      });
      eventCount++;
    }
    console.log(`[buildOccurrences] ${it.day} (DOW ${isoDow}): checked ${dayCount} days, added ${eventCount} events`);
  }
  console.log(`[buildOccurrences] Total events generated: ${out.length} (expected ~${items.length * 16} for 16 weeks)`);
  return out;
}

interface CommitPayload {
  course: {
    name: string;
    professor?: string | null;
    credits?: number | null;
    semester_start_date?: string | null; // ISO date string (YYYY-MM-DD)
    semester_end_date?: string | null;   // ISO date string (YYYY-MM-DD) - typically final exam date
    grade_weights?: Record<string, number> | null;
  };
  schedule?: { day: string; start: string; end: string; location?: string | null }[];
  office_hours?: { day: string; start: string; end: string; location?: string | null }[];
  assignments?: {
    title: string;
    due_date?: string | null;
    category?: string | null;
    effort_estimate_minutes?: number | null;
  }[];
}

interface CommitResult {
  courseId: string;
  courseName: string;
  counts: {
    assignmentsCreated: number;
    officeHoursSaved: number;
    scheduleSaved: number;
    classEventsCreated: number;
    officeHourEventsCreated: number;
    focusBlocksCreated?: number;
    studyBlocksCreated?: number;
    dueDateEventsCreated?: number;
  };
  timezone: string;
}

export class SyllabusCommitService {
  /**
   * Commits staged syllabus items to the database.
   * Creates/updates course, assignments, calendar events, and grading components.
   */
  async commitStagingItems(runId: string, userId: string, payload: CommitPayload, timezone: string = 'UTC'): Promise<CommitResult> {
    // Validate parse run belongs to user
    const parseRun = await db.query.syllabusParseRuns.findFirst({
      where: eq(schema.syllabusParseRuns.id, runId),
    });
    if (!parseRun) {
      throw new Error('Parse run not found');
    }

    // Verify ownership via syllabus file
    const [syllabusFile] = await db
      .select()
      .from(schema.syllabusFiles)
      .where(eq(schema.syllabusFiles.id, parseRun.syllabusFileId))
      .limit(1);

    if (!syllabusFile || syllabusFile.userId !== userId) {
      throw new Error('Unauthorized: Parse run does not belong to user');
    }

    // Check for existing commit (idempotency)
    const existingCommit = await db.query.syllabusCommits.findFirst({
      where: eq(schema.syllabusCommits.parseRunId, runId),
    });
    if (existingCommit) {
      throw new Error('This parse run has already been committed');
    }

    return await db.transaction(async (tx) => {
      // 1. Upsert the Course
      const courseId = await this.upsertCourse(tx, userId, payload.course, runId);

      // 2. Update syllabus file with course ID
      await tx
        .update(schema.syllabusFiles)
        .set({ courseId })
        .where(eq(schema.syllabusFiles.id, parseRun.syllabusFileId));

      // 3. Normalize grading components (dual-write with grade_weights_json)
      if (payload.course.grade_weights && Object.keys(payload.course.grade_weights).length > 0) {
        // Clear existing components for this course (replace strategy)
        await tx
          .delete(schema.gradingComponents)
          .where(eq(schema.gradingComponents.courseId, courseId));

        // Insert normalized components
        const components = Object.entries(payload.course.grade_weights).map(([name, weight]) => ({
          courseId,
          name: name.trim(),
          weightPercent: Number(weight),
          source: 'syllabus' as const,
          parseRunId: runId,
          dropLowest: null,
          sourceItemId: null,
        }));

        if (components.length > 0) {
          await tx.insert(schema.gradingComponents).values(components as any);
        }
      }

      // 4. Normalize office hours (migration 0008: use calendar_event_templates or course_office_hours view)
      if (Array.isArray(payload.office_hours) && payload.office_hours.length > 0) {
        await tx.delete(schema.courseOfficeHours).where(eq(schema.courseOfficeHours.courseId, courseId));
        
        const officeHoursRows = payload.office_hours.map((oh) => ({
          courseId,
          dayOfWeek: mapDayToIso(oh.day),
          startTime: oh.start,
          endTime: oh.end,
          location: oh.location ?? null,
        })) as any[];

        await tx.insert(schema.courseOfficeHours).values(officeHoursRows);
      }

      // 5. Commit Assignments (with deduplication) + Auto-schedule Focus/Study blocks
      let createdAssignments = 0;
      let createdFocusBlocks = 0;
      let createdStudyBlocks = 0;
      let createdDueDateEvents = 0;
      
      if (Array.isArray(payload.assignments)) {
        for (const item of payload.assignments) {
          const title = (item.title || '').trim();
          if (!title) continue;

          const dueDate = parseDueDate(item.due_date);

          // Check for existing duplicates (same user, course, title, due_date)
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

          if (existing.length > 0) continue; // Skip duplicate

          // Calculate priority score based on category
          const priorityScore = this.calculatePriorityScore(item.category);

          const [assign] = await tx.insert(schema.assignments).values({
            userId,
            courseId,
            title,
            dueDate,
            category: item.category ?? null,
            effortEstimateMinutes: item.effort_estimate_minutes ?? null,
            priorityScore,
            status: 'Scheduled', // Auto-schedule syllabus imports (ADHD-friendly: no manual approval needed)
          } as any).returning();

          // Record artifact for rollback (use savepoint to prevent transaction abort)
          try {
            await tx.execute(sql`SAVEPOINT artifact_insert`);
            await tx.execute(sql`
              INSERT INTO syllabus_commit_artifacts (parse_run_id, assignment_id)
              VALUES (${runId}::uuid, ${assign.id}::uuid)
            `);
            await tx.execute(sql`RELEASE SAVEPOINT artifact_insert`);
          } catch (err: any) {
            // Rollback to savepoint to continue transaction - artifacts are optional
            try {
              await tx.execute(sql`ROLLBACK TO SAVEPOINT artifact_insert`);
            } catch {
              // Ignore rollback errors
            }
            console.warn('Failed to record artifact (non-critical):', err.message);
          }

          createdAssignments++;
          
          // AUTO-SCHEDULE: Create Focus blocks for homework and Study blocks for exams
          const category = (item.category || '').toLowerCase();
          const isExam = category.includes('exam') || category.includes('test') || category.includes('quiz') || category.includes('midterm') || category.includes('final');
          const isHomework = category.includes('homework') || category.includes('hw') || category.includes('assignment');
          
          if (dueDate) {
            // Create Due Date event on calendar (visible marker)
            const dueDateEventType = isExam 
              ? (category.includes('final') ? 'Final' : category.includes('midterm') ? 'Midterm' : category.includes('quiz') ? 'Quiz' : 'Test')
              : 'DueDate';
            
            const useNewTable = await this.checkTableExists(tx, 'calendar_events_new');
            
            try {
              if (useNewTable) {
                const [dueDateEvent] = await tx.insert(schema.calendarEventsNew).values({
                  userId,
                  courseId,
                  assignmentId: assign.id,
                  title: `📌 DUE: ${title}`,
                  eventType: dueDateEventType as any,
                  startAt: dueDate,
                  endAt: new Date(dueDate.getTime() + 60 * 60 * 1000), // 1 hour duration for visibility
                  isMovable: false, // Due dates are fixed
                  metadata: { 
                    source: 'syllabus_commit', 
                    parseRunId: runId,
                    assignmentId: assign.id,
                    isDueDate: true
                  } as any,
                } as any).returning();
                
                console.log(`[Commit] Created due date event: ${title} at ${dueDate}`);
                createdDueDateEvents++;
              }
            } catch (err: any) {
              console.error(`[Commit] Error creating due date event for ${title}:`, err.message);
            }
            
            // Schedule Focus blocks for homework
            if (isHomework) {
              // Use provided effort estimate or default based on category
              let effortMinutes = item.effort_estimate_minutes;
              if (!effortMinutes || effortMinutes === 0) {
                // Default effort estimates for homework when not provided by syllabus
                effortMinutes = 90; // Default 90 minutes for homework
                console.log(`[Commit] No effort estimate for ${title}, using default: ${effortMinutes} min`);
              }
              
              const requiresChunking = effortMinutes >= 240; // 4+ hours
              
              if (requiresChunking) {
                // Chunk into multiple sessions
                const chunks = this.calculateChunks(effortMinutes, dueDate, timezone);
                for (const chunk of chunks) {
                  try {
                    if (useNewTable) {
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
                          source: 'syllabus_commit', 
                          parseRunId: runId,
                          assignmentId: assign.id,
                          chunkIndex: chunk.index,
                          totalChunks: chunks.length,
                          chunkType: chunk.type,
                          isChunked: true
                        } as any,
                      } as any);
                      createdFocusBlocks++;
                      console.log(`[Commit] Created Focus chunk ${chunk.index + 1}/${chunks.length}: ${chunk.label} for ${title}`);
                    }
                  } catch (err: any) {
                    console.error(`[Commit] Error creating Focus chunk for ${title}:`, err.message);
                  }
                }
              } else {
                // Single Focus block
                const focusStart = this.calculateOptimalFocusTime(dueDate, timezone);
                const focusEnd = new Date(focusStart.getTime() + effortMinutes * 60 * 1000);
                
                try {
                  if (useNewTable) {
                    await tx.insert(schema.calendarEventsNew).values({
                      userId,
                      courseId,
                      assignmentId: assign.id,
                      title: `Focus: ${title}`,
                      eventType: 'Focus' as any,
                      startAt: focusStart,
                      endAt: focusEnd,
                      isMovable: true,
                      metadata: { 
                        source: 'syllabus_commit', 
                        parseRunId: runId,
                        assignmentId: assign.id
                      } as any,
                    } as any);
                    createdFocusBlocks++;
                    console.log(`[Commit] Created Focus block for ${title}: ${effortMinutes} min`);
                  }
                } catch (err: any) {
                  console.error(`[Commit] Error creating Focus block for ${title}:`, err.message);
                }
              }
            }
            
            // Schedule Study blocks for exams
            if (isExam) {
              const studyMinutes = this.calculateStudyTime(category);
              const studySessions = this.calculateStudySessions(dueDate, studyMinutes, timezone);
              
              for (const session of studySessions) {
                try {
                  if (useNewTable) {
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
                        source: 'syllabus_commit', 
                        parseRunId: runId,
                        assignmentId: assign.id,
                        sessionNumber: session.sessionNumber,
                        totalSessions: studySessions.length
                      } as any,
                    } as any);
                    createdStudyBlocks++;
                    console.log(`[Commit] Created Study session ${session.sessionNumber}/${studySessions.length} for ${title}`);
                  }
                } catch (err: any) {
                  console.error(`[Commit] Error creating Study session for ${title}:`, err.message);
                }
              }
            }
          }
        }
      }

      // 6. Commit Calendar Event Templates (Classes and Office Hours)
      // Use templates instead of generating all instances - this works indefinitely
      // Instances will be generated on-demand when fetching calendar events
      const classItems = Array.isArray(payload.schedule) ? payload.schedule : [];
      const officeItems = Array.isArray(payload.office_hours) ? payload.office_hours : [];

      console.log(`[Commit] Schedule items: ${classItems.length}, Office hours: ${officeItems.length}`);

      let templatesCreated = 0;

      // Check if calendar_event_templates exists (migration 0008)
      const templatesTableExists = await this.checkTableExists(tx, 'calendar_event_templates');
      
      if (templatesTableExists) {
        // Use templates - the proper scalable approach
        console.log(`[Commit] Using calendar_event_templates (recurring patterns)`);
        
        // Parse semester dates
        const semesterStartDate = payload.course.semester_start_date || null;
        const semesterEndDate = payload.course.semester_end_date || null;
        
        if (semesterEndDate) {
          console.log(`[Commit] Semester dates: ${semesterStartDate || 'not specified'} to ${semesterEndDate}`);
        } else {
          console.log(`[Commit] WARNING: No semester_end_date found. Events will continue indefinitely.`);
        }
        
        // Delete existing templates for this course to avoid duplicates
        await tx.execute(sql`
          DELETE FROM calendar_event_templates 
          WHERE user_id = ${userId}::uuid AND course_id = ${courseId}::uuid
        `);

        // Create templates for class schedule
        for (const item of classItems) {
          const isoDow = mapDayToIso(item.day); // ISO: Mon=1..Sun=7, convert to 0=Sun, 1=Mon format
          const dayOfWeek = isoDow === 7 ? 0 : isoDow; // Convert ISO (Mon=1) to 0=Sun format
          
          const [sh, sm] = (item.start || '09:00').split(':').map(Number);
          const [eh, em] = (item.end || '10:00').split(':').map(Number);
          
          // Format time as HH:mm:ss for PostgreSQL time type
          const startTimeLocal = `${String(sh || 0).padStart(2, '0')}:${String(sm || 0).padStart(2, '0')}:00`;
          const endTimeLocal = `${String(eh || 0).padStart(2, '0')}:${String(em || 0).padStart(2, '0')}:00`;
          
          if (semesterStartDate && semesterEndDate) {
            await tx.execute(sql`
              INSERT INTO calendar_event_templates (
                user_id, course_id, event_type, day_of_week,
                start_time_local, end_time_local, location, is_movable,
                start_date, end_date, metadata
              ) VALUES (
                ${userId}::uuid, ${courseId}::uuid, 'Class'::event_type, ${dayOfWeek}::smallint,
                ${startTimeLocal}::time, ${endTimeLocal}::time, ${item.location || null}::text,
                false,
                ${semesterStartDate}::date,
                ${semesterEndDate}::date,
                ${JSON.stringify({ source: 'syllabus_commit', parseRunId: runId, title: `Class: ${payload.course.name}` })}::jsonb
              )
            `);
          } else {
            await tx.execute(sql`
              INSERT INTO calendar_event_templates (
                user_id, course_id, event_type, day_of_week,
                start_time_local, end_time_local, location, is_movable,
                start_date, end_date, metadata
              ) VALUES (
                ${userId}::uuid, ${courseId}::uuid, 'Class'::event_type, ${dayOfWeek}::smallint,
                ${startTimeLocal}::time, ${endTimeLocal}::time, ${item.location || null}::text,
                false,
                NULL,
                NULL,
                ${JSON.stringify({ source: 'syllabus_commit', parseRunId: runId, title: `Class: ${payload.course.name}` })}::jsonb
              )
            `);
          }
          templatesCreated++;
        }

        // Create templates for office hours
        for (const item of officeItems) {
          const isoDow = mapDayToIso(item.day);
          const dayOfWeek = isoDow === 7 ? 0 : isoDow;
          
          const [sh, sm] = (item.start || '09:00').split(':').map(Number);
          const [eh, em] = (item.end || '10:00').split(':').map(Number);
          
          const startTimeLocal = `${String(sh || 0).padStart(2, '0')}:${String(sm || 0).padStart(2, '0')}:00`;
          const endTimeLocal = `${String(eh || 0).padStart(2, '0')}:${String(em || 0).padStart(2, '0')}:00`;
          
          if (semesterStartDate && semesterEndDate) {
            await tx.execute(sql`
              INSERT INTO calendar_event_templates (
                user_id, course_id, event_type, day_of_week,
                start_time_local, end_time_local, location, is_movable,
                start_date, end_date, metadata
              ) VALUES (
                ${userId}::uuid, ${courseId}::uuid, 'OfficeHours'::event_type, ${dayOfWeek}::smallint,
                ${startTimeLocal}::time, ${endTimeLocal}::time, ${item.location || null}::text,
                false,
                ${semesterStartDate}::date,
                ${semesterEndDate}::date,
                ${JSON.stringify({ source: 'syllabus_commit', parseRunId: runId, title: `Office Hours: ${payload.course.name}` })}::jsonb
              )
            `);
          } else {
            await tx.execute(sql`
              INSERT INTO calendar_event_templates (
                user_id, course_id, event_type, day_of_week,
                start_time_local, end_time_local, location, is_movable,
                start_date, end_date, metadata
              ) VALUES (
                ${userId}::uuid, ${courseId}::uuid, 'OfficeHours'::event_type, ${dayOfWeek}::smallint,
                ${startTimeLocal}::time, ${endTimeLocal}::time, ${item.location || null}::text,
                false,
                NULL,
                NULL,
                ${JSON.stringify({ source: 'syllabus_commit', parseRunId: runId, title: `Office Hours: ${payload.course.name}` })}::jsonb
              )
            `);
          }
          templatesCreated++;
        }
        
        console.log(`[Commit] Created ${templatesCreated} event templates (will generate instances on-demand until ${semesterEndDate || 'indefinitely'})`);
      } else {
        // Fallback: Generate instances for 2 years (enough for college tenure)
        console.log(`[Commit] Templates table not available, generating instances for 2 years`);
        
        const classEvents = buildOccurrencesForSemester({
          tz: timezone,
          items: classItems,
          title: () => `Class: ${payload.course.name}`,
          type: 'Class',
          endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // 2 years
        });
        const officeEvents = buildOccurrencesForSemester({
          tz: timezone,
          items: officeItems,
          title: () => `Office Hours: ${payload.course.name}`,
          type: 'OfficeHours',
          endDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // 2 years
        });

        console.log(`[Commit] Generated ${classEvents.length} class events, ${officeEvents.length} office hour events`);

        let classCreated = 0;
        let officeCreated = 0;

        // Check if calendarEventsNew exists (migration 0008)
        const useNewTable = await this.checkTableExists(tx, 'calendar_events_new');
        console.log(`[Commit] Using ${useNewTable ? 'calendar_events_new' : 'calendar_events'} table`);

      // Insert class events
      // Note: We don't check for duplicates here because:
      // 1. The idempotency check at the start prevents duplicate commits
      // 2. Users may want to update their schedule by re-committing
      // 3. Calendar events are time-specific and should be created fresh each time
      for (const evt of classEvents) {
        try {

          if (useNewTable) {
            const [eventCreated] = await tx.insert(schema.calendarEventsNew).values({
              userId,
              courseId,
              title: evt.title,
              eventType: 'Class',
              startAt: evt.startTime,
              endAt: evt.endTime,
              isMovable: false, // Core schedule items are immovable
              metadata: { source: 'syllabus_commit', parseRunId: runId, location: evt.location } as any,
            } as any).returning();
            
            console.log(`[Commit] Created class event: ${evt.title} at ${evt.startTime} (id: ${eventCreated.id})`);

          // Record artifact (use savepoint to prevent transaction abort)
          try {
            await tx.execute(sql`SAVEPOINT artifact_insert`);
            await tx.execute(sql`
              INSERT INTO syllabus_commit_artifacts (parse_run_id, event_id)
              VALUES (${runId}::uuid, ${eventCreated.id}::uuid)
            `);
            await tx.execute(sql`RELEASE SAVEPOINT artifact_insert`);
          } catch (err: any) {
            // Rollback to savepoint to continue transaction - artifacts are optional
            try {
              await tx.execute(sql`ROLLBACK TO SAVEPOINT artifact_insert`);
            } catch {
              // Ignore rollback errors
            }
            console.warn('Failed to record artifact (non-critical):', err.message);
          }

            classCreated++;
          } else {
            // Fallback to legacy calendarEvents
            const [eventCreated] = await tx.insert(schema.calendarEvents).values({
              userId,
              courseId,
              type: 'Class',
              title: evt.title,
              location: evt.location ?? null,
              startTime: evt.startTime,
              endTime: evt.endTime,
              isMovable: false,
              metadata: { source: 'syllabus_commit', parseRunId: runId } as any,
            } as any).returning();
            
            console.log(`[Commit] Created class event (legacy): ${evt.title} at ${evt.startTime}`);

          try {
            const artifactsTableExists = await this.checkTableExists(tx, 'syllabus_commit_artifacts');
            if (artifactsTableExists) {
              await tx.execute(sql`
                INSERT INTO syllabus_commit_artifacts (parse_run_id, event_id)
                VALUES (${runId}::uuid, ${eventCreated.id}::uuid)
              `);
            }
          } catch (err: any) {
            console.warn('Failed to record artifact (non-critical):', err.message);
          }

            classCreated++;
          }
        } catch (err: any) {
          console.error(`[Commit] Error creating class event ${evt.title}:`, err);
          // Continue with next event instead of failing entire transaction
        }
      }

      // Insert office hour events
      // Note: We don't check for duplicates here (same reasoning as class events)
      for (const evt of officeEvents) {
        try {

          if (useNewTable) {
            const [eventCreated] = await tx.insert(schema.calendarEventsNew).values({
              userId,
              courseId,
              title: evt.title,
              eventType: 'OfficeHours',
              startAt: evt.startTime,
              endAt: evt.endTime,
              isMovable: false,
              metadata: { source: 'syllabus_commit', parseRunId: runId, location: evt.location } as any,
            } as any).returning();
            
            console.log(`[Commit] Created office hour event: ${evt.title} at ${evt.startTime} (id: ${eventCreated.id})`);

          try {
            const artifactsTableExists = await this.checkTableExists(tx, 'syllabus_commit_artifacts');
            if (artifactsTableExists) {
              await tx.execute(sql`
                INSERT INTO syllabus_commit_artifacts (parse_run_id, event_id)
                VALUES (${runId}::uuid, ${eventCreated.id}::uuid)
              `);
            }
          } catch (err: any) {
            console.warn('Failed to record artifact (non-critical):', err.message);
          }

            officeCreated++;
          } else {
            const [eventCreated] = await tx.insert(schema.calendarEvents).values({
              userId,
              courseId,
              type: 'OfficeHours',
              title: evt.title,
              location: evt.location ?? null,
              startTime: evt.startTime,
              endTime: evt.endTime,
              isMovable: false,
              metadata: { source: 'syllabus_commit', parseRunId: runId } as any,
            } as any).returning();
            
            console.log(`[Commit] Created office hour event (legacy): ${evt.title} at ${evt.startTime}`);

          try {
            const artifactsTableExists = await this.checkTableExists(tx, 'syllabus_commit_artifacts');
            if (artifactsTableExists) {
              await tx.execute(sql`
                INSERT INTO syllabus_commit_artifacts (parse_run_id, event_id)
                VALUES (${runId}::uuid, ${eventCreated.id}::uuid)
              `);
            }
          } catch (err: any) {
            console.warn('Failed to record artifact (non-critical):', err.message);
          }

            officeCreated++;
          }
        } catch (err: any) {
          console.error(`[Commit] Error creating office hour event ${evt.title}:`, err);
          // Continue with next event instead of failing entire transaction
        }
      }

        console.log(`[Commit] Final counts: ${classCreated} class events, ${officeCreated} office hour events created`);
      }

      // 7. Mark parse run as succeeded and create commit record
      await tx
        .update(schema.syllabusParseRuns)
        .set({ status: 'succeeded', completedAt: new Date() })
        .where(eq(schema.syllabusParseRuns.id, runId));

      const summary: CommitResult = {
        courseId,
        courseName: payload.course.name,
        counts: {
          assignmentsCreated: createdAssignments,
          officeHoursSaved: officeItems.length,
          scheduleSaved: classItems.length,
          classEventsCreated: templatesTableExists ? templatesCreated : classCreated,
          officeHourEventsCreated: templatesTableExists ? 0 : officeCreated, // Templates handle both
          focusBlocksCreated: createdFocusBlocks,
          studyBlocksCreated: createdStudyBlocks,
          dueDateEventsCreated: createdDueDateEvents,
        } as any,
        timezone,
      };

      await tx.insert(schema.syllabusCommits).values({
        parseRunId: runId,
        committedBy: userId,
        summary: summary as any,
      } as any);

      return summary;
    });
  }

  /**
   * Upserts a course (creates if new, updates if existing)
   */
  private async upsertCourse(
    tx: any,
    userId: string,
    courseData: CommitPayload['course'],
    parseRunId: string
  ): Promise<string> {
    const existingCourse = await tx.query.courses.findFirst({
      where: and(eq(schema.courses.userId, userId), eq(schema.courses.name, courseData.name)),
    });

    const courseUpdate = {
      professor: courseData.professor ?? null,
      credits: courseData.credits ?? null,
      gradeWeightsJson: courseData.grade_weights ? (courseData.grade_weights as any) : null,
    } as Partial<typeof schema.courses.$inferInsert>;

    if (existingCourse) {
      await tx.update(schema.courses).set(courseUpdate).where(eq(schema.courses.id, existingCourse.id));
      return existingCourse.id as string;
    } else {
      const [created] = await tx
        .insert(schema.courses)
        .values({
          userId,
          name: courseData.name,
          ...courseUpdate,
        } as any)
        .returning();
      return (created as any).id;
    }
  }

  /**
   * Calculates priority score based on assignment category
   */
  private calculatePriorityScore(category?: string | null): number {
    if (!category) return 20;
    const cat = category.toLowerCase();
    if (cat.includes('exam') || cat.includes('test') || cat.includes('midterm') || cat.includes('final')) return 90;
    if (cat.includes('project')) return 70;
    if (cat.includes('homework') || cat.includes('hw')) return 40;
    if (cat.includes('reading')) return 25;
    return 20;
  }

  /**
   * Calculates optimal Focus block start time before due date
   * Schedules work 1-3 days before the due date, avoiding late-night cramming
   */
  private calculateOptimalFocusTime(dueDate: Date, timezone: string): Date {
    const dueDateTime = DateTime.fromJSDate(dueDate).setZone(timezone);
    
    // Schedule 2 days before due date at 2 PM (optimal afternoon focus time)
    let focusStart = dueDateTime.minus({ days: 2 }).set({ hour: 14, minute: 0, second: 0 });
    
    // If that's in the past, schedule for tomorrow at 2 PM
    const now = DateTime.now().setZone(timezone);
    if (focusStart < now) {
      focusStart = now.plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0 });
    }
    
    // If still in the past (due date is very soon), schedule for next available slot (2 hours from now)
    if (focusStart < now) {
      focusStart = now.plus({ hours: 2 }).set({ minute: 0, second: 0 });
    }
    
    return focusStart.toJSDate();
  }

  /**
   * Calculates chunks for long-form assignments (papers, projects)
   * Similar to Quick Add chunking logic
   */
  private calculateChunks(totalMinutes: number, dueDate: Date, timezone: string): Array<{
    label: string;
    type: 'initial' | 'consistency' | 'acceleration' | 'final' | 'buffer';
    startAt: Date;
    endAt: Date;
    durationMinutes: number;
    index: number;
  }> {
    const MAX_CHUNK_MINUTES = 120; // 2-hour max sessions
    const MIN_GAP_HOURS = 8; // Brain rest between sessions
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
    
    let remainingMinutes = totalMinutes;
    const numChunks = Math.ceil(totalMinutes / MAX_CHUNK_MINUTES);
    const daysNeeded = Math.ceil(numChunks / MAX_CHUNKS_PER_DAY);
    
    // Start working backwards from due date
    let currentDay = dueDateDT.minus({ days: daysNeeded });
    if (currentDay < now.plus({ hours: 1 })) {
      currentDay = now.plus({ hours: 2 }).set({ minute: 0, second: 0 });
    }
    
    const phases = ['Research/Outline', 'Drafting', 'Revision', 'Editing', 'Final Polish'];
    let phaseIdx = 0;
    let chunkIndex = 0;
    
    while (remainingMinutes > 0 && chunks.length < 10) {
      const chunkDuration = Math.min(remainingMinutes, MAX_CHUNK_MINUTES);
      let chunkStart = currentDay.set({ hour: 14, minute: 0 });
      
      // If we already have a chunk today, schedule 8+ hours later
      const todayChunks = chunks.filter(c =>
        DateTime.fromJSDate(c.startAt).hasSame(currentDay, 'day')
      );
      
      if (todayChunks.length > 0 && todayChunks.length < MAX_CHUNKS_PER_DAY) {
        const lastChunk = todayChunks[todayChunks.length - 1];
        const lastEnd = DateTime.fromJSDate(lastChunk.endAt).setZone(timezone);
        chunkStart = lastEnd.plus({ hours: MIN_GAP_HOURS });
        
        if (!chunkStart.hasSame(currentDay, 'day')) {
          currentDay = currentDay.plus({ days: 1 });
          chunkStart = currentDay.set({ hour: 14, minute: 0 });
        }
      } else if (todayChunks.length >= MAX_CHUNKS_PER_DAY) {
        currentDay = currentDay.plus({ days: 1 });
        chunkStart = currentDay.set({ hour: 14, minute: 0 });
      }
      
      const chunkEnd = chunkStart.plus({ minutes: chunkDuration });
      
      chunks.push({
        label: phases[Math.min(phaseIdx, phases.length - 1)],
        type: chunkIndex === 0 ? 'initial' :
              chunkIndex === numChunks - 1 ? 'final' :
              chunkIndex === numChunks - 2 ? 'buffer' : 'consistency',
        startAt: chunkStart.toJSDate(),
        endAt: chunkEnd.toJSDate(),
        durationMinutes: chunkDuration,
        index: chunkIndex,
      });
      
      remainingMinutes -= chunkDuration;
      phaseIdx++;
      chunkIndex++;
    }
    
    return chunks;
  }

  /**
   * Calculates study time based on exam type
   */
  private calculateStudyTime(category: string): number {
    const cat = category.toLowerCase();
    if (cat.includes('final')) return 360; // 6 hours for finals
    if (cat.includes('midterm')) return 240; // 4 hours for midterms
    if (cat.includes('exam') || cat.includes('test')) return 180; // 3 hours for regular exams
    if (cat.includes('quiz')) return 60; // 1 hour for quizzes
    return 120; // 2 hours default
  }

  /**
   * Calculates multiple study sessions spread before exam date
   */
  private calculateStudySessions(examDate: Date, totalMinutes: number, timezone: string): Array<{
    startAt: Date;
    endAt: Date;
    sessionNumber: number;
  }> {
    const examDT = DateTime.fromJSDate(examDate).setZone(timezone);
    const now = DateTime.now().setZone(timezone);
    
    const MAX_SESSION_MINUTES = 90; // 90-minute study sessions (optimal for retention)
    const numSessions = Math.ceil(totalMinutes / MAX_SESSION_MINUTES);
    
    const sessions: Array<{ startAt: Date; endAt: Date; sessionNumber: number }> = [];
    
    // Spread sessions over days before the exam (spaced repetition)
    // Day before exam: final review session
    // 3 days before: intensive study
    // 5 days before: initial study (if needed)
    const daysBefore = [5, 3, 1]; // Spaced repetition schedule
    let sessionIdx = 0;
    
    for (let i = 0; i < numSessions && sessionIdx < daysBefore.length; i++) {
      const daysBack = daysBefore[Math.min(sessionIdx, daysBefore.length - 1)];
      let sessionStart = examDT.minus({ days: daysBack }).set({ hour: 15, minute: 0, second: 0 }); // 3 PM study time
      
      // If in the past, schedule for next available time
      if (sessionStart < now) {
        sessionStart = now.plus({ hours: 2 }).set({ minute: 0, second: 0 });
      }
      
      const sessionDuration = Math.min(totalMinutes - (i * MAX_SESSION_MINUTES), MAX_SESSION_MINUTES);
      const sessionEnd = sessionStart.plus({ minutes: sessionDuration });
      
      sessions.push({
        startAt: sessionStart.toJSDate(),
        endAt: sessionEnd.toJSDate(),
        sessionNumber: i + 1,
      });
      
      sessionIdx++;
    }
    
    return sessions;
  }

  /**
   * Checks if a table exists in the database
   */
  private async checkTableExists(tx: any, tableName: string): Promise<boolean> {
    try {
      const result = await tx.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = ${tableName}
        )
      `);
      return result.rows?.[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a calendar event already exists
   */
  private async checkEventExists(
    tx: any,
    userId: string,
    courseId: string | null,
    evt: { startTime: Date; endTime: Date; type: string },
    useNewTable: boolean,
    eventType: string = 'Class'
  ): Promise<boolean> {
    if (useNewTable) {
      const existing = await tx
        .select()
        .from(schema.calendarEventsNew)
        .where(
          and(
            eq(schema.calendarEventsNew.userId, userId),
            eq(schema.calendarEventsNew.courseId, courseId),
            eq(schema.calendarEventsNew.eventType, eventType as any),
            eq(schema.calendarEventsNew.startAt, evt.startTime as any),
            eq(schema.calendarEventsNew.endAt, evt.endTime as any)
          ) as any
        )
        .limit(1);
      return existing.length > 0;
    } else {
      const existing = await tx
        .select()
        .from(schema.calendarEvents)
        .where(
          and(
            eq(schema.calendarEvents.userId, userId),
            eq(schema.calendarEvents.courseId, courseId),
            eq(schema.calendarEvents.type, eventType as any),
            eq(schema.calendarEvents.startTime, evt.startTime as any),
            eq(schema.calendarEvents.endTime, evt.endTime as any)
          ) as any
        )
        .limit(1);
      return existing.length > 0;
    }
  }

  /**
   * Generates a dedupe hash for an assignment
   * Note: This is not currently stored in the assignments table, but can be used for client-side deduplication
   */
  generateDedupeHash(courseId: string, title: string, dueAt: string | null): string {
    const normalized = JSON.stringify({ courseId, title: title.trim().toLowerCase(), dueAt });
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }
}

