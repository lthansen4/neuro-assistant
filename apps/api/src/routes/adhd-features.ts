/**
 * API endpoints for Priority 2 ADHD features
 */

import { Hono } from 'hono';
import ADHDGuardian from '../lib/adhd-guardian';
import { db } from '../lib/db';
import * as schema from '../../../../packages/db/src/schema';
import { eq, and } from 'drizzle-orm';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const app = new Hono();

// Helper: get userId from header or query
async function getUserId(c: any): Promise<string> {
  const uid = c.req.header("x-user-id") || c.req.header("x-clerk-user-id") || c.req.query("userId") || c.req.query("clerkUserId");
  if (!uid) throw new Error("Missing userId (header x-user-id or x-clerk-user-id, or query ?userId=...)");
  
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  if (!isUUID || uid.startsWith("user_")) {
    const dbUser = await db.query.users.findFirst({
      where: eq(schema.users.clerkUserId, uid)
    });
    if (!dbUser) throw new Error(`User with Clerk ID ${uid} not found in database`);
    return dbUser.id;
  }
  return uid;
}

// ============================================================================
// WALL OF AWFUL ENDPOINTS
// ============================================================================

/**
 * GET /adhd/stuck-assignments
 * Get all stuck assignments for current user
 */
app.get('/stuck-assignments', async (c) => {
  try {
    const userId = await getUserId(c);
    const stuckAssignments = await ADHDGuardian.getStuckAssignments(userId);
  
    return c.json({
      stuck: stuckAssignments.map(a => ({
        id: a.id,
        title: a.title,
        course: a.course?.name,
        deferralCount: a.deferralCount,
        lastDeferredAt: a.lastDeferredAt,
        interventionShown: a.stuckInterventionShown
      }))
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/track-deferral
 * Track a deferral (user postpones an assignment)
 */
app.post('/track-deferral', async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json();
    const { assignmentId, deferredFrom, deferredTo, reason } = body;
    
    if (!assignmentId || !deferredFrom) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const result = await ADHDGuardian.trackDeferral(
      userId,
      assignmentId,
      new Date(deferredFrom),
      deferredTo ? new Date(deferredTo) : null,
      reason
    );
    
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/intervention-shown/:id
 * Mark intervention prompt as shown
 */
app.post('/intervention-shown/:id', async (c) => {
  try {
    await getUserId(c); // Verify authentication
    const assignmentId = c.req.param('id');
    await ADHDGuardian.markInterventionShown(assignmentId);
    
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /adhd/breakdown-questions/:id
 * Generate smart AI questions to help break down a stuck assignment
 */
app.get('/breakdown-questions/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    const assignmentId = c.req.param('id');
    
    // Get assignment details
    const [assignment] = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, assignmentId))
      .limit(1);
    
    if (!assignment || assignment.userId !== userId) {
      return c.json({ error: 'Assignment not found' }, 404);
    }
    
    console.log('[ADHD] Generating breakdown questions for:', assignment.title, assignment.category);
    
    // Use AI to generate context-specific questions
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        questions: z.array(z.object({
          id: z.string(),
          text: z.string().describe('Question to ask the student'),
          reasoning: z.string().describe('Why this question helps break down the task')
        }))
      }),
      prompt: `You're helping an ADHD student break down a task that feels overwhelming. Generate 2-4 specific questions to understand the task better so you can create a helpful step-by-step checklist.

Assignment: ${assignment.title}
Category: ${assignment.category || 'Unknown'}
Due Date: ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'Not specified'}

IMPORTANT RULES:
1. Ask specific, concrete questions - NOT vague ones like "How much work is this?"
2. For homework/problem sets: Ask HOW MANY problems/questions (this is critical!)
3. For essays/papers: Ask about length, structure, and what they need to write
4. For reading: Ask how many pages and if they need to take notes
5. Keep questions friendly and teenager-appropriate - use casual language
6. Questions should be open-ended so students can give exact answers without being forced into categories

Example GOOD questions for "Math homework":
- "How many problems do you need to do?"
- "What topic/chapter is this covering? (e.g., 'Chapter 7 - Quadratic Equations')"
- "Do you have notes or examples you can reference, or will you need to look things up?"

Example GOOD questions for "Essay":
- "How many pages or words does it need to be?"
- "What's the topic or prompt for this essay?"
- "Do you already have a thesis/main idea, or do you need to brainstorm that first?"

Example BAD questions:
- "How difficult is this?" (too vague)
- "When do you want to work on this?" (defeats the purpose)
- "Do you want to break this down?" (we already know they do!)

Generate questions that will help you create a realistic, specific checklist.`
    });
    
    console.log('[ADHD] Generated questions:', object.questions);
    
    return c.json({
      ok: true,
      questions: object.questions
    });
  } catch (error: any) {
    console.error('[ADHD] Failed to generate questions:', error);
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/reset-stuck/:id
 * Reset stuck flag and create a checklist for the assignment
 */
app.post('/reset-stuck/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    const assignmentId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    
    // Get assignment to determine checklist items
    const [assignment] = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, assignmentId))
      .limit(1);
    
    if (!assignment || assignment.userId !== userId) {
      return c.json({ error: 'Assignment not found' }, 404);
    }
    
    // Generate checklist items
    let items: any[] = [];
    
    // If AI generation requested with answers, use AI to create personalized checklist
    if (body.generateWithAI && body.answers) {
      console.log('[ADHD] Generating AI checklist with answers:', body.answers);
      
      try {
        const answersText = Object.entries(body.answers)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n');
        
        const { object } = await generateObject({
          model: openai('gpt-4o-mini'),
          schema: z.object({
            items: z.array(z.object({
              label: z.string().describe('Step description'),
              duration_minutes: z.number().describe('Estimated minutes for this step (5-20 min)')
            }))
          }),
          prompt: `You are an expert executive functioning coach helping an ADHD student break down their homework into manageable steps.

📋 Assignment: ${assignment.title}
📂 Category: ${assignment.category || 'Unknown'}
📅 Due: ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'Not specified'}

🎯 What the student told you:
${answersText}

🧠 SIMPLE CHUNKING RULES (follow these exactly):

**For Math/Problem Sets:**
- 1-5 problems → List each individually: "Do problem 1", "Do problem 2", etc.
- 6+ problems → Break into THIRDS (3 equal chunks)
  Example: 35 problems = "Do problems 1-12" (1st third), "Do problems 13-23" (2nd third), "Do problems 24-35" (final third)
  Example: 18 problems = "Do problems 1-6" (1st third), "Do problems 7-12" (2nd third), "Do problems 13-18" (final third)

**For Essays/Papers:**
- Break into: Outline → Draft intro → Draft body → Draft conclusion → Revise → Proofread

**For Reading:**
- Break into page/chapter chunks (e.g., "Read pages 1-20", "Read pages 21-40")

🎯 CHECKLIST STRUCTURE:
1. **Setup step**: "Gather [specific materials]"
2. **Work chunks**: Use the thirds rule above
3. **5-min break** after EACH work chunk
4. **Final step**: "Review your work and celebrate! 🎉"

⚠️ CRITICAL RULES:
- DO NOT insert literal answers into labels: ❌ "Do problem 1 (35)" 
- DO mention the topic naturally: ✅ "Complete problems 1-12 on quadratic equations"
- If they need to show work, add: "(show your work)" to work steps
- Keep it simple and predictable - no fancy grouping logic!

🎯 Create 6-12 total items. If 35 problems, your checklist should be roughly:
1. Gather materials
2. Complete problems 1-12 on [topic] (show work if needed)
3. Take a 5-minute break
4. Complete problems 13-23 on [topic] (show work if needed)  
5. Take a 5-minute break
6. Complete problems 24-35 on [topic] (show work if needed)
7. Review all work and celebrate!`
        });
        
        // Add 'completed' field to each item (AI doesn't generate this)
        items = object.items.map((item: any) => ({ ...item, completed: false }));
        console.log('[ADHD] AI generated', items.length, 'checklist items');
      } catch (aiError: any) {
        console.error('[ADHD] AI generation failed, falling back to defaults:', aiError);
        // Fall through to default generation below
      }
    }
    
    // Fallback: Generate default checklist items based on category if AI didn't work
    if (items.length === 0) {
      const category = assignment.category || 'Homework';
      
      if (category === 'Essay' || category === 'Paper') {
        items = [
          { label: 'Open document and review prompt', duration_minutes: 5, completed: false },
          { label: 'Write thesis statement', duration_minutes: 10, completed: false },
          { label: 'Write opening paragraph', duration_minutes: 15, completed: false },
          { label: 'Take a break', duration_minutes: 5, completed: false },
          { label: 'Write next section', duration_minutes: 20, completed: false },
        ];
      } else if (category === 'Problem Set' || category === 'Homework') {
        items = [
          { label: 'Gather materials and notes', duration_minutes: 3, completed: false },
          { label: 'Do problem #1', duration_minutes: 10, completed: false },
          { label: 'Do problem #2', duration_minutes: 10, completed: false },
          { label: 'Quick break', duration_minutes: 5, completed: false },
          { label: 'Continue remaining problems', duration_minutes: 20, completed: false },
        ];
      } else if (category === 'Reading') {
        items = [
          { label: 'Skim the material to get overview', duration_minutes: 5, completed: false },
          { label: 'Read and highlight key points', duration_minutes: 20, completed: false },
          { label: 'Take notes on main ideas', duration_minutes: 10, completed: false },
          { label: 'Review and summarize', duration_minutes: 10, completed: false },
        ];
      } else {
        // Default generic checklist
        items = [
          { label: 'Gather materials', duration_minutes: 5, completed: false },
          { label: 'Start first part', duration_minutes: 15, completed: false },
          { label: 'Take a break', duration_minutes: 5, completed: false },
          { label: 'Continue working', duration_minutes: 20, completed: false },
          { label: 'Final review', duration_minutes: 10, completed: false },
        ];
      }
      
      // Allow manual override with custom items
      if (body.items && Array.isArray(body.items)) {
        items = body.items;
      }
    }
    
    // Find linked calendar event by searching for event with this assignmentId in metadata
    let linkedEventId = body.eventId || null;
    
    if (!linkedEventId) {
      // Search for event linked to this assignment
      const events = await db.query.calendarEventsNew.findMany({
        where: eq(schema.calendarEventsNew.userId, userId)
      });
      
      // First try to find by linkedAssignmentId in metadata
      let linkedEvent = events.find(evt => {
        const metadata = evt.metadata as any;
        return metadata?.linkedAssignmentId === assignmentId;
      });
      
      // Fallback: Search by title matching "Work on: [assignment title]"
      if (!linkedEvent) {
        console.log(`[ADHD] No linkedAssignmentId found, searching by title for assignment: "${assignment.title}"`);
        linkedEvent = events.find(evt => {
          const expectedTitle = `Work on: ${assignment.title}`;
          return evt.title === expectedTitle || evt.title.startsWith(`Work on: ${assignment.title}`);
        });
        
        if (linkedEvent) {
          console.log(`[ADHD] Found event by title match: "${linkedEvent.title}"`);
        }
      }
      
      if (linkedEvent) {
        linkedEventId = linkedEvent.id;
        console.log(`[ADHD] Linked event ${linkedEventId} to assignment ${assignmentId}`);
      } else {
        console.log(`[ADHD] ⚠️ No linked event found for assignment "${assignment.title}"`);
      }
    }
    
    // Delete any existing checklist for this assignment (so we can create a fresh one)
    await db.delete(schema.assignmentChecklists).where(eq(schema.assignmentChecklists.assignmentId, assignmentId));
    
    // Create new checklist with AI-generated items
    const [checklist] = await db.insert(schema.assignmentChecklists).values({
      assignmentId,
      eventId: linkedEventId,
      items: items as any,
    }).returning();
    
    // Update linked calendar event's duration to match checklist total time
    if (linkedEventId) {
      const totalMinutes = items.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
      
      const event = await db.query.calendarEventsNew.findFirst({
        where: eq(schema.calendarEventsNew.id, linkedEventId)
      });
      
      if (event) {
        const oldEndAt = event.endAt;
        const newEndAt = new Date(event.startAt.getTime() + totalMinutes * 60 * 1000);
        
        await db.update(schema.calendarEventsNew)
          .set({ endAt: newEndAt })
          .where(eq(schema.calendarEventsNew.id, linkedEventId));
        
        console.log(`[ADHD] Updated event ${linkedEventId} duration to ${totalMinutes} minutes (was ${oldEndAt.toISOString()}, now ${newEndAt.toISOString()})`);
        
        // ALWAYS check for conflicts when a checklist is created (even if duration didn't change)
        // because there might be overlapping events from previous tests/scheduling
        console.log(`[ADHD] Checking for conflicts with updated event...`);
          
          // Find all events that now overlap with the extended time
          const allUserEvents = await db.query.calendarEventsNew.findMany({
            where: eq(schema.calendarEventsNew.userId, userId)
          });
          
          console.log(`[ADHD] Found ${allUserEvents.length} total events for user`);
          
          const conflictingEvents = allUserEvents.filter(evt => {
            if (evt.id === linkedEventId) return false; // Skip the event we just updated
            
            // Check if this event overlaps with our extended time window
            const evtStart = evt.startAt.getTime();
            const evtEnd = evt.endAt.getTime();
            const ourStart = event.startAt.getTime();
            const ourEnd = newEndAt.getTime();
            
            const overlaps = evtStart < ourEnd && evtEnd > ourStart;
            
            if (overlaps) {
              console.log(`[ADHD] ⚠️ CONFLICT: "${evt.title}" (${evt.startAt.toISOString()} - ${evt.endAt.toISOString()}) overlaps with extended event`);
            }
            
            return overlaps;
          });
          
          if (conflictingEvents.length > 0) {
            console.log(`[ADHD] Found ${conflictingEvents.length} conflicting event(s), rescheduling...`);
            
            for (const conflictingEvent of conflictingEvents) {
              // Find next available slot after the extended event ends
              const duration = conflictingEvent.endAt.getTime() - conflictingEvent.startAt.getTime();
              const durationMinutes = duration / (60 * 1000);
              
              console.log(`[ADHD] 📐 Calculating new slot for "${conflictingEvent.title}":`);
              console.log(`[ADHD]    Current event ends at: ${newEndAt.toISOString()}`);
              console.log(`[ADHD]    Adding 15 min buffer...`);
              
              const nextSlotStart = new Date(newEndAt.getTime() + 15 * 60 * 1000); // 15 min buffer
              const nextSlotEnd = new Date(nextSlotStart.getTime() + duration);
              
              console.log(`[ADHD]    New slot: ${nextSlotStart.toISOString()} - ${nextSlotEnd.toISOString()} (${durationMinutes} min)`);
              
              await db.update(schema.calendarEventsNew)
                .set({ 
                  startAt: nextSlotStart,
                  endAt: nextSlotEnd
                })
                .where(eq(schema.calendarEventsNew.id, conflictingEvent.id));
              
              console.log(`[ADHD] ✅ Moved event "${conflictingEvent.title}" from ${conflictingEvent.startAt.toISOString()} to ${nextSlotStart.toISOString()}`);
            }
          } else {
            console.log(`[ADHD] No conflicts found`);
          }
      }
    }
    
    // Reset stuck flag
    await ADHDGuardian.resetStuckFlag(assignmentId);
    
    return c.json({ 
      ok: true, 
      checklist: {
        id: checklist.id,
        items: checklist.items
      }
    });
  } catch (error: any) {
    console.error('[ADHD] Failed to reset stuck and create checklist:', error);
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// CHECKLIST ENDPOINTS
// ============================================================================

/**
 * GET /adhd/checklist/:assignmentId
 * Get checklist for an assignment
 */
app.get('/checklist/:assignmentId', async (c) => {
  try {
    const userId = await getUserId(c);
    const assignmentId = c.req.param('assignmentId');
    
    // Verify user owns the assignment
    const assignment = await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, assignmentId)
    });
    
    if (!assignment || assignment.userId !== userId) {
      return c.json({ error: 'Assignment not found' }, 404);
    }
    
    const checklist = await db.query.assignmentChecklists.findFirst({
      where: eq(schema.assignmentChecklists.assignmentId, assignmentId)
    });
    
    if (!checklist) {
      return c.json({ error: 'Checklist not found' }, 404);
    }
    
    return c.json({
      id: checklist.id,
      items: checklist.items,
      createdAt: checklist.createdAt,
      completedAt: checklist.completedAt
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/checklist/:id/check
 * Check/uncheck a checklist item
 */
app.post('/checklist/:id/check', async (c) => {
  try {
    const userId = await getUserId(c);
    const checklistId = c.req.param('id');
    const body = await c.req.json();
    const { itemIndex, completed } = body;
    
    if (itemIndex === undefined || completed === undefined) {
      return c.json({ error: 'Missing itemIndex or completed' }, 400);
    }
    
    // Get checklist
    const checklist = await db.query.assignmentChecklists.findFirst({
      where: eq(schema.assignmentChecklists.id, checklistId),
    });
    
    if (!checklist) {
      return c.json({ error: 'Checklist not found' }, 404);
    }
    
    // Verify ownership by fetching assignment
    const assignment = await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, checklist.assignmentId),
    });
    
    if (!assignment || assignment.userId !== userId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    
    // Update item
    const items = checklist.items as any[];
    if (itemIndex < 0 || itemIndex >= items.length) {
      return c.json({ error: 'Invalid item index' }, 400);
    }
    
    items[itemIndex].completed = completed;
    
    // Calculate remaining time
    const remainingMinutes = items
      .filter(item => !item.completed)
      .reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
    
    // Update checklist
    await db.update(schema.assignmentChecklists)
      .set({ items: items as any })
      .where(eq(schema.assignmentChecklists.id, checklistId));
    
    // Update linked event's end time if exists
    if (checklist.eventId) {
      const event = await db.query.calendarEventsNew.findFirst({
        where: eq(schema.calendarEventsNew.id, checklist.eventId)
      });
      
      if (event) {
        const newEndAt = new Date(event.startAt.getTime() + remainingMinutes * 60 * 1000);
        await db.update(schema.calendarEventsNew)
          .set({ endAt: newEndAt })
          .where(eq(schema.calendarEventsNew.id, checklist.eventId));
      }
    }
    
    return c.json({ 
      ok: true,
      items,
      remainingMinutes
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/complete/:assignmentId
 * Mark assignment complete (from calendar event) - marks events as complete with visual indicators
 */
app.post('/complete/:assignmentId', async (c) => {
  try {
    const userId = await getUserId(c);
    const assignmentId = c.req.param('assignmentId');
    
    console.log(`[ADHD Complete] User ${userId} marking assignment ${assignmentId} complete`);
    
    // Verify ownership
    const assignment = await db.query.assignments.findFirst({
      where: and(
        eq(schema.assignments.id, assignmentId),
        eq(schema.assignments.userId, userId)
      ),
    });
    
    if (!assignment) {
      return c.json({ error: 'Assignment not found' }, 404);
    }
    
    // Mark assignment as completed
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adhd-features.ts:complete:BEFORE_STATUS_UPDATE',message:'About to update assignment status',data:{assignmentId,currentStatus:assignment.status,willSetTo:'Completed'},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix-v2',hypothesisId:'J'})}).catch(()=>{});
    // #endregion
    
    const updateResult = await db.update(schema.assignments)
      .set({ 
        status: 'Completed',
        submittedAt: new Date()
      })
      .where(eq(schema.assignments.id, assignmentId));
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adhd-features.ts:complete:AFTER_STATUS_UPDATE',message:'Assignment status updated',data:{assignmentId,updateResult:updateResult},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix-v2',hypothesisId:'J'})}).catch(()=>{});
    // #endregion
    
    console.log(`[ADHD Complete] ✅ Marked assignment "${assignment.title}" as Completed`);
    
    // Mark any checklist as complete
    const checklist = await db.query.assignmentChecklists.findFirst({
      where: eq(schema.assignmentChecklists.assignmentId, assignmentId),
    });
    
    if (checklist && !checklist.completedAt) {
      await db.update(schema.assignmentChecklists)
        .set({ completedAt: new Date() })
        .where(eq(schema.assignmentChecklists.id, checklist.id));
      console.log(`[ADHD Complete] ✅ Marked checklist complete`);
    }
    
    // Mark ALL calendar events as completed (don't delete!)
    const allEvents = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adhd-features.ts:complete:EVENTS_FETCHED',message:'Fetched all events',data:{totalEvents:allEvents.length,assignmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix-v2',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    
    // FIX: Check top-level linkedAssignmentId, not metadata
    const eventsToComplete = allEvents.filter(evt => {
      const topLevelId = evt.linkedAssignmentId;
      const metadataId = (evt.metadata as any)?.linkedAssignmentId;
      const matches = topLevelId === assignmentId || metadataId === assignmentId;
      return matches;
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adhd-features.ts:complete:EVENTS_TO_COMPLETE',message:'Found events to mark complete',data:{eventsToCompleteCount:eventsToComplete.length,eventTitles:eventsToComplete.map(e=>e.title)},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix-v2',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    
    let completedEventCount = 0;
    for (const event of eventsToComplete) {
      const updatedMetadata = {
        ...(event.metadata as any),
        isCompleted: true,
        completedAt: new Date().toISOString()
      };
      
      await db.update(schema.calendarEventsNew)
        .set({ metadata: updatedMetadata })
        .where(eq(schema.calendarEventsNew.id, event.id));
      completedEventCount++;
      console.log(`[ADHD Complete] ✅ Marked event "${event.title}" as completed`);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adhd-features.ts:complete:EVENT_MARKED',message:'Event marked complete',data:{eventId:event.id,eventTitle:event.title,updatedMetadata},timestamp:Date.now(),sessionId:'debug-session',runId:'complete-fix-v2',hypothesisId:'I'})}).catch(()=>{});
      // #endregion
    }
    
    console.log(`[ADHD Complete] ✅ Marked ${completedEventCount} calendar event(s) as complete`);
    
    return c.json({ 
      ok: true, 
      completedAt: new Date(),
      completedEvents: completedEventCount 
    });
  } catch (error: any) {
    console.error('[ADHD Complete] Error:', error);
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/checklist/:id/complete
 * Mark entire checklist as complete (from checklist viewer)
 */
app.post('/checklist/:id/complete', async (c) => {
  try {
    const userId = await getUserId(c);
    const checklistId = c.req.param('id');
    
    // Get checklist
    const checklist = await db.query.assignmentChecklists.findFirst({
      where: eq(schema.assignmentChecklists.id, checklistId),
    });
    
    if (!checklist) {
      return c.json({ error: 'Checklist not found' }, 404);
    }
    
    // Verify ownership by fetching assignment
    const assignment = await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, checklist.assignmentId),
    });
    
    if (!assignment || assignment.userId !== userId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    
    // Mark checklist complete
    await db.update(schema.assignmentChecklists)
      .set({ completedAt: new Date() })
      .where(eq(schema.assignmentChecklists.id, checklistId));
    
    // Mark assignment as completed
    await db.update(schema.assignments)
      .set({ 
        status: 'Completed',
        submittedAt: new Date()
      })
      .where(eq(schema.assignments.id, checklist.assignmentId));
    
    // Mark ALL calendar events as completed (don't delete!)
    const allEvents = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    // FIX: Check top-level linkedAssignmentId, not metadata
    const eventsToComplete = allEvents.filter(evt => {
      const topLevelId = evt.linkedAssignmentId;
      const metadataId = (evt.metadata as any)?.linkedAssignmentId;
      return topLevelId === checklist.assignmentId || metadataId === checklist.assignmentId;
    });
    
    for (const event of eventsToComplete) {
      const updatedMetadata = {
        ...(event.metadata as any),
        isCompleted: true,
        completedAt: new Date().toISOString()
      };
      
      await db.update(schema.calendarEventsNew)
        .set({ metadata: updatedMetadata })
        .where(eq(schema.calendarEventsNew.id, event.id));
    }
    
    return c.json({ ok: true, completedAt: new Date() });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// RECOVERY FORCING ENDPOINTS
// ============================================================================

/**
 * GET /adhd/deep-work-today
 * Get deep work minutes for today
 */
app.get('/deep-work-today', async (c) => {
  try {
    const userId = await getUserId(c);
    const today = new Date();
    const minutes = await ADHDGuardian.getDeepWorkMinutes(userId, today);
    const hours = minutes / 60;
    const exceeded = hours >= 4.0;
    
    return c.json({
      minutes,
      hours: parseFloat(hours.toFixed(1)),
      limit: 4.0,
      exceeded,
      recoveryForced: exceeded
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /adhd/can-schedule-deep-work
 * Check if user can schedule more deep work today
 */
app.get('/can-schedule-deep-work', async (c) => {
  try {
    const userId = await getUserId(c);
    const today = new Date();
    const exceeded = await ADHDGuardian.hasExceededDeepWorkLimit(userId, today);
    
    return c.json({
      canSchedule: !exceeded,
      reason: exceeded ? 'Recovery forced: 4+ hours deep work today' : 'Can schedule'
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// GRADE RESCUE ENDPOINTS
// ============================================================================

/**
 * POST /adhd/update-grade
 * Update course grade
 */
app.post('/update-grade', async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json();
    const { courseId, grade } = body;
    
    if (!courseId || grade === undefined) {
      return c.json({ error: 'Missing courseId or grade' }, 400);
    }
    
    // Verify user owns the course
    const course = await db.query.courses.findFirst({
      where: eq(schema.courses.id, courseId)
    });
    
    if (!course || course.userId !== userId) {
      return c.json({ error: 'Course not found' }, 404);
    }
    
    await ADHDGuardian.updateCourseGrade(courseId, grade);
    
    return c.json({ ok: true, grade });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /adhd/set-major
 * Set course as major/minor
 */
app.post('/set-major', async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json();
    const { courseId, isMajor } = body;
    
    if (!courseId || isMajor === undefined) {
      return c.json({ error: 'Missing courseId or isMajor' }, 400);
    }
    
    // Verify user owns the course
    const course = await db.query.courses.findFirst({
      where: eq(schema.courses.id, courseId)
    });
    
    if (!course || course.userId !== userId) {
      return c.json({ error: 'Course not found' }, 404);
    }
    
    await ADHDGuardian.setCourseAsMajor(courseId, isMajor);
    
    return c.json({ ok: true, isMajor });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /adhd/priority/:assignmentId
 * Calculate comprehensive priority for an assignment
 */
app.get('/priority/:assignmentId', async (c) => {
  try {
    const userId = await getUserId(c);
    const assignmentId = c.req.param('assignmentId');
    const energyLevel = parseInt(c.req.query('energy') || '5');
    
    // Verify user owns the assignment
    const assignment = await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, assignmentId)
    });
    
    if (!assignment || assignment.userId !== userId) {
      return c.json({ error: 'Assignment not found' }, 404);
    }
    
    const priority = await ADHDGuardian.calculateComprehensivePriority(
      assignmentId,
      0.1, // Default grade weight
      energyLevel
    );
    
    return c.json({ priority, energyLevel });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (c) => {
  return c.json({
    service: 'ADHD Features (Priority 2)',
    features: [
      'Wall of Awful Detection',
      'Artificial Urgency',
      'Recovery Forcing',
      'Grade Rescue Logic'
    ],
    status: 'operational'
  });
});

export default app;

