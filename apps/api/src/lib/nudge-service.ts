import { db } from './db';
import {
  classNudges,
  assignments,
  userStreaks,
  calendarEventsNew
} from '../../../../packages/db/src/schema';
import { eq, and, sql } from 'drizzle-orm';

interface ResolveBody {
  action: 'no_updates' | 'log_focus' | 'add_assignment' | 'defer' | 'mute_course';
  payload?: {
    text?: string;
    dueDate?: string; // ISO string
    focusMinutes?: number;
  };
  logistics?: {
    asked: boolean;
    response?: 'yes' | 'no';
    capture_method?: 'text' | 'photo_attachment' | null;
    attachments?: Array<{
      id: string;
      storage_path: string;
      mime: string;
      size: number;
    }>;
  };
  responseReason?: string;
  survey?: {
    energy?: number;
    curiosity?: number;
  };
}

export class NudgeService {
  /**
   * Resolves a nudge and triggers side effects based on user action.
   * Handles "Assignment" creation and "Focus" logging.
   */
  async resolve(nudgeId: string, userId: string, body: ResolveBody) {
    return await db.transaction(async (tx) => {
      // 1. Fetch and validate nudge
      const nudge = await tx.query.classNudges.findFirst({
        where: and(
          eq(classNudges.id, nudgeId),
          eq(classNudges.userId, userId)
        )
      });

      if (!nudge) {
        throw new Error("NUDGE_NOT_FOUND: Nudge not found or unauthorized.");
      }

      if (nudge.status !== 'pending' && nudge.status !== 'deferred') {
        throw new Error(`NUDGE_NOT_RESOLVABLE: Nudge status is '${nudge.status}', must be 'pending' or 'deferred'.`);
      }

      // 2. Execute Side Effects based on Action
      let createdResourceId: string | null = null;
      const now = new Date();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD for date column

      if (body.action === 'add_assignment') {
        // Create the assignment via Quick Add logic
        // Note: assignments table doesn't have a 'source' field, so we store it in metadata if needed
        const [newAssignment] = await tx
          .insert(assignments)
          .values({
            userId: userId,
            courseId: nudge.courseId || null,
            title: body.payload?.text || "New Assignment from Class",
            status: 'Inbox', // Stays in Inbox until triaged
            dueDate: body.payload?.dueDate ? new Date(body.payload.dueDate) : new Date(Date.now() + 86400000) // Default +1 day
          })
          .returning();
        
        createdResourceId = newAssignment.id;
      } else if (body.action === 'log_focus') {
        // Create a completed Focus block in the calendar
        const duration = body.payload?.focusMinutes || 25;
        const startAt = new Date(now.getTime() - duration * 60000);
        
        const [focusEvent] = await tx
          .insert(calendarEventsNew)
          .values({
            userId: userId,
            courseId: nudge.courseId || null,
            title: nudge.courseId ? `Focus: ${nudge.courseId}` : 'Focus Session',
            eventType: 'Focus', // Use enum value
            startAt: startAt,
            endAt: now,
            isMovable: false, // Completed events don't move
            metadata: {
              source: 'post_class_nudge',
              nudgeId: nudgeId
            }
          })
          .returning();
        
        createdResourceId = focusEvent.id;
      }

      // 3. Update Nudge Status & Metadata
      const existingNotes = (nudge.notes as Record<string, any>) || {};
      const updatedNotes = {
        ...existingNotes,
        logistics: body.logistics || existingNotes.logistics,
        survey: body.survey || existingNotes.survey,
        resolver: {
          createdResourceId: createdResourceId,
          ...(existingNotes.resolver || {})
        }
      };

      // Build response payload (normalized for audits)
      const responsePayload: Record<string, any> = {
        action: body.action
      };

      if (body.action === 'log_focus') {
        responsePayload.focus = {
          duration_minutes: body.payload?.focusMinutes || 25
        };
      }

      if (body.action === 'add_assignment' && createdResourceId) {
        responsePayload.assignment = {
          id: createdResourceId,
          title: body.payload?.text || "New Assignment from Class",
          due_date: body.payload?.dueDate || new Date(Date.now() + 86400000).toISOString()
        };
      }

      if (body.logistics) {
        responsePayload.logistics = body.logistics;
      }

      if (body.survey) {
        responsePayload.survey = body.survey;
      }

      await tx
        .update(classNudges)
        .set({
          status: 'resolved',
          responseType: body.action,
          resolvedAt: now,
          responseAt: now,
          resolvedByEventId: body.action === 'log_focus' && createdResourceId ? createdResourceId : null,
          responseReason: body.responseReason || null,
          responsePayload: responsePayload,
          notes: updatedNotes
        })
        .where(eq(classNudges.id, nudgeId));

      // 4. Reward the Streak
      // Any action (even "no_updates") maintains the streak
      // Check if streak was already incremented today to prevent double-counting
      const existingStreak = await tx.query.userStreaks.findFirst({
        where: and(
          eq(userStreaks.userId, userId),
          eq(userStreaks.streakType, 'productivity')
        )
      });

      if (existingStreak) {
        // Update existing streak only if not already incremented today (idempotent)
        if (existingStreak.lastIncrementedOn !== today) {
          // Calculate new streak count (reset to 1 if streak was broken)
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const isStreakContinued = existingStreak.lastIncrementedOn === yesterdayStr;
          const newCurrentCount = isStreakContinued
            ? existingStreak.currentCount + 1 // Continue streak
            : 1; // Reset to 1 (broken streak)
          
          const newLongestCount = Math.max(existingStreak.longestCount, newCurrentCount);

          await tx
            .update(userStreaks)
            .set({
              currentCount: newCurrentCount,
              longestCount: newLongestCount,
              lastIncrementedOn: today,
              updatedAt: now
            })
            .where(
              and(
                eq(userStreaks.userId, userId),
                eq(userStreaks.streakType, 'productivity')
              )
            );
        }
        // If already incremented today, skip (idempotent - prevents double-counting)
      } else {
        // Create new streak
        await tx.insert(userStreaks).values({
          userId: userId,
          streakType: 'productivity',
          currentCount: 1,
          longestCount: 1,
          lastIncrementedOn: today
        });
      }

      return {
        success: true,
        createdResourceId: createdResourceId,
        nudgeId: nudgeId,
        action: body.action
      };
    });
  }
}

