import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { db, schema } from '../lib/db';
import { eq, and, asc, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { SyllabusParser } from '../lib/syllabus-parser';
import { SyllabusCommitService } from '../lib/syllabus-commit-service';

const require = createRequire(import.meta.url);
// pdf-parse v1.1.1 is CommonJS - use require for ES module compatibility
const pdfParse = require('pdf-parse');

export const uploadRoute = new Hono();

// Helper to get userId from header or query (same pattern as dashboard/quickAdd)
async function getUserId(c: any): Promise<string> {
  const uid = c.req.header("x-user-id") || c.req.header("x-clerk-user-id") || c.req.query("userId") || c.req.query("clerkUserId");
  if (!uid) throw new Error("Missing userId (header x-user-id or x-clerk-user-id, or query ?userId=...)");
  
  // If it looks like a Clerk user ID (starts with user_ or is not a UUID format), look up the database user
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  if (!isUUID || uid.startsWith("user_")) {
    const [dbUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.clerkUserId, uid))
      .limit(1);
    if (!dbUser) {
      throw new Error(`No database user found for Clerk ID: ${uid}. Make sure the user exists in the database.`);
    }
    return dbUser.id;
  }
  
  return uid;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL and service role key are required');
  }
  return createClient(url, key);
}

uploadRoute.post('/syllabus', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const form = await c.req.parseBody();
    const file = form['file'] as File | undefined;
    if (!file) return c.json({ error: 'No file' }, 400);
    const path = `syllabi/${crypto.randomUUID()}-${(file as any).name ?? 'syllabus.pdf'}`;
    const { error } = await supabase.storage.from('syllabi').upload(path, await file.arrayBuffer(), {
      contentType: (file as any).type || 'application/pdf',
      upsert: false
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ bucket: 'syllabi', path });
  } catch (err: any) {
    return c.json({ error: err.message || 'Upload failed' }, 500);
  }
});

// Extract text from PDF
uploadRoute.post('/extract-pdf', async (c) => {
  try {
    const arrayBuffer = await c.req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);
    return c.json({ text: data.text || '' });
  } catch (err: any) {
    return c.json({ error: err.message || 'PDF extraction failed', text: '' }, 500);
  }
});

// POST /api/upload/parse
// Parses a syllabus PDF using SyllabusParser service
// body: { fileId: string, timezone?: string }
uploadRoute.post('/parse', async (c) => {
  console.log('[Parse API] Received parse request');
  
  try {
    // Check environment variables early
    const envCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasDatabase: !!process.env.DATABASE_URL,
    };
    console.log('[Parse API] Environment check:', envCheck);
    
    if (!envCheck.hasSupabaseUrl || !envCheck.hasSupabaseKey) {
      return c.json({ error: 'Server misconfigured: Missing Supabase credentials', ok: false }, 500);
    }
    if (!envCheck.hasOpenAI) {
      return c.json({ error: 'Server misconfigured: Missing OPENAI_API_KEY', ok: false }, 500);
    }
    if (!envCheck.hasDatabase) {
      return c.json({ error: 'Server misconfigured: Missing DATABASE_URL', ok: false }, 500);
    }
    
    console.log('[Parse API] Getting user ID...');
    const userId = await getUserId(c);
    console.log('[Parse API] User ID:', userId);
    
    const body = await c.req.json<{
      fileId: string;
      timezone?: string;
    }>();
    console.log('[Parse API] Request body:', body);

    if (!body?.fileId) {
      return c.json({ error: 'fileId is required' }, 400);
    }

    console.log('[Parse API] Creating SyllabusParser...');
    const parser = new SyllabusParser();
    
    console.log('[Parse API] Starting parse...');
    const result = await parser.parseSyllabus(
      body.fileId,
      userId,
      body.timezone || 'UTC'
    );
    console.log('[Parse API] Parse complete:', result);

    return c.json({
      ok: true,
      runId: result.runId,
      itemsCount: result.itemsCount
    });
  } catch (err: any) {
    console.error('[Parse API] Error:', err.message);
    console.error('[Parse API] Stack:', err.stack);
    return c.json({ 
      error: err.message || 'Failed to parse syllabus',
      ok: false 
    }, 500);
  }
});

// GET /api/upload/review/:parseRunId
// Get staged items for a parse run
uploadRoute.get('/review/:parseRunId', async (c) => {
  try {
    const userId = await getUserId(c);
    const parseRunId = c.req.param('parseRunId');
    
    // Verify parse run belongs to user
    const [run] = await db
      .select({
        id: schema.syllabusParseRuns.id,
        status: schema.syllabusParseRuns.status,
        confidence: schema.syllabusParseRuns.confidence,
        error: schema.syllabusParseRuns.error,
        createdAt: schema.syllabusParseRuns.createdAt,
        completedAt: schema.syllabusParseRuns.completedAt,
        syllabusFileId: schema.syllabusParseRuns.syllabusFileId,
        fileId: schema.syllabusFiles.id,
        fileUserId: schema.syllabusFiles.userId,
        originalFilename: schema.syllabusFiles.originalFilename,
      })
      .from(schema.syllabusParseRuns)
      .innerJoin(schema.syllabusFiles, eq(schema.syllabusParseRuns.syllabusFileId, schema.syllabusFiles.id))
      .where(and(
        eq(schema.syllabusParseRuns.id, parseRunId),
        eq(schema.syllabusFiles.userId, userId)
      ))
      .limit(1);
    
    if (!run) {
      return c.json({ error: "Parse run not found or unauthorized" }, 404);
    }
    
    // Get all staged items for this parse run
    const items = await db
      .select()
      .from(schema.syllabusStagingItems)
      .where(eq(schema.syllabusStagingItems.parseRunId, parseRunId))
      .orderBy(asc(schema.syllabusStagingItems.type), asc(schema.syllabusStagingItems.createdAt));
    
    // Group by type
    const grouped = {
      course: items.filter((i) => i.type === "course"),
      assignments: items.filter((i) => i.type === "assignment"),
      office_hours: items.filter((i) => i.type === "office_hours"),
      class_schedule: items.filter((i) => i.type === "class_schedule"),
      grade_weights: items.filter((i) => i.type === "grade_weights"),
    };
    
    return c.json({
      success: true,
      parseRun: {
        id: run.id,
        status: run.status,
        confidence: run.confidence,
        error: run.error,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        file: {
          id: run.fileId,
          originalFilename: run.originalFilename,
        },
      },
      items: grouped,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to fetch staged items" }, 500);
  }
});

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
function buildOccurrencesFor2Weeks(opts: {
  tz: string;
  items: { day: string; start: string; end: string; location?: string | null }[];
  title: (it: any) => string;
  type: 'Class' | 'OfficeHours';
}) {
  const { tz, items, title, type } = opts;
  const nowZ = DateTime.now().setZone(tz).startOf('day');
  const endZ = nowZ.plus({ days: 14 });
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
    for (let d = nowZ; d < endZ; d = d.plus({ days: 1 })) {
      if (d.weekday !== isoDow) continue;
      const [sh, sm] = (it.start || '09:00').split(':').map(Number);
      const [eh, em] = (it.end || '10:00').split(':').map(Number);

      const startZ = d.set({ hour: sh || 0, minute: sm || 0 });
      const endZt = d.set({ hour: eh || 0, minute: em || 0 });

      // Luxon handles DST in the zone; convert to UTC JS Date
      const startIso = startZ.toUTC().toISO();
      const endIso = endZt.toUTC().toISO();
      if (!startIso || !endIso) {
        console.warn('[Upload] Skipping event with invalid date');
        continue;
      }
      const startUtc = new Date(startIso);
      const endUtc = new Date(endIso);

      out.push({
        title: title(it),
        type,
        startTime: startUtc,
        endTime: endUtc,
        location: it.location ?? null,
      });
    }
  }
  return out;
}

// POST /api/upload/commit
// Commits staged syllabus items using SyllabusCommitService
// body:
// {
//   parseRunId: string,
//   timezone?: string,
//   course: { name: string; professor?: string|null; credits?: number|null; grade_weights?: Record<string, number>|null },
//   schedule?: [{ day: string; start: string; end: string; location?: string|null }],
//   office_hours?: [{ day: string; start: string; end: string; location?: string|null }],
//   assignments?: [{ title: string; due_date?: string|null; category?: string|null; effort_estimate_minutes?: number|null }]
// }
uploadRoute.post('/commit', async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{
      parseRunId: string;
      timezone?: string;
      course: { name: string; professor?: string | null; credits?: number | null; grade_weights?: Record<string, number> | null };
      schedule?: { day: string; start: string; end: string; location?: string | null }[];
      office_hours?: { day: string; start: string; end: string; location?: string | null }[];
      assignments?: { title: string; due_date?: string | null; category?: string | null; effort_estimate_minutes?: number | null; total_pages?: number | null }[];
    }>();

    console.log('[Commit API] Received commit request:', {
      parseRunId: body?.parseRunId,
      scheduleCount: body?.schedule?.length || 0,
      officeHoursCount: body?.office_hours?.length || 0,
      assignmentsCount: body?.assignments?.length || 0,
      timezone: body?.timezone,
      scheduleSample: body?.schedule?.[0],
      officeHoursSample: body?.office_hours?.[0],
    });

    if (!body?.parseRunId) return c.json({ error: 'parseRunId is required' }, 400);
    if (!body?.course?.name) return c.json({ error: 'course.name is required' }, 400);

    // Use SyllabusCommitService to handle the commit
    const service = new SyllabusCommitService();
    
    try {
      const result = await service.commitStagingItems(
        body.parseRunId,
        userId,
        {
          course: body.course,
          schedule: body.schedule,
          office_hours: body.office_hours,
          assignments: body.assignments,
        },
        body.timezone || 'UTC'
      );

      return c.json({ ok: true, summary: result });
    } catch (error: any) {
      // Handle idempotency case (already committed)
      if (error.message && error.message.includes('already been committed')) {
        const existingCommit = await db.query.syllabusCommits.findFirst({
          where: eq(schema.syllabusCommits.parseRunId, body.parseRunId),
        });
        if (existingCommit) {
          return c.json({ ok: true, alreadyCommitted: true, summary: existingCommit.summary || null });
        }
      }
      throw error;
    }
  } catch (e: any) {
    return c.json({ error: e.message || 'Commit failed' }, 400);
  }
});

// POST /api/upload/rollback
uploadRoute.post("/rollback", async (c) => {
  try {
    const userId = await getUserId(c);
    const { parseRunId } = (await c.req.json()) as { parseRunId?: string };
    if (!parseRunId) return c.json({ error: "parseRunId is required" }, 400);

    const result = await db.transaction(async (tx) => {
      let assignmentsDeleted = 0;
      let eventsDeleted = 0;

      // Attempt "artifacts" path first (precise rollback)
      let artifactsSupported = true;
      try {
        // Delete events via artifacts table if present
        const delEvents = await tx.execute(sql`
          with to_delete as (
            select event_id from syllabus_commit_artifacts
            where parse_run_id = ${parseRunId}::uuid and event_id is not null
          )
          delete from calendar_events ce
          using to_delete td
          where ce.id = td.event_id and ce.user_id = ${userId}::uuid
          returning ce.id;
        `);
        eventsDeleted = Array.isArray(delEvents.rows) ? delEvents.rows.length : 0;

        // Delete assignments via artifacts table if present
        const delAssignments = await tx.execute(sql`
          with to_delete as (
            select assignment_id from syllabus_commit_artifacts
            where parse_run_id = ${parseRunId}::uuid and assignment_id is not null
          )
          delete from assignments a
          using to_delete td
          where a.id = td.assignment_id and a.user_id = ${userId}::uuid
          returning a.id;
        `);
        assignmentsDeleted = Array.isArray(delAssignments.rows) ? delAssignments.rows.length : 0;

        // Clean up artifacts rows
        await tx.execute(sql`delete from syllabus_commit_artifacts where parse_run_id = ${parseRunId}::uuid;`);
      } catch {
        artifactsSupported = false;
      }

      // Fallback: if artifacts table doesn't exist, delete events by metadata.parseRunId
      if (!artifactsSupported) {
        const delEv = await tx.execute(sql`
          delete from calendar_events
          where user_id = ${userId}::uuid
            and metadata->>'source' = 'syllabus_commit'
            and metadata->>'parseRunId' = ${parseRunId}
          returning id;
        `);
        eventsDeleted = Array.isArray(delEv.rows) ? delEv.rows.length : 0;
        // Assignments removal skipped (no reliable link)
      }

      return { assignmentsDeleted, eventsDeleted, artifactsSupported };
    });

    return c.json({
      ok: true,
      deleted: { assignments: result.assignmentsDeleted, events: result.eventsDeleted },
      mode: result.artifactsSupported ? "artifacts" : "metadata-only",
    });
  } catch (e: any) {
    return c.json({ error: e.message || "Rollback failed" }, 400);
  }
});
