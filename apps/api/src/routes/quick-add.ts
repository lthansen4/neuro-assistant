import { Hono } from 'hono';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '../lib/db';
import { users, courses, assignments } from '../../../../packages/db/src/schema';
import { eq, sql, like, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';

export const quickAddRoute = new Hono();

// Helper to get userId
async function getUserId(c: any): Promise<string | null> {
  const clerkUserId = c.req.header('x-clerk-user-id');
  if (!clerkUserId) {
    console.error('[Quick Add API] Missing x-clerk-user-id header');
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  });

  return user?.id || null;
}

// Schema for AI parse response
const QuickAddParseSchema = z.object({
  course_hint: z.string().describe('Course code or name extracted from input (e.g., "CS101", "Math", "Psychology")'),
  title: z.string().describe('Assignment title (normalized, stopwords removed, max 120 chars)'),
  category: z.enum(['Exam', 'Homework', 'Reading', 'Study Session']).describe('Category based on keywords: exam/test/quiz→Exam, hw/homework/assignment→Homework, reading→Reading, study/review/practice→Study Session'),
  due_date_hint: z.string().describe('Date/time hint extracted from input (e.g., "friday", "monday 9am", "next week tuesday")'),
  has_study_intent: z.boolean().describe('True if input suggests needing study time (e.g., "study for", "prepare for", "review")'),
  study_duration_minutes: z.number().optional().describe('Suggested study duration in minutes if study intent detected'),
});

/**
 * POST /api/quick-add/parse
 * 
 * Parse natural language input into structured assignment data
 * Example: "cs homework due monday" → { course: CS101, category: Homework, due: next Monday 5pm }
 */
quickAddRoute.post('/parse', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { text, user_tz } = body;

    if (!text || text.trim().length === 0) {
      return c.json({ error: 'text is required' }, 400);
    }

    if (text.length > 300) {
      return c.json({ error: 'text must be ≤ 300 characters' }, 400);
    }

    const timezone = user_tz || 'America/Chicago'; // Default to Central
    const now = DateTime.now().setZone(timezone);

    console.log(`[Quick Add Parse] User: ${userId}, Input: "${text}", TZ: ${timezone}`);

    // Use OpenAI to parse the natural language input
    const parseResult = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: QuickAddParseSchema,
      prompt: `You are parsing a student's quick-add assignment input.
      
Current date/time: ${now.toFormat('EEEE, MMMM d, yyyy h:mm a')} (${timezone})

Input: "${text}"

Extract:
1. Course hint (code or name)
2. Clean title (remove stopwords like "for", "due", course name)
3. Category (Exam, Homework, Reading, or Study Session)
4. Due date hint (preserve natural language like "friday", "monday 9am", "next week")
5. Whether they need study time ("study for midterm" = true)
6. Suggested study duration if applicable

Be lenient and extract what you can. If something is missing, make a best guess.`,
    });

    const parsed = parseResult.object;
    console.log(`[Quick Add Parse] AI extracted:`, parsed);

    // Step 2: Fuzzy match course
    const userCourses = await db.query.courses.findMany({
      where: eq(courses.userId, userId)
    });

    const courseSuggestions = fuzzyMatchCourse(parsed.course_hint, userCourses);
    const topCourse = courseSuggestions[0];
    const courseConfidence = topCourse ? topCourse.score : 0;

    console.log(`[Quick Add Parse] Course suggestions:`, courseSuggestions.map(c => `${c.code} (${c.score.toFixed(2)})`));

    // Step 3: Parse date/time
    const dateResult = parseNaturalDate(parsed.due_date_hint, timezone);
    console.log(`[Quick Add Parse] Parsed date: ${dateResult.date?.toISO()}, confidence: ${dateResult.confidence}`);

    // Step 4: Calculate priority
    const effortMinutes = parsed.category === 'Exam' ? 180 : parsed.category === 'Reading' ? 30 : 90;
    const priorityScore = calculatePriority(parsed.category, dateResult.date, effortMinutes);

    // Step 5: Check for duplicates
    const dedupeHash = computeDedupeHash(topCourse?.id || null, parsed.title, dateResult.date);
    const existingAssignment = await checkDuplicate(userId, dedupeHash, parsed.title, dateResult.date);

    // Step 6: Build response
    const parseId = randomUUID();
    const response = {
      parse_id: parseId,
      assignment_draft: {
        course_id: topCourse?.id || null,
        course_confidence: courseConfidence,
        course_suggestions: courseSuggestions.slice(0, 3),
        title: parsed.title,
        category: parsed.category,
        due_at: dateResult.date?.toISO() || null,
        due_tz: timezone,
        due_confidence: dateResult.confidence,
        effort_estimate_minutes: effortMinutes,
        priority_score: priorityScore,
        status: 'Scheduled', // Auto-schedule per ADHD-friendly design
      },
      focus_block_draft: parsed.has_study_intent ? {
        start_at: null, // Will be set by user or auto-scheduled
        duration_minutes: parsed.study_duration_minutes || 60,
        movable: true,
        confidence: 0.7,
      } : null,
      confidences: {
        course: courseConfidence,
        category: 0.9, // AI is usually good at this
        date: dateResult.confidence,
        timezone: 0.95,
      },
      required_actions: buildRequiredActions(courseConfidence, dateResult.confidence),
      dedupe: existingAssignment ? {
        exists: true,
        existing_id: existingAssignment.id,
        existing_title: existingAssignment.title,
        existing_due_at: existingAssignment.dueDate?.toISOString(),
        similarity: 0.9, // Simplified for now
      } : { exists: false },
    };

    console.log(`[Quick Add Parse] Response:`, JSON.stringify(response, null, 2));

    return c.json({
      ok: true,
      ...response,
    });

  } catch (error: any) {
    console.error('[Quick Add Parse] Error:', error);
    return c.json({ error: error.message || 'Failed to parse input' }, 500);
  }
});

/**
 * Fuzzy match course from hint
 */
function fuzzyMatchCourse(hint: string, userCourses: any[]): Array<{id: string, code: string, name: string, score: number}> {
  const hintLower = hint.toLowerCase().trim();
  
  const scored = userCourses.map(course => {
    const codeLower = (course.code || '').toLowerCase();
    const nameLower = (course.name || '').toLowerCase();
    
    let score = 0;
    
    // Exact match
    if (codeLower === hintLower || nameLower === hintLower) {
      score = 1.0;
    }
    // Starts with
    else if (codeLower.startsWith(hintLower) || nameLower.startsWith(hintLower)) {
      score = 0.8;
    }
    // Contains
    else if (codeLower.includes(hintLower) || nameLower.includes(hintLower)) {
      score = 0.6;
    }
    // Partial match (first word)
    else if (hintLower.split(' ')[0] && (codeLower.includes(hintLower.split(' ')[0]) || nameLower.includes(hintLower.split(' ')[0]))) {
      score = 0.4;
    }
    
    return { id: course.id, code: course.code, name: course.name, score };
  });
  
  return scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * Parse natural date/time expressions
 */
function parseNaturalDate(hint: string, timezone: string): { date: DateTime | null; confidence: number } {
  const hintLower = hint.toLowerCase().trim();
  const now = DateTime.now().setZone(timezone);
  
  // No hint provided
  if (!hintLower || hintLower === 'unknown' || hintLower === 'none') {
    return { date: null, confidence: 0 };
  }
  
  // Weekday names (monday, tuesday, etc.)
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (let i = 0; i < weekdays.length; i++) {
    if (hintLower.includes(weekdays[i])) {
      const targetDay = i + 1; // Luxon uses 1=Monday, 7=Sunday
      let targetDate = now.set({ weekday: targetDay });
      
      // If target day is today or past, move to next week
      if (targetDate <= now) {
        targetDate = targetDate.plus({ weeks: 1 });
      }
      
      // Check for time in hint (e.g., "monday 9am")
      const timeMatch = hintLower.match(/(\d{1,2})(am|pm)/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        if (timeMatch[2] === 'pm' && hour < 12) hour += 12;
        if (timeMatch[2] === 'am' && hour === 12) hour = 0;
        targetDate = targetDate.set({ hour, minute: 0, second: 0, millisecond: 0 });
        return { date: targetDate, confidence: 0.9 };
      }
      
      // Default to 5 PM
      targetDate = targetDate.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
      return { date: targetDate, confidence: 0.8 };
    }
  }
  
  // "next week"
  if (hintLower.includes('next week')) {
    const targetDate = now.plus({ weeks: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    return { date: targetDate, confidence: 0.6 };
  }
  
  // "tomorrow"
  if (hintLower.includes('tomorrow')) {
    const targetDate = now.plus({ days: 1 }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    return { date: targetDate, confidence: 0.9 };
  }
  
  // "today"
  if (hintLower.includes('today')) {
    const targetDate = now.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    return { date: targetDate, confidence: 0.9 };
  }
  
  // Fallback: low confidence
  return { date: null, confidence: 0.2 };
}

/**
 * Calculate priority score
 */
function calculatePriority(category: string, dueDate: DateTime | null, effortMinutes: number): number {
  if (!dueDate) return 0.5; // Medium priority if no date
  
  const now = DateTime.now();
  const daysToDue = dueDate.diff(now, 'days').days;
  
  // Category weight
  const categoryWeights: Record<string, number> = {
    'Exam': 1.0,
    'Homework': 0.6,
    'Reading': 0.4,
    'Study Session': 0.5,
  };
  const weight = categoryWeights[category] || 0.5;
  
  // Proximity factor
  const proximityFactor = 1 / (daysToDue + 1);
  
  // Effort factor
  const effortFactor = Math.min(1, effortMinutes / 240);
  
  // Priority formula
  const priority = weight * proximityFactor + 0.2 * effortFactor;
  
  return Math.max(0, Math.min(1, priority));
}

/**
 * Compute dedupe hash
 */
function computeDedupeHash(courseId: string | null, title: string, dueDate: DateTime | null): string {
  const crypto = require('crypto');
  const normalized = `${courseId || 'none'}|${title.toLowerCase().trim()}|${dueDate?.toFormat('yyyy-MM-dd') || 'none'}`;
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

/**
 * Check for duplicate assignments
 */
async function checkDuplicate(userId: string, dedupeHash: string, title: string, dueDate: DateTime | null) {
  // Simple check: look for similar title and due date
  if (!dueDate) return null;
  
  const dueDateStart = dueDate.startOf('day').toJSDate();
  const dueDateEnd = dueDate.endOf('day').toJSDate();
  
  const existing = await db.query.assignments.findFirst({
    where: sql`${assignments.userId} = ${userId} 
      AND ${assignments.title} ILIKE ${'%' + title + '%'} 
      AND ${assignments.dueDate} >= ${dueDateStart} 
      AND ${assignments.dueDate} <= ${dueDateEnd}`,
  });
  
  return existing || null;
}

/**
 * Build required actions list
 */
function buildRequiredActions(courseConfidence: number, dateConfidence: number): string[] {
  const actions: string[] = [];
  
  if (courseConfidence < 0.6) {
    actions.push('select_course');
  }
  if (dateConfidence < 0.6) {
    actions.push('confirm_date');
  }
  
  return actions;
}

/**
 * POST /api/quick-add/confirm
 * 
 * Create assignment (and optional Focus block) from parsed data
 */
quickAddRoute.post('/confirm', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { parse_id, assignment, focus_block } = body;

    if (!assignment || !assignment.title) {
      return c.json({ error: 'assignment.title is required' }, 400);
    }

    console.log(`[Quick Add Confirm] User: ${userId}, ParseID: ${parse_id}`);
    console.log(`[Quick Add Confirm] Assignment:`, assignment);
    console.log(`[Quick Add Confirm] Focus block:`, focus_block);

    // Create assignment
    const [createdAssignment] = await db.insert(assignments).values({
      userId,
      courseId: assignment.course_id || null,
      title: assignment.title,
      category: assignment.category || 'Homework',
      dueDate: assignment.due_at ? new Date(assignment.due_at) : null,
      effortEstimateMinutes: assignment.effort_estimate_minutes || 90,
      priorityScore: Math.round((assignment.priority_score || 0.5) * 100),
      status: 'Scheduled', // Auto-schedule (ADHD-friendly)
    }).returning();

    console.log(`[Quick Add Confirm] Created assignment: ${createdAssignment.id}`);

    // Create Focus block if requested
    let createdFocusBlock = null;
    if (focus_block && focus_block.start_at && createdAssignment.dueDate) {
      const { calendarEventsNew } = await import('../../../../packages/db/src/schema');
      
      const startAt = new Date(focus_block.start_at);
      const endAt = new Date(startAt.getTime() + focus_block.duration_minutes * 60 * 1000);
      
      [createdFocusBlock] = await db.insert(calendarEventsNew).values({
        userId,
        title: `Study: ${assignment.title}`,
        eventType: 'Focus',
        startAt,
        endAt,
        isMovable: true,
        metadata: {
          assignmentId: createdAssignment.id,
          autoGenerated: true,
          quickAdd: true,
        },
      }).returning();
      
      console.log(`[Quick Add Confirm] Created Focus block: ${createdFocusBlock.id}`);
    }

    return c.json({
      ok: true,
      assignment: {
        id: createdAssignment.id,
        title: createdAssignment.title,
        due_at: createdAssignment.dueDate?.toISOString(),
        status: createdAssignment.status,
      },
      focus_block: createdFocusBlock ? {
        id: createdFocusBlock.id,
        start_at: createdFocusBlock.startAt.toISOString(),
        end_at: createdFocusBlock.endAt.toISOString(),
      } : null,
    });

  } catch (error: any) {
    console.error('[Quick Add Confirm] Error:', error);
    return c.json({ error: error.message || 'Failed to create assignment' }, 500);
  }
});


