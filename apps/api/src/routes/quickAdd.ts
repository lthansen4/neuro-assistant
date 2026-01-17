// apps/api/src/routes/quickAdd.ts
import { Hono } from "hono";
import { db, schema } from "../lib/db";
import { and, eq, ilike, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { DateTime } from "luxon";
import { getUserId } from "../lib/auth-utils";

// Very light heuristic parser (stub) — replace with Vercel AI SDK later
function heuristicParse(input: string) {
  const text = input.trim();
  const lower = text.toLowerCase();

  // Extract course hint (first word before space, e.g., "Math test Friday")
  const courseHint = text.split(" ")[0];

  // Very naive category inference
  let category = "Task";
  if (lower.includes("exam") || lower.includes("test") || lower.includes("midterm") || lower.includes("final")) category = "Exam";
  else if (lower.includes("homework") || lower.includes("hw")) category = "Homework";
  else if (lower.includes("reading")) category = "Reading";

  // Very naive due detection placeholders (expect FE to allow editing)
  // In a real integration, the LLM will return ISO dates
  const dueDateISO = undefined;

  // Title defaults to input (will be editable on FE)
  const title = text;

  // Confidence is low here by design; LLM will set higher
  const confidence = 0.35;

  return {
    courseHint,
    title,
    category,
    dueDateISO,
    effortMinutes: undefined as number | undefined,
    confidence,
  };
}

// Dedupe hash: stable hash of normalized input
function dedupeHash(raw: string) {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

// Simple priority score heuristic
function calcPriorityScore(category?: string) {
  if (!category) return 10;
  const c = category.toLowerCase();
  if (c.includes("exam") || c.includes("test") || c.includes("midterm") || c.includes("final")) return 90;
  if (c.includes("project")) return 70;
  if (c.includes("homework") || c.includes("hw")) return 40;
  if (c.includes("reading")) return 25;
  return 20;
}

export const quickAddRoute = new Hono();

// POST /api/quick-add/parse
// body: { text: string, user_tz?: string, now?: string }
// returns: { parse_id, assignment_draft, focus_block_draft, confidences, suggestions, dedupe, smart_questions }
quickAddRoute.post("/parse", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{ text: string; user_tz?: string; now?: string }>();
    if (!body?.text) return c.json({ error: "text is required" }, 400);

    const userTz = body.user_tz || "America/Chicago";
    const now = body.now ? DateTime.fromISO(body.now, { zone: userTz }) : DateTime.now().setZone(userTz);

    // Fetch user's courses for context
    const courses = await db.query.courses.findMany({
      where: eq(schema.courses.userId, userId),
      columns: { id: true, name: true },
    });

    // Fetch upcoming events/deadlines for next 7 days (for context-aware questions)
    const weekFromNow = now.plus({ days: 7 }).toJSDate();
    const nowDate = now.toJSDate();
    
    // Simplified: Just get basic event info without complex queries for now
    const upcomingEvents: Array<{ title: string; category: string; startAt: Date; endAt: Date }> = [];
    const pendingAssignments: Array<{ title: string; category: string | null; dueAt: Date | null; estimatedDuration: number | null }> = [];

    // Use OpenAI to parse natural language
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        title: z.string().describe("Assignment title (normalized). If preliminary work mentioned (e.g., 'choose topic'), include it as part of the main task title, e.g., 'Research Paper (Topic Selection + Writing)'"),
        course_hint: z.string().nullable().describe("Course code or name extracted from text (e.g., 'cs', 'math')"),
        category: z.enum(["Homework", "Exam", "Reading", "Study Session"]).describe("Type of assignment"),
        due_date: z.string().nullable().describe("Due date in ISO format (YYYY-MM-DD) or null if not mentioned"),
        due_time: z.string().nullable().describe("Due time in 24h format (HH:MM) or null if not mentioned"),
        estimated_duration: z.number().describe("Estimated time needed in minutes. MUST include time for any prerequisites mentioned (e.g., 'read chapter 2 first' = add 20-30 min)"),
        has_prerequisites: z.boolean().describe("True if user mentions steps that must happen first (e.g., 'read chapter 2 first', 'need to review notes', 'watch lecture first')"),
        prerequisites_summary: z.string().nullable().describe("Brief summary of what needs to be done first, if has_prerequisites is true (e.g., 'Read chapter 2'). Null otherwise."),
        has_study_intent: z.boolean().describe("True if user wants to schedule study/work time"),
        preferred_work_time: z.string().nullable().describe("If user specified WHEN to work on it (e.g., 'today at 3pm', 'tomorrow morning'), extract the time. Null if they only mentioned due date."),
        requires_chunking: z.boolean().describe("True if this is a long-form task requiring multiple work sessions (paper, large project, thesis)"),
        description: z.string().nullable().describe("Detailed notes or description from the user's input, if any. Extract specific instructions, requirements, or prerequisites mentioned."),
      }),
      prompt: `Parse this assignment input: "${body.text}"
      
Current date/time: ${now.toISO()} (which is a ${now.weekdayLong}, ${now.toFormat('MMMM d, yyyy')})
Available courses: ${courses.map(c => c.name).join(", ")}

Extract:
- Title (clean, normalized)
- Course hint (if mentioned, e.g., "cs" from "cs homework")
- Category (Homework, Exam, Reading, or Study Session)
- Due date (parse relative dates like "today", "tomorrow", "monday", "next friday")
  IMPORTANT RULES:
  * "today" = the current date shown above (${now.toFormat('yyyy-MM-dd')})
  * "tomorrow" = ${now.plus({ days: 1 }).toFormat('yyyy-MM-dd')}
  * "next [day]" means the NEXT occurrence of that day, not this week if we're already past it
  * For example, if today is Thursday and user says "next Friday", that's TOMORROW. If today is Thursday and user says "next Monday", that's 4 days from now.
- Due time (default to 17:00 if not specified, unless user says "today" then default to 23:59)
- Estimated duration in minutes
- **CRITICAL: Check for prerequisites or prep work**
  * If user says "I need to X first", "after reading Y", "once I finish Z", "need to review W" → has_prerequisites = true
  * Extract what needs to be done first into prerequisites_summary
  * ADD time for prerequisites to estimated_duration
    Examples:
    - "read chapter 2 first" → add 20-30 min
    - "review lecture notes" → add 15-20 min  
    - "watch the video first" → add 30-45 min
    - "need to outline first" → add 30-45 min
- Preferred work time: If user says WHEN they want to work on it (e.g., "work on math today at 3pm", "do homework tomorrow morning"), extract that. 
  Examples: "today at 3pm" → "today at 15:00", "tomorrow morning" → "tomorrow morning", "friday afternoon" → "friday afternoon"
  If they ONLY mention due date (e.g., "math homework due friday"), set to null

Consider if this needs chunking (requires_chunking):
- Papers/essays: Usually 300-600 min (5-10 hrs) → requires_chunking = true
- Large projects: Usually > 240 min (4+ hrs) → requires_chunking = true  
- Regular homework: Usually < 180 min (3 hrs) → requires_chunking = false
- Exams/tests: Don't chunk these, they're single events → requires_chunking = false

IMPORTANT: If user mentions preliminary work (like "choose a topic", "decide on topic", "select a research area"), 
treat this as PART OF the paper/project, not a separate task. Include this time in the total estimate.
For example: "choose a topic for my research paper" = a paper that needs topic selection (add 30-60 min to base estimate).

Be realistic about duration estimates:
- Simple homework (5-10 problems): 30-60 min
- Medium homework (readings + problems): 60-120 min
- Papers (3-5 pages): 300-480 min (5-8 hours)
- Large papers (10+ pages): 480-600 min (8-10 hours)
- Projects (coding, research): 240-600 min (4-10 hours)
- Topic selection for papers: Add 30-60 min to base paper estimate

- Whether user wants to schedule study time (detect words like "study", "work on", "prepare")`,
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quickAdd.ts:parse:aiResult',message:'AI parsed input',data:{inputText:body.text,preferred_work_time:object.preferred_work_time,due_date:object.due_date,has_study_intent:object.has_study_intent},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B1'})}).catch(()=>{});
    // #endregion
    
    console.log('[QuickAdd Parse] AI parsed result:', JSON.stringify(object, null, 2));
    console.log('[QuickAdd Parse] Preferred work time:', object.preferred_work_time);

    // Fuzzy match course FIRST (before using it)
    let matchedCourseId: string | null = null;
    let courseConfidence: "high" | "medium" | "low" = "low";
    const courseSuggestions: Array<{ id: string; name: string }> = [];

    if (object.course_hint && typeof object.course_hint === 'string') {
      const hint = object.course_hint.toLowerCase();
      for (const course of courses) {
        const nameLower = (course.name || '').toLowerCase();
        if (nameLower.includes(hint)) {
          if (!matchedCourseId) {
            matchedCourseId = course.id;
            courseConfidence = nameLower === hint ? "high" : "medium";
          }
          courseSuggestions.push(course);
        }
      }
    }

    // Parse due date and intelligently set time based on course schedule
    let dueAt: string | null = null;
    if (object.due_date) {
      let dueTime = object.due_time || "17:00"; // Default to 5 PM
      
      // If we have a matched course, try to find the class time on the due date
      if (matchedCourseId && object.due_date) {
        const dueDate = DateTime.fromISO(object.due_date, { zone: userTz });
        const dayOfWeek = dueDate.weekdayLong; // "Monday", "Tuesday", etc.
        
        // Find class event for this course on this day of week
        let classEvent = null;
        if (dayOfWeek) {
          try {
            // Query calendar_event_templates for Class events
            const result: any = await db.execute(
              sql`SELECT id, start_time_local, day_of_week FROM calendar_event_templates 
                  WHERE user_id = ${userId} 
                  AND course_id = ${matchedCourseId} 
                  AND event_type = 'Class'`
            );
            
            const rows = result.rows || [];
            
            // Map day name to number: Monday=1, Tuesday=2, etc. (0=Sunday)
            const dayMap: Record<string, number> = {
              'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
              'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };
            const targetDayNum = dayMap[dayOfWeek];
            
            // Filter for the day of week (by number)
            classEvent = rows.find((e: any) => e.day_of_week === targetDayNum) || null;
          } catch (err: any) {
            // Continue without class time if query fails
            console.error('[QuickAdd] Failed to fetch class time:', err.message);
          }
        }
        
        if (classEvent && classEvent.start_time_local) {
          // Use the class time as the due time
          dueTime = classEvent.start_time_local; // Already in HH:MM format
        }
      }
      
      const [hours, minutes] = dueTime.split(":").map(Number);
      const dueDateTime = DateTime.fromISO(object.due_date, { zone: userTz }).set({ hour: hours, minute: minutes });
      dueAt = dueDateTime.toUTC().toISO();
    }

    // Generate parse ID
    const parseId = createHash("sha256").update(`${userId}-${Date.now()}-${body.text}`).digest("hex").slice(0, 16);

    // Check for duplicates
    const dedupeHash = createHash("sha256").update(`${matchedCourseId || "none"}-${object.title}-${dueAt || "none"}`).digest("hex").slice(0, 16);
    const existingAssignment = await db.query.assignments.findFirst({
      where: and(
        eq(schema.assignments.userId, userId),
        eq(schema.assignments.title, object.title),
        matchedCourseId ? eq(schema.assignments.courseId, matchedCourseId) : sql`course_id IS NULL`
      ),
    });

    // Build assignment draft
    const assignmentDraft = {
      title: object.title,
      course_id: matchedCourseId,
      due_at: dueAt,
      category: object.category,
      estimated_duration: object.estimated_duration,
      description: object.description, // Use the AI-extracted description
      requires_chunking: object.requires_chunking, // NEW: AI-detected chunking flag
    };

    // Generate context-aware smart questions using AI
    let smartQuestions: any[] = [];
    try {
      smartQuestions = await buildSmartQuestions({
        userId,
        userTz,
        title: object.title,
        category: object.category,
        dueAt,
        estimatedDuration: object.estimated_duration,
        upcomingEvents,
        pendingAssignments,
      });
      console.log(`[QuickAdd] Generated ${smartQuestions.length} smart questions`);
    } catch (e) {
      console.error("[QuickAdd] Failed to generate smart questions:", e);
      // Continue without questions if AI fails
    }

    // Always build focus block draft to help complete the assignment
    let focusBlockDraft = null;
    let chunks: Chunk[] | null = null;
    
    if (dueAt) {
      // Check if this needs chunking
      const shouldChunk = object.estimated_duration >= 240 && object.requires_chunking; // 4+ hours
      
      if (shouldChunk) {
        // Calculate chunks and include them in the response
        chunks = calculateChunks(object.estimated_duration, dueAt, userTz);
        console.log(`[QuickAdd Parse] Calculated ${chunks.length} chunks for long-form assignment`);
        
        focusBlockDraft = {
          title: `Work on: ${object.title}`,
          start_at: chunks[0].startAt.toISOString(),
          duration_minutes: chunks[0].durationMinutes,
          category: "Focus",
          chunked: true,
          chunks: chunks.map(chunk => ({
            label: chunk.label,
            type: chunk.type,
            startAt: chunk.startAt.toISOString(),
            endAt: chunk.endAt.toISOString(),
            durationMinutes: chunk.durationMinutes
          }))
        };
      } else {
        // Single Focus block
        const dueDateTime = DateTime.fromISO(dueAt, { zone: "utc" }).setZone(userTz);
        const nowInUserTz = DateTime.now().setZone(userTz);
        
        let focusStart: DateTime;
        
        // Check if user specified a preferred work time
        if (object.preferred_work_time) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quickAdd.ts:scheduling:userSpecified',message:'User specified work time',data:{preferred_work_time:object.preferred_work_time},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B2'})}).catch(()=>{});
          // #endregion
          
          console.log(`[QuickAdd] User specified work time: "${object.preferred_work_time}"`);
          
          // Parse user's preferred time (e.g., "today at 3pm", "tomorrow morning")
          const timeStr = object.preferred_work_time.toLowerCase();
          
          if (timeStr.includes('today')) {
            focusStart = nowInUserTz.set({ hour: 14, minute: 0 }); // Default 2pm
            if (timeStr.includes('morning')) focusStart = nowInUserTz.set({ hour: 9, minute: 0 });
            if (timeStr.includes('afternoon')) focusStart = nowInUserTz.set({ hour: 14, minute: 0 });
            if (timeStr.includes('evening')) focusStart = nowInUserTz.set({ hour: 18, minute: 0 });
            // Extract specific time like "3pm" or "15:00"
            const timeMatch = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
            if (timeMatch) {
              let hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              const isPM = timeMatch[3] === 'pm';
              if (isPM && hour < 12) hour += 12;
              if (!isPM && timeMatch[3] === 'am' && hour === 12) hour = 0;
              focusStart = nowInUserTz.set({ hour, minute });
            }
          } else if (timeStr.includes('tomorrow')) {
            focusStart = nowInUserTz.plus({ days: 1 }).set({ hour: 14, minute: 0 });
            if (timeStr.includes('morning')) focusStart = focusStart.set({ hour: 9, minute: 0 });
            if (timeStr.includes('afternoon')) focusStart = focusStart.set({ hour: 14, minute: 0 });
            if (timeStr.includes('evening')) focusStart = focusStart.set({ hour: 18, minute: 0 });
          } else {
            // Generic time on due date
            focusStart = dueDateTime.minus({ days: 1 }).set({ hour: 14, minute: 0 });
          }
          
          console.log(`[QuickAdd] Using user-specified time: ${focusStart.toFormat('EEE MMM dd h:mma')}`);
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quickAdd.ts:scheduling:smartScheduling',message:'No preferred time - using smart scheduling',data:{preferred_work_time:object.preferred_work_time,has_study_intent:object.has_study_intent},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B3'})}).catch(()=>{});
          // #endregion
          
          // No preferred time - use smart scheduling to find first available slot
          console.log(`[QuickAdd] No preferred time specified, finding first available slot...`);
          
          let searchStart = nowInUserTz.plus({ hours: 1 });
          if (searchStart.hour >= 20) {
            searchStart = nowInUserTz.plus({ days: 1 }).set({ hour: 9, minute: 0 });
          }
          
          focusStart = await findFirstAvailableSlot(
            userId,
            searchStart,
            object.estimated_duration,
            dueDateTime,
            userTz
          );
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quickAdd.ts:scheduling:smartSchedulingResult',message:'Smart scheduling found slot',data:{foundSlot:focusStart.toISO(),searchStarted:searchStart.toISO()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B4'})}).catch(()=>{});
          // #endregion
        }
        
        focusBlockDraft = {
          title: `Work on: ${object.title}`,
          start_at: focusStart.toUTC().toISO(),
          duration_minutes: object.estimated_duration,
          category: "Focus",
          chunked: false,
          chunks: null
        };
      }
    }

    return c.json({
      parse_id: parseId,
      assignment_draft: assignmentDraft,
      focus_block_draft: focusBlockDraft,
      confidences: {
        title: "high",
        course_id: courseConfidence,
        due_at: dueAt ? "high" : "low",
        category: "high",
        estimated_duration: "medium",
      },
      suggestions: {
        courses: courseSuggestions,
      },
      dedupe: {
        hash: dedupeHash,
        exists: !!existingAssignment,
        message: existingAssignment ? `Similar assignment already exists: ${existingAssignment.title}` : null,
      },
      smart_questions: smartQuestions, // NEW: Context-aware questions for user
    });
  } catch (e: any) {
    console.error("[QuickAdd Parse Error]", e);
    return c.json({ error: e.message || "Failed to parse input" }, 400);
  }
});

// POST /api/quick-add/questions
// body: { assignment_draft, user_tz? }
// returns: { smart_questions }
quickAddRoute.post("/questions", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{
      assignment_draft: {
        title: string;
        category?: string;
        due_at?: string | null;
        estimated_duration?: number | null;
      };
      user_tz?: string;
    }>();

    if (!body?.assignment_draft?.title) {
      return c.json({ error: "assignment_draft.title is required" }, 400);
    }

    const userTz = body.user_tz || "America/Chicago";
    const draft = body.assignment_draft;
    const smartQuestions = await buildSmartQuestions({
      userId,
      userTz,
      title: draft.title,
      category: draft.category,
      dueAt: draft.due_at || null,
      estimatedDuration: draft.estimated_duration || null,
      upcomingEvents: [],
      pendingAssignments: [],
    });

    return c.json({ smart_questions: smartQuestions });
  } catch (e: any) {
    console.error("[QuickAdd Questions Error]", e);
    return c.json({ error: e.message }, 400);
  }
});

// POST /api/quick-add/commit
// body: {
//   rawInput: string,
//   dedupeHash: string,
//   parsed: { courseId?: string; title: string; category?: string; dueDateISO?: string; effortMinutes?: number;
//             createFocusSession?: boolean; sessionStartISO?: string; sessionEndISO?: string },
//   saveAlias?: { alias: string; courseId: string } | null
// }
quickAddRoute.post("/commit", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{
      rawInput: string;
      dedupeHash: string;
      parsed: {
        courseId?: string;
        title: string;
        category?: string;
        dueDateISO?: string;
        effortMinutes?: number;
        createFocusSession?: boolean;
        sessionStartISO?: string;
        sessionEndISO?: string;
        confidence?: number;
      };
      saveAlias?: { alias: string; courseId: string } | null;
    }>();

    if (!body?.rawInput || !body?.dedupeHash || !body?.parsed?.title) {
      return c.json({ error: "rawInput, dedupeHash and parsed.title are required" }, 400);
    }

    // Optional dedupe: if we already created an item with same hash very recently, short-circuit
    const existing = await db
      .select()
      .from(schema.quickAddLogs)
      .where(and(eq(schema.quickAddLogs.userId, userId), eq(schema.quickAddLogs.dedupeHash, body.dedupeHash)))
      .limit(1);

    if (existing.length && (existing[0] as any).createdAssignmentId) {
      return c.json({
        deduped: true,
        createdAssignmentId: (existing[0] as any).createdAssignmentId,
        createdEventId: (existing[0] as any).createdEventId ?? null,
      });
    }

    const now = new Date();

    // Transaction: create assignment, optional event, upsert alias, log
    const result = await db.transaction(async (tx) => {
      // Create assignment
      const due = body.parsed.dueDateISO ? new Date(body.parsed.dueDateISO) : null;
      const [assignment] = await tx
        .insert(schema.assignments)
        .values({
          userId,
          courseId: body.parsed.courseId ?? null,
          title: body.parsed.title,
          description: (body.parsed as any).description || body.rawInput, // Use AI description if available, else raw
          category: body.parsed.category ?? null,
          dueDate: due,
          effortEstimateMinutes: body.parsed.effortMinutes ?? null,
          priorityScore: calcPriorityScore(body.parsed.category),
          status: "Inbox",
        } as any)
        .returning();

      // Optional focus session event
      let createdEventId: string | null = null;
      if (body.parsed.createFocusSession && body.parsed.sessionStartISO && body.parsed.sessionEndISO) {
        // Fetch course name if we have a courseId for metadata consistency
        let courseNameMetadata = null;
        if (body.parsed.courseId) {
          const course = await tx.query.courses.findFirst({
            where: eq(schema.courses.id, body.parsed.courseId),
            columns: { name: true }
          });
          courseNameMetadata = course?.name || null;
        }

        const start = new Date(body.parsed.sessionStartISO);
        const end = new Date(body.parsed.sessionEndISO);
        const [evt] = await tx
          .insert(schema.calendarEventsNew)
          .values({
            userId,
            courseId: body.parsed.courseId ?? null,
            linkedAssignmentId: assignment.id,
            eventType: "Focus",
            title: `Focus: ${body.parsed.title}`,
            description: (body.parsed as any).description || body.rawInput, // Consistent description
            startAt: start,
            endAt: end,
            isMovable: true,
            metadata: {
              courseName: courseNameMetadata // Add courseName to metadata
            }
          } as any)
          .returning();
        createdEventId = (evt as any).id;
      }

      // Save alias if requested
      if (body.saveAlias?.alias && body.saveAlias?.courseId) {
        // Uses CI unique index on (user_id, lower(alias)) created by migration
        try {
          await tx.insert(schema.userCourseAliases).values({
            userId,
            alias: body.saveAlias.alias,
            courseId: body.saveAlias.courseId,
            confidence: "0.900",
            usageCount: 1,
          } as any);
        } catch {
          // On conflict, update usage_count and courseId if changed
          await tx.execute(sql`
            update user_course_aliases
            set usage_count = usage_count + 1, course_id = ${body.saveAlias.courseId}::uuid, updated_at = now()
            where user_id = ${userId}::uuid and lower(alias) = lower(${body.saveAlias.alias});
          `);
        }
      }

      // Log the quick add
      await tx.insert(schema.quickAddLogs).values({
        userId,
        rawInput: body.rawInput,
        parsedPayload: body.parsed as any,
        confidence: body.parsed.confidence ?? 0.35,
        dedupeHash: body.dedupeHash,
        createdAssignmentId: assignment.id,
        createdEventId,
      } as any);

      return { assignmentId: assignment.id as string, eventId: createdEventId };
    });

    return c.json({
      ok: true,
      createdAssignmentId: result.assignmentId,
      createdEventId: result.eventId,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// GET /api/quick-add/aliases
quickAddRoute.get("/aliases", async (c) => {
  try {
    const userId = await getUserId(c);
    const rows = await db
      .select({
        id: schema.userCourseAliases.id,
        alias: schema.userCourseAliases.alias,
        courseId: schema.userCourseAliases.courseId,
        confidence: schema.userCourseAliases.confidence,
        usageCount: schema.userCourseAliases.usageCount,
      })
      .from(schema.userCourseAliases)
      .where(eq(schema.userCourseAliases.userId, userId));
    return c.json(rows);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// POST /api/quick-add/confirm
// body: { parse_id, assignment_draft, focus_block_draft?, on_duplicate }
quickAddRoute.post("/confirm", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{
      parse_id: string;
      assignment_draft: {
        title: string;
        course_id?: string | null;
        due_at?: string | null;
        category?: string;
        estimated_duration?: number;
        description?: string | null;
      };
      focus_block_draft?: {
        title: string;
        start_at: string;
        duration_minutes: number;
        category: string;
      } | null;
      on_duplicate?: "skip" | "create";
      user_tz?: string;
      smart_answers?: Record<string, any>;
    }>();


    if (!body.assignment_draft?.title) {
      return c.json({ error: "assignment_draft.title is required" }, 400);
    }

    let draft = { ...body.assignment_draft };
    const userTz = body.user_tz || "America/Chicago";
    
    // If a course is selected in confirm, align due time to class start for that day
    if (draft.due_at && draft.course_id) {
      const classStart = await getClassStartTimeForDate(userId, draft.course_id, draft.due_at, userTz);
      if (classStart) {
        const [hours, minutes] = classStart.split(":").map(Number);
        const dueDateLocal = DateTime.fromISO(draft.due_at, { zone: "utc" })
          .setZone(userTz)
          .set({ hour: hours, minute: minutes, second: 0 });
        draft.due_at = dueDateLocal.toUTC().toISO()!;
      }
    }
    
    
    // If user provided description/answers and we have a due date, use AI to optimize the Focus block
    let optimizedFocusBlock = body.focus_block_draft;
    if (draft.due_at && optimizedFocusBlock && (draft.description || body.smart_answers)) {
      try {
        const smartAnswersText = body.smart_answers 
          ? Object.entries(body.smart_answers)
              .map(([k, v]) => `- ${k}: ${v}`)
              .join('\n')
          : 'No smart answers provided';

        const { object: aiAdvice } = await generateObject({
          model: openai("gpt-4o-mini"),
          schema: z.object({
            adjusted_duration: z.number().describe("Recommended duration in minutes based on context"),
            days_before_due: z.number().describe("How many days before due date to schedule (1-7)"),
            preferred_time: z.string().describe("Best time of day in 24h format (e.g., '14:00' for 2 PM, '09:00' for morning)"),
            needs_multiple_sessions: z.boolean().describe("True if task needs multiple work sessions"),
            reasoning: z.string().describe("Brief explanation of scheduling decision"),
          }),
          prompt: `Analyze this assignment and provide smart scheduling based on user's context and answers:

Assignment: ${draft.title}
Category: ${draft.category}
Due: ${draft.due_at}
Estimated Duration: ${draft.estimated_duration} minutes
Description: ${draft.description || 'Not provided'}

User's Answers to Context Questions:
${smartAnswersText}

Consider:
- Their specific answers (e.g., if they said "before exam", schedule before exam date)
- Reading tasks: need sustained focus, morning/afternoon best
- Coding/technical: afternoon when energy is high, may need multiple sessions
- Writing/creative: varies, respect user's context
- Group work: schedule before meeting date
- Large tasks (>2 hours): break into multiple sessions
- If they mentioned conflicts/deadlines, work around them

Use their specific context to make the BEST scheduling decision.`,
        });

        // Apply AI recommendations
        const dueDateTime = DateTime.fromISO(draft.due_at, { zone: "utc" }).setZone(userTz);
        const [hours, minutes] = aiAdvice.preferred_time.split(":").map(Number);
        let focusStart = dueDateTime.minus({ days: aiAdvice.days_before_due }).set({ hour: hours, minute: minutes });
        
        // Ensure Focus block is always in the future (at least 1 hour from now)
        const nowInUserTz = DateTime.now().setZone(userTz);
        const minStartTime = nowInUserTz.plus({ hours: 1 });
        if (focusStart < minStartTime) {
          // If calculated time is in the past, schedule for tomorrow at the same time
          focusStart = nowInUserTz.plus({ days: 1 }).set({ hour: hours, minute: minutes });
          // If that's still too close or past the due date, schedule for later today
          if (focusStart >= dueDateTime) {
            focusStart = nowInUserTz.plus({ hours: 2 }).set({ minute: 0 });
          }
        }
        
        optimizedFocusBlock = {
          ...optimizedFocusBlock,
          start_at: focusStart.toUTC().toISO()!,
          duration_minutes: aiAdvice.adjusted_duration,
          title: aiAdvice.needs_multiple_sessions 
            ? `Work on: ${draft.title} (Session 1)` 
            : `Work on: ${draft.title}`,
        };

        console.log(`[QuickAdd AI] ${aiAdvice.reasoning}`);
      } catch (aiError: any) {
        console.error("[QuickAdd AI] Failed to optimize Focus block:", aiError);
        // Continue with original Focus block if AI fails
      }
    }


    // Check for duplicates
    if (body.on_duplicate === "skip") {
      const existing = await db.query.assignments.findFirst({
        where: and(
          eq(schema.assignments.userId, userId),
          eq(schema.assignments.title, draft.title),
          draft.course_id ? eq(schema.assignments.courseId, draft.course_id) : sql`course_id IS NULL`
        ),
      });
      if (existing) {
        return c.json({ ok: true, skipped: true, message: "Duplicate assignment skipped" });
      }
    }

    
    // PRIORITY 2: Check Recovery Forcing (4hr deep work limit)
    // Check if any of the scheduled dates would exceed the 4-hour limit
    let recoveryForcedWarning: string | null = null;
    try {
      const ADHDGuardian = await import('../lib/adhd-guardian');
      
      // For now, check today only (in full implementation, check all scheduled dates)
      const today = new Date();
      const exceeded = await ADHDGuardian.default.hasExceededDeepWorkLimit(userId, today);
      
      if (exceeded && draft.due_at && new Date(draft.due_at) <= new Date(Date.now() + 86400000)) {
        // Assignment is due within 24 hours and user has exceeded limit
        recoveryForcedWarning = "⚠️ Recovery forced today (4+ hours deep work). Scheduling for tomorrow instead.";
        console.log(`[Recovery Forcing] ${recoveryForcedWarning}`);
      }
    } catch (checkError) {
      console.error('[Recovery Forcing] Failed to check deep work limit:', checkError);
    }
    
    // Calculate chunks if this is a long-form assignment
    const shouldChunk = draft.estimated_duration && draft.estimated_duration >= 240 && draft.due_at; // 4+ hours
    const chunks = shouldChunk && draft.estimated_duration && draft.due_at ? calculateChunks(draft.estimated_duration, draft.due_at, userTz) : null;
    
    console.log(`[QuickAdd Confirm] Should chunk: ${shouldChunk}, Chunks: ${chunks?.length || 0}`);
    
    // Create assignment
    const [assignment] = await db
      .insert(schema.assignments)
      .values({
        userId,
        courseId: draft.course_id || null,
        title: draft.title,
        description: draft.description || null, // Save the AI-extracted or user-edited description
        category: draft.category || "Homework",
        dueDate: draft.due_at ? new Date(draft.due_at) : null,
        effortEstimateMinutes: draft.estimated_duration || 60,
        status: "Scheduled", // Auto-schedule, not Inbox!
        priorityScore: calcPriorityScore(draft.category),
        requiresChunking: !!chunks, // NEW: Set chunking flag
        createdAt: new Date(),
      })
      .returning();
      
    // Fetch course name if we have a courseId for metadata consistency
    let courseName = null;
    if (draft.course_id) {
      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, draft.course_id),
        columns: { name: true }
      });
      courseName = course?.name || null;
    }

    // Create a "due date marker" event on the calendar at the assignment's due time
    let dueDateEvent = null;
    if (draft.due_at) {
      const dueDate = new Date(draft.due_at);
      // Create a 15-minute marker event at the due time
      const dueEndTime = new Date(dueDate.getTime() + 15 * 60 * 1000);
      
      
      const [dueDateEvt] = await db
        .insert(schema.calendarEventsNew)
        .values({
          userId,
          courseId: draft.course_id || null,
          title: `📌 DUE: ${draft.title}`,
          eventType: "DueDate", // Use "DueDate" type for deadline markers
          startAt: dueDate,
          endAt: dueEndTime,
          isMovable: false, // Due dates shouldn't move
          linkedAssignmentId: assignment.id,
          metadata: {
            courseName: courseName // Add courseName to metadata for calendar view consistency
          }
        })
        .returning();
      dueDateEvent = dueDateEvt;
      
    }

    // Create focus block(s) - either multiple chunks or single block
    let focusEvents = [];
    if (chunks && chunks.length > 0) {
      // Create multiple Focus blocks for chunked assignments
      console.log(`[QuickAdd Confirm] Creating ${chunks.length} chunked Focus blocks with TRANSITION TAX buffers`);
      
      // TRANSITION TAX: Create Focus blocks + 15m decompression buffers
      // This prevents context switching fatigue and schedule cramming
      const eventsToCreate = [];
      
      for (let idx = 0; idx < chunks.length; idx++) {
        const chunk = chunks[idx];
        
        // Add the Focus block
        eventsToCreate.push({
          userId,
          courseId: draft.course_id || null,
          title: `${draft.title} - ${chunk.label}`, // e.g., "Paper - Research/Outline"
          description: draft.description || null, // Consistent description
          eventType: 'Focus' as const,
          startAt: chunk.startAt,
          endAt: chunk.endAt,
          isMovable: true,
          linkedAssignmentId: assignment.id,
          metadata: { 
            chunkIndex: idx, 
            totalChunks: chunks.length, 
            chunkType: chunk.type,
            durationMinutes: chunk.durationMinutes,
            dueDate: assignment.dueDate?.toISOString(), // PRIORITY 2: For due date validation
            courseName: courseName // Add courseName to metadata
          }
        });
        
        // TRANSITION TAX: Add 15m buffer AFTER each Focus block (except the last one)
        if (idx < chunks.length - 1 || chunks.length === 1) {
          const bufferStart = new Date(chunk.endAt);
          const bufferEnd = new Date(bufferStart.getTime() + 15 * 60 * 1000); // +15 minutes
          
          // DEDUPLICATION: Avoid creating multiple buffers for the same time slot
          const alreadyCreated = eventsToCreate.some(e => 
            e.title === "Transition Buffer" && 
            e.startAt.getTime() === bufferStart.getTime()
          );

          if (!alreadyCreated) {
            eventsToCreate.push({
              userId,
              courseId: draft.course_id || null,
              title: "Transition Buffer",
              eventType: 'Chill' as const, // Low-cog recovery time
              startAt: bufferStart,
              endAt: bufferEnd,
              isMovable: true, // User can delete if needed
              linkedAssignmentId: assignment.id,
              metadata: { 
                transitionTax: true,
                afterChunkIndex: idx,
                purpose: 'Context switching recovery - prevents mental fatigue',
                courseName: courseName // Add courseName to metadata
              }
            });
            console.log(`[QuickAdd] Queued 15m transition buffer after ${chunk.label}`);
          }
        }
      }
      
      focusEvents = await db
        .insert(schema.calendarEventsNew)
        .values(eventsToCreate)
        .returning();
      
      console.log(`[QuickAdd Confirm] Created ${focusEvents.length} events (chunks + transition buffers)`);
      
      // ... rest of the branch ...
      try {
        const ADHDGuardian = await import('../lib/adhd-guardian');
        
        for (const event of focusEvents) {
          if (event.eventType === 'Focus') {
            const durationMinutes = Math.floor((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / (1000 * 60));
            await ADHDGuardian.default.trackDeepWork(userId, new Date(event.startAt), durationMinutes);
            console.log(`[Recovery Forcing] Tracked ${durationMinutes}min deep work for ${new Date(event.startAt).toLocaleDateString()}`);
          }
        }
      } catch (trackError) {
        console.error('[Recovery Forcing] Failed to track deep work:', trackError);
        // Don't fail the whole request if tracking fails
      }
      
      // COMPREHENSIVE OPTIMIZATION: Trigger after Quick Add
      try {
        const { HeuristicEngine } = await import('../lib/heuristic-engine');
        const engine = new HeuristicEngine(userId);
        console.log(`[QuickAdd] Triggering comprehensive optimization for user ${userId}`);
        
        // Run optimization in background (don't wait for it)
        engine.generateComprehensiveProposal({
          userId,
          energyLevel: 5, // Default energy for Quick Add
          type: 'quick_add',
          targetAssignmentId: assignment.id,
          lookaheadDays: 14
        }).then((result) => {
          console.log(`[QuickAdd] Comprehensive optimization complete: ${result.moves.length} moves proposed`);
        }).catch((error) => {
          console.error(`[QuickAdd] Comprehensive optimization failed:`, error);
        });
      } catch (optError) {
        console.error(`[QuickAdd] Failed to trigger optimization:`, optError);
        // Don't fail the request if optimization fails
      }
      
      return c.json({
        ok: true,
        assignment,
        due_date_event: dueDateEvent,
        focus_events: focusEvents,
        chunked: true,
        recovery_forced_warning: recoveryForcedWarning,
      });
    } else if (optimizedFocusBlock) {
      // Create focus block(s) based on user answers (today/time-of-day/sessions)
      const focusDraft = optimizedFocusBlock;
      const totalMinutes = Math.max(20, Math.round(
        draft.estimated_duration || focusDraft.duration_minutes || 60
      ));
      const prefs = deriveSchedulingPrefs(body.smart_answers, totalMinutes);
      const dueDateTime = draft.due_at
        ? DateTime.fromISO(draft.due_at, { zone: "utc" }).setZone(userTz)
        : DateTime.now().setZone(userTz).plus({ days: 7 });
      const preferredWindow = getPreferredWindow(prefs.timeOfDay);
      
      // Determine initial search time
      const nowInUserTz = DateTime.now().setZone(userTz);
      let searchStart = DateTime.fromISO(focusDraft.start_at, { zone: "utc" }).setZone(userTz);
      if (prefs.startDay === "today") {
        searchStart = nowInUserTz.set({ hour: preferredWindow.defaultHour, minute: 0, second: 0 });
      } else if (prefs.startDay === "tomorrow") {
        searchStart = nowInUserTz.plus({ days: 1 }).set({ hour: preferredWindow.defaultHour, minute: 0, second: 0 });
      }
      
      // Ensure at least 1 hour in the future
      const minStart = nowInUserTz.plus({ hours: 1 });
      if (searchStart < minStart) {
        searchStart = minStart.set({ minute: 0, second: 0 });
      }

      const durations = prefs.sessionDurations.length > 0 ? prefs.sessionDurations : [totalMinutes];
      const eventsToCreate = [];
      let lastStart = await findFirstAvailableSlot(
        userId,
        searchStart,
        durations[0],
        dueDateTime,
        userTz,
        preferredWindow
      );
      
      for (let i = 0; i < durations.length; i++) {
        const duration = durations[i];
        if (i > 0) {
          const nextSearch = lastStart.plus({ minutes: durations[i - 1] + 120 });
          lastStart = await findFirstAvailableSlot(
            userId,
            nextSearch,
            duration,
            dueDateTime,
            userTz,
            preferredWindow
          );
        }
        
        const startAt = new Date(lastStart.toUTC().toISO()!);
        const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
        const sessionLabel = durations.length > 1 ? ` (Session ${i + 1})` : "";
        
        eventsToCreate.push({
          userId,
          courseId: draft.course_id || null, // Include courseId
          title: `${focusDraft.title}${sessionLabel}`,
          description: draft.description || null,
          eventType: focusDraft.category as any,
          startAt,
          endAt,
          isMovable: true,
          linkedAssignmentId: assignment.id,
          metadata: {
            dueDate: assignment.dueDate?.toISOString(),
            sessionIndex: i,
            totalSessions: durations.length,
            splitReason: prefs.splitReason || "default",
            courseName: courseName // Add courseName to metadata
          }
        });
      }
      
      const createdFocusEvents = await db
        .insert(schema.calendarEventsNew)
        .values(eventsToCreate)
        .returning();
      focusEvents = createdFocusEvents;
      
      // ADHD TRANSITION TAX: Add 15-minute buffer after each Focus event
      for (const event of createdFocusEvents) {
        if (event.eventType !== 'Focus') continue; // Only buffer Focus events

        const bufferStart = new Date(event.endAt);
        const bufferEnd = new Date(bufferStart.getTime() + 15 * 60 * 1000);
        
        // DEDUPLICATION: Check if a buffer already exists for this exact time and user
        const existingBuffer = await db.query.calendarEventsNew.findFirst({
          where: and(
            eq(schema.calendarEventsNew.userId, userId),
            eq(schema.calendarEventsNew.startAt, bufferStart),
            eq(schema.calendarEventsNew.title, 'Transition Buffer')
          )
        });

        if (existingBuffer) {
          console.log(`[QuickAdd] Skipping duplicate buffer at ${bufferStart.toISOString()}`);
          continue;
        }

        const [bufferEvent] = await db
          .insert(schema.calendarEventsNew)
          .values({
            userId,
            courseId: draft.course_id || null, // Include courseId
            title: 'Transition Buffer',
            eventType: 'Chill',
            startAt: bufferStart,
            endAt: bufferEnd,
            isMovable: true,
            linkedAssignmentId: assignment.id,
            metadata: {
              transitionTax: true,
              linkedToEvent: event.id,
              purpose: 'Context switching recovery - prevents mental fatigue',
              courseName: courseName // Add courseName to metadata
            }
          })
          .returning();
        focusEvents.push(bufferEvent);
      }
      
      // PRIORITY 2: Automatic Deep Work Tracking (Recovery Forcing)
      try {
        const ADHDGuardian = await import('../lib/adhd-guardian');
        for (const event of createdFocusEvents) {
          const durationMinutes = Math.floor((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / (1000 * 60));
          await ADHDGuardian.default.trackDeepWork(userId, new Date(event.startAt), durationMinutes);
        }
      } catch (trackError) {
        console.error('[Recovery Forcing] Failed to track deep work:', trackError);
      }
      
      // COMPREHENSIVE OPTIMIZATION: Trigger after Quick Add
      try {
        const { HeuristicEngine } = await import('../lib/heuristic-engine');
        const engine = new HeuristicEngine(userId);
        console.log(`[QuickAdd] Triggering comprehensive optimization for user ${userId}`);
        
        // Run optimization in background (don't wait for it)
        engine.generateComprehensiveProposal({
          userId,
          energyLevel: 5, // Default energy for Quick Add
          type: 'quick_add',
          targetAssignmentId: assignment.id,
          lookaheadDays: 14
        }).then((result) => {
          console.log(`[QuickAdd] Comprehensive optimization complete: ${result.moves.length} moves proposed`);
        }).catch((error) => {
          console.error(`[QuickAdd] Comprehensive optimization failed:`, error);
        });
      } catch (optError) {
        console.error(`[QuickAdd] Failed to trigger optimization:`, optError);
        // Don't fail the request if optimization fails
      }
      
      return c.json({
        ok: true,
        assignment,
        due_date_event: dueDateEvent,
        focus_event: focusEvents[0] ?? null,
        focus_events: focusEvents,
        chunked: false,
        recovery_forced_warning: recoveryForcedWarning,
      });
    }

    // No focus blocks created
    return c.json({
      ok: true,
      assignment,
      due_date_event: dueDateEvent,
      focus_event: null,
      chunked: false,
    });
  } catch (e: any) {
    console.error("[QuickAdd Confirm Error]", e);
    return c.json({ error: e.message }, 400);
  }
});

// POST /api/quick-add/aliases (create/update)
quickAddRoute.post("/aliases", async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{ alias: string; courseId: string; confidence?: number }>();
    if (!body?.alias || !body?.courseId) return c.json({ error: "alias and courseId are required" }, 400);

    // Upsert via CI unique index (user_id, lower(alias))
    try {
      await db.insert(schema.userCourseAliases).values({
        userId,
        alias: body.alias,
        courseId: body.courseId,
        confidence: (body.confidence ?? 0.9).toFixed(3),
        usageCount: 1,
      } as any);
    } catch {
      await db.execute(sql`
        update user_course_aliases
        set course_id = ${body.courseId}::uuid,
            confidence = ${((body.confidence ?? 0.9).toFixed(3))}::numeric,
            usage_count = usage_count + 1,
            updated_at = now()
        where user_id = ${userId}::uuid and lower(alias) = lower(${body.alias});
      `);
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Helper: Calculate chunks for long-form assignments
interface Chunk {
  label: string;
  type: 'initial' | 'consistency' | 'acceleration' | 'final' | 'buffer';
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
}

interface ChunkOptions {
  difficulty?: 'low' | 'medium' | 'high';
  interest?: 'low' | 'medium' | 'high';
  category?: string;
}

async function buildSmartQuestions({
  userId,
  userTz,
  title,
  category,
  dueAt,
  estimatedDuration,
  upcomingEvents,
  pendingAssignments,
}: {
  userId: string;
  userTz: string;
  title: string;
  category?: string | null;
  dueAt: string | null;
  estimatedDuration?: number | null;
  upcomingEvents: Array<{ title: string; category: string; startAt: Date; endAt: Date }>;
  pendingAssignments: Array<{ title: string; category: string | null; dueAt: Date | null; estimatedDuration: number | null }>;
}): Promise<any[]> {
  const eventsText = upcomingEvents && upcomingEvents.length > 0
    ? upcomingEvents.map(e => {
        try {
          return `- ${e.category || 'Event'}: ${e.title || 'Untitled'} on ${DateTime.fromJSDate(e.startAt).setZone(userTz).toFormat('EEE MMM d, h:mm a')}`;
        } catch {
          return `- ${e.category || 'Event'}: ${e.title || 'Untitled'}`;
        }
      }).join('\n')
    : '- No upcoming events';

  const assignmentsText = pendingAssignments && pendingAssignments.length > 0
    ? pendingAssignments.map(a => {
        try {
          return `- ${a.title || 'Untitled'} (${a.category || 'Assignment'}) due ${a.dueAt ? DateTime.fromJSDate(a.dueAt).setZone(userTz).toFormat('EEE MMM d') : 'TBD'} - ${a.estimatedDuration || 60}min`;
        } catch {
          return `- ${a.title || 'Untitled'} (${a.category || 'Assignment'})`;
        }
      }).join('\n')
    : '- No pending assignments';

  const contextSummary = `
Upcoming Events (next 7 days):
${eventsText}

Pending Assignments (next 7 days):
${assignmentsText}

Current Assignment:
- Title: ${title}
- Category: ${category || 'Homework'}
- Due: ${dueAt ? DateTime.fromISO(dueAt).setZone(userTz).toFormat('EEE MMM d, h:mm a') : 'Not specified'}
- Estimated: ${estimatedDuration || 60} minutes
`;

  const { object: questions } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: z.object({
      questions: z.array(z.object({
        id: z.string(),
        text: z.string().describe("Question to ask user"),
        type: z.enum(["text", "number", "select", "boolean"]),
        options: z.array(z.string()).describe("2-4 suggested answer options (ALWAYS provide these, user can also choose 'Other')"),
        reasoning: z.string().describe("Why this question helps scheduling"),
      })),
    }),
    prompt: `You're a smart scheduling assistant for an ADHD student. Based on their context, generate 2-3 highly relevant questions that will help you schedule this assignment optimally.

${contextSummary}

IMPORTANT: For EVERY question, provide 2-4 suggested answer options. The UI will show these in a dropdown with "Other" as the last option.
If you ask about splitting work time, make options that match the estimated duration.
Example: if estimated duration is 90 minutes, options should sum to ~90 minutes (e.g., "One go (90 minutes)", "Two sessions (45 minutes each)", "Three sessions (30 minutes each)").

Generate questions that are:
1. SPECIFIC to their context (reference specific events/deadlines you see)
2. ACTIONABLE (answers directly improve scheduling)
3. BRIEF (one sentence max)
4. Include 2-4 helpful answer options for each

Examples of GOOD context-aware questions:

Q: "You have a Bio exam Tuesday - should we finish this before then?"
Options: ["Yes, before the exam", "No, after the exam", "During exam prep (multitask)"]

Q: "How difficult is this compared to your Math homework due Thursday?"
Options: ["Much easier", "About the same", "Harder", "Much harder"]

Q: "You're free Wednesday afternoon - is that a good time to work on this?"
Options: ["Yes, perfect", "No, prefer morning", "No, prefer evening"]

Q: "How many problems/pages/questions is this?"
Options: ["1-5", "6-10", "11-20", "20+"]

Q: "Do you want to tackle this in one go or split it up?"
Options: ["One go (90 minutes)", "Two sessions (45 minutes each)", "Three sessions (30 minutes each)"]

Examples of BAD questions:
- No options provided (always provide options!)
- Too vague: "How much work is this?"
- Defeats purpose: "When do you want to do this?"

Generate 2-3 questions with OPTIONS that USE THE CONTEXT you see above.`,
  });

  return questions.questions || [];
}

// Helper function to find the first available time slot (avoids conflicts)
type TimeOfDayPreference = 'early_morning' | 'morning' | 'afternoon' | 'evening' | null;

interface PreferredWindow {
  startHour: number;
  endHour: number;
  defaultHour: number;
}

function getPreferredWindow(timeOfDay: TimeOfDayPreference): PreferredWindow {
  if (timeOfDay === 'early_morning') return { startHour: 8, endHour: 10, defaultHour: 8 };
  if (timeOfDay === 'morning') return { startHour: 9, endHour: 12, defaultHour: 9 };
  if (timeOfDay === 'afternoon') return { startHour: 12, endHour: 17, defaultHour: 14 };
  if (timeOfDay === 'evening') return { startHour: 17, endHour: 20, defaultHour: 18 };
  return { startHour: 8, endHour: 22, defaultHour: 14 };
}

function deriveSchedulingPrefs(
  smartAnswers: Record<string, any> | undefined,
  totalMinutes: number
): {
  startDay: 'today' | 'tomorrow' | null;
  timeOfDay: TimeOfDayPreference;
  sessionDurations: number[];
  splitReason: string | null;
} {
  const answers = Object.values(smartAnswers || {})
    .filter(Boolean)
    .map((val) => String(val).toLowerCase());

  let startDay: 'today' | 'tomorrow' | null = null;
  if (answers.some((a) => a.includes('today'))) startDay = 'today';
  else if (answers.some((a) => a.includes('tomorrow'))) startDay = 'tomorrow';

  let timeOfDay: TimeOfDayPreference = null;
  if (answers.some((a) => a.includes('early morning'))) timeOfDay = 'early_morning';
  else if (answers.some((a) => a.includes('morning'))) timeOfDay = 'morning';
  else if (answers.some((a) => a.includes('afternoon'))) timeOfDay = 'afternoon';
  else if (answers.some((a) => a.includes('evening') || a.includes('night'))) timeOfDay = 'evening';

  const minChunk = 20;
  const safeTotal = Math.max(minChunk, Math.round(totalMinutes));
  let sessionDurations: number[] = [];
  let splitReason: string | null = null;

  if (answers.some((a) => a.includes('two blocks of 30') || a.includes('two 30'))) {
    if (safeTotal >= 60) {
      sessionDurations = [30, 30];
      splitReason = 'two_30';
    }
  } else if (answers.some((a) => a.includes('mix') || a.includes('both'))) {
    const first = Math.max(minChunk, Math.round(safeTotal * 0.65));
    const second = Math.max(minChunk, safeTotal - first);
    sessionDurations = [first, second];
    splitReason = 'mix';
  } else if (answers.some((a) => a.includes('short bursts'))) {
    const sessions = Math.min(3, Math.max(2, Math.round(safeTotal / 30)));
    const base = Math.max(minChunk, Math.floor(safeTotal / sessions));
    sessionDurations = Array.from({ length: sessions }, (_, i) =>
      i === sessions - 1 ? safeTotal - base * (sessions - 1) : base
    );
    splitReason = 'short_bursts';
  } else if (answers.some((a) => a.includes('two sessions'))) {
    const first = Math.max(minChunk, Math.round(safeTotal / 2));
    sessionDurations = [first, Math.max(minChunk, safeTotal - first)];
    splitReason = 'two_sessions';
  } else if (answers.some((a) => a.includes('one long') || a.includes('single'))) {
    sessionDurations = [safeTotal];
    splitReason = 'single';
  }

  return { startDay, timeOfDay, sessionDurations, splitReason };
}

async function getClassStartTimeForDate(
  userId: string,
  courseId: string,
  dueAtISO: string,
  userTz: string
): Promise<string | null> {
  const dueDate = DateTime.fromISO(dueAtISO, { zone: "utc" }).setZone(userTz);
  const dayOfWeek = dueDate.weekdayLong;
  if (!dayOfWeek) return null;

  try {
    const result: any = await db.execute(
      sql`SELECT start_time_local, day_of_week FROM calendar_event_templates 
          WHERE user_id = ${userId} 
          AND course_id = ${courseId} 
          AND event_type = 'Class'`
    );
    const rows = result.rows || [];
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
    };
    const targetDayNum = dayMap[dayOfWeek];
    const classEvent = rows.find((e: any) => e.day_of_week === targetDayNum) || null;
    return classEvent?.start_time_local || null;
  } catch (err: any) {
    console.error('[QuickAdd] Failed to fetch class time:', err.message);
    return null;
  }
}

async function findFirstAvailableSlot(
  userId: string,
  startSearchFrom: DateTime,
  durationMinutes: number,
  dueDate: DateTime,
  userTz: string,
  preferredWindow?: PreferredWindow
): Promise<DateTime> {
  // Fetch all existing events for the user
  const existingEvents = await db.query.calendarEventsNew.findMany({
    where: eq(schema.calendarEventsNew.userId, userId)
  });
  
  console.log(`[Scheduling] Finding slot for ${durationMinutes}min task`);
  console.log(`[Scheduling] Search range: ${startSearchFrom.toFormat('MMM dd h:mma')} to ${dueDate.toFormat('MMM dd h:mma')}`);
  console.log(`[Scheduling] Checking against ${existingEvents.length} existing events`);
  
  const window = preferredWindow || getPreferredWindow(null);
  
  let currentSlot = startSearchFrom.set({ minute: 0, second: 0 });
  if (currentSlot.hour < window.startHour) {
    currentSlot = currentSlot.set({ hour: window.startHour });
  }
  
  // Search for up to 14 days
  const maxSearchDate = currentSlot.plus({ days: 14 });
  
  while (currentSlot < dueDate && currentSlot < maxSearchDate) {
    // Move to next day if past preferred window
    if (currentSlot.hour >= window.endHour) {
      currentSlot = currentSlot.plus({ days: 1 }).set({ hour: window.startHour, minute: 0 });
      continue;
    }
    
    // Snap to preferred window if earlier than allowed
    if (currentSlot.hour < window.startHour) {
      currentSlot = currentSlot.set({ hour: window.startHour, minute: 0 });
      continue;
    }
    
    const slotEnd = currentSlot.plus({ minutes: durationMinutes + 15 }); // +15 for buffer
    
    // Check if this slot conflicts with any existing events
    let hasConflict = false;
    for (const event of existingEvents) {
      const eventStart = DateTime.fromJSDate(event.startAt, { zone: userTz });
      const eventEnd = DateTime.fromJSDate(event.endAt, { zone: userTz });
      
      // Skip office hours and other "optional" events - they can be overridden
      if (event.title?.includes('Office Hours') || event.eventType === 'OfficeHours') {
        continue;
      }
      
      // Check overlap: events overlap if slot starts before event ends AND slot ends after event starts
      if (currentSlot < eventEnd && slotEnd > eventStart) {
        hasConflict = true;
        console.log(`[Scheduling] ⚠️ Conflict with "${event.title}" at ${eventStart.toFormat('h:mma')}`);
        // Jump to after this conflicting event + 15min buffer
        currentSlot = eventEnd.plus({ minutes: 15 });
        break;
      }
    }
    
    if (!hasConflict) {
      // #region agent log
      const nearbyEvents = existingEvents.filter(e => {
        const eStart = DateTime.fromJSDate(e.startAt, { zone: userTz });
        const eEnd = DateTime.fromJSDate(e.endAt, { zone: userTz });
        return Math.abs(eStart.diff(currentSlot, 'hours').hours) < 3;
      }).map(e => ({title: e.title, start: DateTime.fromJSDate(e.startAt, { zone: userTz }).toISO(), eventType: e.eventType}));
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quickAdd.ts:findFirstAvailableSlot:foundSlot',message:'Found free slot',data:{foundSlot:currentSlot.toISO(),slotEnd:slotEnd.toISO(),nearbyEvents,totalEventsChecked:existingEvents.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B4'})}).catch(()=>{});
      // #endregion
      
      console.log(`[Scheduling] ✅ Found free slot: ${currentSlot.toFormat('EEE MMM dd h:mma')}`);
      return currentSlot;
    }
  }
  
  // If no slot found, return the original search time (fallback)
  console.log(`[Scheduling] ⚠️ No free slot found, using fallback time`);
  return startSearchFrom;
}

function calculateChunks(
  totalMinutes: number, 
  dueAtISO: string, 
  userTz: string,
  options: ChunkOptions = {}
): Chunk[] {
  // ADHD-FRIENDLY CHUNKING RULES:
  // 1. Micro-Chunking: Cap at 45m for high-difficulty OR low-interest tasks
  // 2. Time Blindness Overhead: Add 20% to chunks after first day (re-learning time)
  // 3. Transition Tax: 15m buffer after each chunk (applied in scheduling, not here)
  
  const MAX_CHUNK_MINUTES = 120; // 2-hour limit (standard tasks)
  const MICRO_CHUNK_MAX = 45; // Pomodoro-style for difficult/boring tasks
  const MIN_GAP_HOURS = 8; // Brain rest between sessions (from config)
  
  // Apply micro-chunking if needed
  const shouldMicroChunk = options.difficulty === 'high' || options.interest === 'low';
  const effectiveMaxChunk = shouldMicroChunk ? MICRO_CHUNK_MAX : MAX_CHUNK_MINUTES;
  
  if (shouldMicroChunk) {
    console.log(`[Chunking] Micro-chunking activated (difficulty: ${options.difficulty}, interest: ${options.interest}) - max ${MICRO_CHUNK_MAX}m chunks`);
  }
  
  const dueDate = DateTime.fromISO(dueAtISO, { zone: 'utc' }).setZone(userTz);
  const now = DateTime.now().setZone(userTz);
  
  // Calculate number of chunks needed (using micro-chunk limit if applicable)
  const numChunks = Math.ceil(totalMinutes / effectiveMaxChunk);
  const daysNeeded = Math.ceil(numChunks / 2); // Max 2 chunks per day (with 8hr gap)
  
  // Work backwards from due date WITH BUFFER
  // Add 1 day buffer so revision/final work happens BEFORE the due date
  const chunks: Chunk[] = [];
  let remainingMinutes = totalMinutes;
  let currentDay = dueDate.minus({ days: daysNeeded + 1 }); // +1 for buffer day
  let firstChunkDay: DateTime | null = null; // Track first day for time blindness overhead
  
  // Ensure we start in the future
  if (currentDay < now.plus({ hours: 1 })) {
    currentDay = now.plus({ hours: 2 }).set({ minute: 0 });
  }
  
  // Phase labels based on paper workflow
  const phases = ['Research/Outline', 'Drafting', 'Revision', 'Editing', 'Final Polish'];
  let phaseIdx = 0;
  
  while (remainingMinutes > 0 && chunks.length < 10) { // Safety limit
    // Base chunk duration (use micro-chunk limit if applicable)
    let chunkDuration = Math.min(remainingMinutes, effectiveMaxChunk);
    
    // TIME BLINDNESS OVERHEAD: Add 20% to chunks after the first day
    // This accounts for re-learning time when resuming work on a different day
    if (firstChunkDay && !currentDay.hasSame(firstChunkDay, 'day')) {
      const overhead = Math.ceil(chunkDuration * 0.20); // 20% overhead
      chunkDuration = Math.min(chunkDuration + overhead, effectiveMaxChunk); // Don't exceed max
      console.log(`[Chunking] Time blindness overhead: +${overhead}m (20%) for chunk on ${currentDay.toISODate()}`);
    }
    
    // Schedule at 2 PM by default (adjustable by AI later)
    let chunkStart = currentDay.set({ hour: 14, minute: 0 });
    
    // If we already have a chunk today, schedule 8+ hours later
    const todayChunks = chunks.filter(c => 
      DateTime.fromJSDate(c.startAt).hasSame(currentDay, 'day')
    );
    
    if (todayChunks.length > 0) {
      const lastChunk = todayChunks[todayChunks.length - 1];
      const lastEnd = DateTime.fromJSDate(lastChunk.endAt);
      chunkStart = lastEnd.plus({ hours: MIN_GAP_HOURS });
      
      // If that pushes us to next day, move to next day at 2 PM
      if (!chunkStart.hasSame(currentDay, 'day')) {
        currentDay = currentDay.plus({ days: 1 });
        chunkStart = currentDay.set({ hour: 14, minute: 0 });
      }
    }
    
    // Track first chunk day for time blindness overhead
    if (!firstChunkDay) {
      firstChunkDay = chunkStart;
    }
    
    const chunkEnd = chunkStart.plus({ minutes: chunkDuration });
    
    chunks.push({
      label: phases[Math.min(phaseIdx, phases.length - 1)],
      type: phaseIdx === 0 ? 'initial' : 
            phaseIdx === numChunks - 1 ? 'final' : 
            phaseIdx === numChunks - 2 ? 'buffer' : 'consistency',
      startAt: chunkStart.toJSDate(),
      endAt: chunkEnd.toJSDate(),
      durationMinutes: chunkDuration
    });
    
    remainingMinutes -= chunkDuration;
    phaseIdx++;
    
    // Move to next day if we've maxed out today
    if (todayChunks.length >= 1) {
      currentDay = currentDay.plus({ days: 1 });
    }
  }
  
  return chunks;
}


