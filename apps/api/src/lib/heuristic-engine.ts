import { db } from './db';
import { calendarEventsNew, assignments, proposalMoves, rebalancingProposals } from '../../../../packages/db/src/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { PrioritizationEngine } from './prioritization-engine';
import { getHeuristicConfig, getTimeOfDay } from './heuristic-config';
import { ScheduleAnalyzer } from './schedule-analyzer';
import { SlotMatcher } from './slot-matcher';
import { WorkloadBalancer } from './workload-balancer';

interface GenerateProposalTrigger {
  userId: string;
  energyLevel: number;
  targetAssignmentId?: string;
}

interface ProposalMove {
  proposalId: string;
  userId: string;
  moveType: 'insert' | 'move' | 'resize' | 'delete';
  sourceEventId?: string;
  targetStartAt?: Date;
  targetEndAt?: Date;
  deltaMinutes?: number;
  churnCost: number;
  category?: string;
  reasonCodes: string[];
  basePriority?: number;
  energyMultiplier?: number;
  finalPriority?: number;
  feasibilityFlags?: Record<string, any>;
  baselineUpdatedAt?: Date;
  baselineVersion?: number;
  metadata?: Record<string, any>;
}

export class HeuristicEngine {
  // SAFETY CONSTRAINTS
  private static readonly SLEEP_START_HOUR = 23; // 11 PM
  private static readonly SLEEP_END_HOUR = 7;    // 7 AM
  
  private prioritizationEngine: PrioritizationEngine;
  private config: ReturnType<typeof getHeuristicConfig>;
  
  constructor(userId?: string) {
    this.prioritizationEngine = new PrioritizationEngine(userId);
    this.config = getHeuristicConfig(userId);
  }
  
  /**
   * Check if a given date/time falls within the sleep window (11pm - 7am)
   * NOTE: Uses UTC hours for now. TODO: Add user timezone support
   */
  private isInSleepWindow(date: Date): boolean {
    // Config values (SLEEP_START_HOUR, SLEEP_END_HOUR) are in CST (local time)
    // CST is UTC-6, so we need to convert to UTC for comparison
    // CST 11 PM (23) = UTC 5 AM next day
    // CST 7 AM (7) = UTC 1 PM (13)
    // CST 10 AM weekend (10) = UTC 4 PM (16)
    
    const hour = date.getUTCHours();
    const day = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = day === 0 || day === 6;
    
    const cstOffset = 6; // CST is UTC-6
    const sleepStartUTC = (HeuristicEngine.SLEEP_START_HOUR + cstOffset) % 24; // 23 + 6 = 5
    const sleepEndWeekdayUTC = (HeuristicEngine.SLEEP_END_HOUR + cstOffset) % 24; // 7 + 6 = 13
    const sleepEndWeekendUTC = (10 + cstOffset) % 24; // 10 + 6 = 16
    
    const sleepEndUTC = isWeekend ? sleepEndWeekendUTC : sleepEndWeekdayUTC;
    
    // Sleep window in UTC: 5 AM - 1 PM (weekday) or 5 AM - 4 PM (weekend)
    return hour >= sleepStartUTC && hour < sleepEndUTC;
  }

  /**
   * Check if there was a recent Focus block within the minimum rest period
   * Returns the most recent Focus block if found, null otherwise
   */
  private async getRecentFocusBlock(
    userId: string,
    beforeTime: Date
  ): Promise<{id: string; startAt: Date; endAt: Date; title: string | null} | null> {
    const minRestHours = this.config.neuroRules.deepWorkMinRestHours;
    const minRestTime = new Date(beforeTime.getTime() - minRestHours * 60 * 60 * 1000);

    // Fix: Use query builder instead of relational API for gte/lte operators
    const results = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, userId),
          eq(calendarEventsNew.eventType, 'Focus'),
          gte(calendarEventsNew.endAt, minRestTime),
          lte(calendarEventsNew.endAt, beforeTime)
        )
      )
      .orderBy(sql`${calendarEventsNew.endAt} DESC`)
      .limit(1);

    return results[0] || null;
  }

  /**
   * PHASE 2: Check if proposed moves would exceed daily churn limits
   * Returns { allowed: boolean, reason?: string }
   */
  private async checkChurnLimits(
    userId: string,
    proposedMoves: ProposalMove[],
    energyLevel: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const { churnLedger } = await import('../../../../packages/db/src/schema');
    
    // Get today's date string in user's timezone (YYYY-MM-DD format)
    const now = new Date();
    const todayDateString = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Fetch today's churn from the ledger using the 'day' column
    const todayChurn = await db
      .select()
      .from(churnLedger)
      .where(
        and(
          eq(churnLedger.userId, userId),
          eq(churnLedger.day, todayDateString)
        )
      );

    // Calculate current churn
    const currentMoveCount = todayChurn.reduce((sum, entry) => sum + (entry.movesCount || 0), 0);
    const currentMinutesMoved = todayChurn.reduce((sum, entry) => sum + (entry.minutesMoved || 0), 0);

    // Calculate proposed churn
    const proposedMoveCount = proposedMoves.length;
    const proposedMinutesMoved = proposedMoves.reduce((sum, move) => sum + Math.abs(move.deltaMinutes || 0), 0);

    // Get limits from config
    let maxMoves = this.config.churnLimits.dailyMaxMoves;
    let maxMinutes = this.config.churnLimits.dailyMaxMinutesMoved;

    // PHASE 2: If energy is high (>= aggressive threshold), allow more churn
    if (energyLevel >= this.config.churnLimits.aggressiveThreshold) {
      maxMoves = Math.floor(maxMoves * 1.5); // 50% more moves allowed
      maxMinutes = Math.floor(maxMinutes * 1.5); // 50% more minutes allowed
      console.log(`[HeuristicEngine] CHURN: High energy (${energyLevel}/10), allowing aggressive churn (${maxMoves} moves, ${maxMinutes} min)`);
    }

    // Check limits
    const totalMoves = currentMoveCount + proposedMoveCount;
    const totalMinutes = currentMinutesMoved + proposedMinutesMoved;

    if (totalMoves > maxMoves) {
      return {
        allowed: false,
        reason: `Would exceed daily move limit: ${totalMoves} > ${maxMoves} (current: ${currentMoveCount}, proposed: ${proposedMoveCount})`
      };
    }

    if (totalMinutes > maxMinutes) {
      return {
        allowed: false,
        reason: `Would exceed daily churn limit: ${totalMinutes} min > ${maxMinutes} min (current: ${currentMinutesMoved}, proposed: ${proposedMinutesMoved})`
      };
    }

    console.log(`[HeuristicEngine] CHURN: Within limits - ${totalMoves}/${maxMoves} moves, ${totalMinutes}/${maxMinutes} min`);
    return { allowed: true };
  }
  
  /**
   * Main Entry Point: Generates a rebalancing proposal
   * Triggered by Quick Add, Energy Changes, or Manual Requests
   */
  async generateProposal(trigger: GenerateProposalTrigger) {
    const now = new Date();
    const lookaheadLimit = new Date(now.getTime() + 1440 * 60 * 1000); // 24-hour window (1440 minutes)

    console.log(`[HeuristicEngine] Generating proposal for user ${trigger.userId}`);
    console.log(`[HeuristicEngine] Now: ${now.toISOString()}, Lookahead limit: ${lookaheadLimit.toISOString()}`);

    // First, check ALL events for this user to see what exists
    const allUserEvents = await db
      .select()
      .from(calendarEventsNew)
      .where(eq(calendarEventsNew.userId, trigger.userId));
    
    console.log(`[HeuristicEngine] Total events for user: ${allUserEvents.length}`);
    console.log(`[HeuristicEngine] All events:`, allUserEvents.map(e => ({
      id: e.id,
      title: e.title,
      type: e.eventType,
      start: e.startAt instanceof Date ? e.startAt.toISOString() : e.startAt,
      end: e.endAt instanceof Date ? e.endAt.toISOString() : e.endAt,
      isMovable: e.isMovable,
      inRange: e.startAt <= lookaheadLimit && e.endAt >= now
    })));

    // 1. Fetch current movable schedule
    const scheduleRaw = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, trigger.userId),
          gte(calendarEventsNew.endAt, now),
          lte(calendarEventsNew.startAt, lookaheadLimit),
          eq(calendarEventsNew.isMovable, true) // Only fetch movable events
        )
      );

    // SAFETY: Filter out events in sleep window (11pm - 7am)
    // We should never propose moving events that are currently in sleep time
    const schedule = scheduleRaw.filter(event => {
      const inSleepWindow = this.isInSleepWindow(event.startAt) || this.isInSleepWindow(event.endAt);
      if (inSleepWindow) {
        console.log(`[HeuristicEngine] SAFETY: Filtering out event in sleep window: ${event.title} (${event.startAt.toISOString()})`);
      }
      return !inSleepWindow;
    });

    // SAFETY: Filter out protected windows
    const safeSchedule = schedule.filter(event => {
      const isProtected = event.metadata && (event.metadata as any).protected === true;
      if (isProtected) {
        console.log(`[HeuristicEngine] SAFETY: Filtering out protected window: ${event.title}`);
      }
      return !isProtected;
    });

    // SAFETY: Validate that no immovable events slipped through
    // This should never happen due to the isMovable=true filter, but check for data integrity
    const immovableTypes = ['Class', 'Work', 'OfficeHours'];
    const immovableFound = safeSchedule.filter(event => immovableTypes.includes(event.eventType));
    if (immovableFound.length > 0) {
      console.error(`[HeuristicEngine] DATA INTEGRITY ERROR: Found ${immovableFound.length} immovable events in movable list!`);
      immovableFound.forEach(event => {
        console.error(`  - ${event.eventType}: ${event.title} (ID: ${event.id}, isMovable: ${event.isMovable})`);
      });
      // Filter them out as a safety measure
      const finalSchedule = safeSchedule.filter(event => !immovableTypes.includes(event.eventType));
      console.log(`[HeuristicEngine] Filtered out ${immovableFound.length} immovable events, ${finalSchedule.length} remaining`);
    }

    const finalSchedule = safeSchedule.filter(event => !immovableTypes.includes(event.eventType));

    console.log(`[HeuristicEngine] Found ${scheduleRaw.length} raw movable events, ${finalSchedule.length} after safety filters`);
    console.log(`[HeuristicEngine] Safe movable events:`, finalSchedule.map(e => ({
      id: e.id,
      title: e.title,
      type: e.eventType,
      start: e.startAt instanceof Date ? e.startAt.toISOString() : e.startAt,
      end: e.endAt instanceof Date ? e.endAt.toISOString() : e.endAt,
      isMovable: e.isMovable
    })));

    // 2. Apply Neuro-Adaptive Scoring
    // Adjusts priority based on the Energy Multiplier Table
    const energyMultiplier = this.getEnergyMultiplier(trigger.energyLevel);
    
    // 3. Find the "Best Fit" slots while respecting Churn Caps
    const proposalId = randomUUID();
    const moves = await this.calculateMoves(finalSchedule, trigger, energyMultiplier, proposalId);
    
    console.log(`[HeuristicEngine] Generated ${moves.length} moves for proposal ${proposalId}`);

    // 3.5. PHASE 2: Churn Limit Enforcement
    // Check if applying these moves would exceed daily churn limits
    const churnCheck = await this.checkChurnLimits(trigger.userId, moves, trigger.energyLevel);
    if (!churnCheck.allowed) {
      console.warn(`[HeuristicEngine] CHURN_LIMIT_EXCEEDED: ${churnCheck.reason}`);
      // Return empty proposal to avoid overwhelming the user
      return { proposalId: randomUUID(), moves: [] };
    }

    // 4. Persistence: Write the proposal but DO NOT apply yet
    // This allows the user to preview the "Diff" as required by the Frontend PRD
    await db.insert(rebalancingProposals).values({
      id: proposalId,
      userId: trigger.userId,
      trigger: trigger.targetAssignmentId ? 'quick_add' : 'manual',
      energyLevel: trigger.energyLevel,
      movesCount: moves.length,
      churnCostTotal: moves.reduce((sum, m) => sum + m.churnCost, 0),
      status: 'proposed'
    });

    // Insert proposal moves
    if (moves.length > 0) {
      await db.insert(proposalMoves).values(
        moves.map(move => ({
          id: randomUUID(),
          proposalId: move.proposalId,
          userId: move.userId,
          moveType: move.moveType,
          sourceEventId: move.sourceEventId || null,
          targetStartAt: move.targetStartAt || null,
          targetEndAt: move.targetEndAt || null,
          deltaMinutes: move.deltaMinutes || null,
          churnCost: move.churnCost,
          category: move.category || null,
          reasonCodes: move.reasonCodes,
          basePriority: move.basePriority ? move.basePriority.toString() : null,
          energyMultiplier: move.energyMultiplier ? move.energyMultiplier.toString() : null,
          finalPriority: move.finalPriority ? move.finalPriority.toString() : null,
          feasibilityFlags: move.feasibilityFlags || null,
          baselineUpdatedAt: move.baselineUpdatedAt || null,
          baselineVersion: move.baselineVersion || null,
          metadata: move.metadata || null
        }))
      );
    }

    return { proposalId, moves };
  }

  /**
   * Decision Table Implementation
   * High Energy (8-10): Boost Deep Work (1.5x), Suppress Admin (0.5x)
   * Low Energy (1-3): Avoid Deep Work (0.1x), Boost Light/Admin (2.0x)
   */
  private getEnergyMultiplier(level: number): number {
    if (level >= 8) return 1.5; 
    if (level <= 3) return 0.1; 
    return 1.0;
  }

  private async calculateMoves(
    schedule: Array<{
      id: string;
      userId: string;
      eventType: string;
      startAt: Date;
      endAt: Date;
      isMovable: boolean;
      updatedAt: Date;
      title?: string | null;
      metadata?: Record<string, any> | null;
    }>,
    trigger: GenerateProposalTrigger,
    multiplier: number,
    proposalId: string
  ): Promise<ProposalMove[]> {
    // Phase 2: Smart Heuristics
    // Uses PrioritizationEngine to score assignments and make intelligent moves
    const moves: ProposalMove[] = [];

    // Filter to only movable events (should already be filtered, but double-check)
    const movableEvents = schedule.filter(event => event.isMovable);

    // If no events found, return empty moves
    if (movableEvents.length === 0) {
      console.log(`[HeuristicEngine] No movable events found, returning empty moves`);
      return [];
    }

    // Group events by type
    const chillEvents = movableEvents.filter(e => e.eventType === 'Chill');
    const focusEvents = movableEvents.filter(e => e.eventType === 'Focus');
    const otherEvents = movableEvents.filter(e => e.eventType !== 'Chill' && e.eventType !== 'Focus');

    console.log(`[HeuristicEngine] Processing ${chillEvents.length} Chill events, ${focusEvents.length} Focus events, ${otherEvents.length} other events`);

    // PHASE 2: If there's a target assignment, prioritize it
    let assignmentPriority: any = null;
    if (trigger.targetAssignmentId) {
      try {
        assignmentPriority = await this.prioritizationEngine.calculateAssignmentPriority(
          trigger.targetAssignmentId,
          trigger.energyLevel
        );
        console.log(`[HeuristicEngine] Assignment priority score: ${assignmentPriority.totalScore.toFixed(2)} (urgency: ${assignmentPriority.urgencyScore.toFixed(2)}, impact: ${assignmentPriority.impactScore.toFixed(2)}, energy fit: ${assignmentPriority.energyFitScore.toFixed(2)})`);
      } catch (error) {
        console.warn(`[HeuristicEngine] Could not calculate assignment priority:`, error);
      }
    }

    // PHASE 2: Intelligent Chill Block Preemption
    // Preempt Chill blocks ONLY if there's a high-priority assignment that needs the time
    const shouldPreemptChill = assignmentPriority && assignmentPriority.totalScore >= 0.6;
    
    if (shouldPreemptChill) {
      console.log(`[HeuristicEngine] High-priority assignment detected (score: ${assignmentPriority.totalScore.toFixed(2)}), preempting Chill blocks`);
      
      for (const event of chillEvents) {
        const duration = event.endAt.getTime() - event.startAt.getTime();
        
        // PHASE 2: Smart time selection based on time-of-day preferences
        // Move Chill to evening (better energy fit for low-energy activities)
        const originalTimeOfDay = getTimeOfDay(event.startAt, this.config);
        let targetStart: Date;
        
        if (originalTimeOfDay === 'morning' || originalTimeOfDay === 'afternoon') {
          // Move to evening (18:00 UTC = 6 PM)
          const eveningHour = this.config.timePreferences.eveningStartHour;
          targetStart = new Date(event.startAt);
          targetStart.setUTCHours(eveningHour, 0, 0, 0);
          // If evening time already passed today, use tomorrow
          if (targetStart <= event.startAt) {
            targetStart = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);
          }
        } else {
          // Already in evening, just move later
          targetStart = new Date(event.startAt.getTime() + 2 * 60 * 60 * 1000); // +2 hours
        }
        
        let targetEnd = new Date(targetStart.getTime() + duration);
        
        // PHASE 2: Add context switching buffer (transition tax)
        // Add a small buffer after the event to allow for mental reset
        const transitionBuffer = this.config.neuroRules.transitionTaxMinutes;
        targetEnd = new Date(targetEnd.getTime() + transitionBuffer * 60 * 1000);
        console.log(`[HeuristicEngine] Added ${transitionBuffer}-min transition buffer after Chill block`);
        
        // SAFETY: Skip moves that would land in sleep window
        if (this.isInSleepWindow(targetStart) || this.isInSleepWindow(targetEnd)) {
          console.log(`[HeuristicEngine] SAFETY: Skipping move - would violate sleep window: ${event.title} -> ${targetStart.toISOString()}`);
          continue;
        }
        
        // SAFETY: Skip moves that would conflict with immovable events (Classes, Work, etc.)
        if (this.checkTargetSlotConflict(targetStart, targetEnd, schedule, event)) {
          console.log(`[HeuristicEngine] SAFETY: Skipping move - would conflict with immovable event or deadline: ${event.title} -> ${targetStart.toISOString()}`);
          continue;
        }
        
        // PHASE 2: Apply time-of-day multiplier to priority
        const timeMultiplier = this.prioritizationEngine.getTimeOfDayMultiplier('chill', targetStart);
        
        moves.push({
          proposalId,
          userId: trigger.userId,
          moveType: 'move',
          sourceEventId: event.id,
          targetStartAt: targetStart,
          targetEndAt: targetEnd,
          deltaMinutes: Math.round((targetStart.getTime() - event.startAt.getTime()) / (1000 * 60)),
          baselineUpdatedAt: event.updatedAt,
          baselineVersion: 1,
          churnCost: this.calculateChurnCost(event),
          category: this.categorizeEvent(event.eventType),
          reasonCodes: [
            'CHILL_PREEMPTED',
            `HIGH_PRIORITY_ASSIGNMENT_${assignmentPriority.totalScore >= 0.8 ? 'URGENT' : 'IMPORTANT'}`,
            'EVENING_BETTER_FIT'
          ],
          basePriority: 0.5,
          energyMultiplier: timeMultiplier,
          finalPriority: 0.5 * timeMultiplier,
          metadata: {
            originalStartAt: event.startAt.toISOString(),
            originalEndAt: event.endAt.toISOString(),
            title: event.title || 'Chill Session',
            eventTitle: event.title || 'Chill Session',
            originalTimeOfDay,
            targetTimeOfDay: getTimeOfDay(targetStart, this.config),
            assignmentPriorityScore: assignmentPriority?.totalScore,
            ...(trigger.targetAssignmentId && { assignmentId: trigger.targetAssignmentId })
          }
        });
      }
    } else {
      console.log(`[HeuristicEngine] No high-priority assignment, keeping Chill blocks in place`);
    }

    // PHASE 2: Intelligent Focus Block Protection
    // Only move Focus blocks if there's a CRITICAL assignment (>0.8 priority) OR for better time-of-day fit
    const shouldMoveFocus = (assignmentPriority && assignmentPriority.totalScore >= 0.8) || 
                            (trigger.energyLevel >= this.config.energyRules.highEnergyThreshold);
    
    if (shouldMoveFocus) {
      console.log(`[HeuristicEngine] Critical assignment or high energy (${trigger.energyLevel}/10), optimizing Focus blocks`);
      
      for (const event of focusEvents) {
        // PHASE 2.5: Check if this Focus block is part of a chunked sequence
        const isChunked = event.metadata?.chunkIndex !== undefined;
        
        if (isChunked) {
          // CHUNKED FOCUS: More conservative moves
          // Only move if there's a CRITICAL conflict or sleep window violation
          const hasConflict = this.hasScheduleConflict(event, schedule);
          const inSleep = this.isInSleepWindow(event.startAt) || this.isInSleepWindow(event.endAt);
          
          if (!hasConflict && !inSleep) {
            console.log(`[HeuristicEngine] Protecting chunked Focus block ${event.metadata.chunkIndex + 1}/${event.metadata.totalChunks}: ${event.title}`);
            continue; // Don't move unless necessary
          }
          
          console.log(`[HeuristicEngine] CRITICAL: Moving chunked Focus block ${event.metadata.chunkIndex + 1}/${event.metadata.totalChunks} due to conflict or sleep violation`);
          
          // If we must move, maintain the 8-hour gap from adjacent chunks
          const adjacentChunks = await this.getAdjacentChunks(event, trigger.userId);
          const targetStart = this.findSlotRespectingChunks(event, adjacentChunks, schedule);
          const duration = event.endAt.getTime() - event.startAt.getTime();
          const targetEnd = new Date(targetStart.getTime() + duration);
          
          // Add transition buffer
          const transitionBuffer = this.config.neuroRules.heavyTransitionTaxMinutes;
          const bufferedEnd = new Date(targetEnd.getTime() + transitionBuffer * 60 * 1000);
          
          const timeMultiplier = this.prioritizationEngine.getTimeOfDayMultiplier('focus', targetStart);
          
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'move',
            sourceEventId: event.id,
            targetStartAt: targetStart,
            targetEndAt: bufferedEnd,
            deltaMinutes: Math.round((targetStart.getTime() - event.startAt.getTime()) / (1000 * 60)),
            baselineUpdatedAt: event.updatedAt,
            baselineVersion: 1,
            churnCost: this.calculateChurnCost(event),
            category: 'deep_work',
            reasonCodes: [
              'CHUNKED_BLOCK_CRITICAL_MOVE',
              hasConflict ? 'CONFLICT_RESOLUTION' : 'SLEEP_VIOLATION',
              'MAINTAIN_8HR_GAPS'
            ],
            basePriority: 1.0,
            energyMultiplier: timeMultiplier,
            finalPriority: 1.0 * timeMultiplier,
            metadata: {
              originalStartAt: event.startAt.toISOString(),
              originalEndAt: event.endAt.toISOString(),
              title: event.title || 'Focus Session',
              eventTitle: event.title || 'Focus Session',
              chunkIndex: event.metadata.chunkIndex,
              totalChunks: event.metadata.totalChunks,
              chunkType: event.metadata.chunkType,
              ...(trigger.targetAssignmentId && { assignmentId: trigger.targetAssignmentId })
            }
          });
          
          continue; // Skip normal Focus block logic
        }
        
        // NON-CHUNKED FOCUS: Normal optimization logic
        const duration = event.endAt.getTime() - event.startAt.getTime();
        const originalTimeOfDay = getTimeOfDay(event.startAt, this.config);
        
        // PHASE 2: Smart time selection - move Deep Work to morning if not already there
        let targetStart: Date;
        
        if (originalTimeOfDay === 'evening' || originalTimeOfDay === 'afternoon') {
          // Move to morning (9:00 AM next day)
          const morningHour = this.config.timePreferences.morningStartHour + 2; // 9 AM
          targetStart = new Date(event.startAt);
          targetStart.setUTCHours(morningHour, 0, 0, 0);
          // Always use next day if moving to morning
          if (targetStart <= event.startAt) {
            targetStart = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);
          }
          console.log(`[HeuristicEngine] Moving Focus from ${originalTimeOfDay} to morning for optimal brain performance`);
        } else {
          // Already in morning, just shift slightly
          targetStart = new Date(event.startAt.getTime() + 60 * 60 * 1000); // +1 hour
        }
        
        let targetEnd = new Date(targetStart.getTime() + duration);
        
        // PHASE 2: Add context switching buffer (heavier for Focus/Deep Work)
        // Deep Work requires more transition time for mental reset
        const transitionBuffer = this.config.neuroRules.heavyTransitionTaxMinutes;
        targetEnd = new Date(targetEnd.getTime() + transitionBuffer * 60 * 1000);
        console.log(`[HeuristicEngine] Added ${transitionBuffer}-min heavy transition buffer after Focus block`);
        
        // SAFETY: Skip moves that would land in sleep window
        if (this.isInSleepWindow(targetStart) || this.isInSleepWindow(targetEnd)) {
          console.log(`[HeuristicEngine] SAFETY: Skipping move - would violate sleep window: ${event.title} -> ${targetStart.toISOString()}`);
          continue;
        }
        
        // SAFETY: Skip moves that would conflict with immovable events
        if (this.checkTargetSlotConflict(targetStart, targetEnd, schedule, event)) {
          console.log(`[HeuristicEngine] SAFETY: Skipping Focus move - would conflict with immovable event or deadline: ${event.title} -> ${targetStart.toISOString()}`);
          continue;
        }
        
        // PHASE 2: Deep Work Rest Enforcement
        // Check if there was a recent Focus block within the minimum rest period
        const recentFocus = await this.getRecentFocusBlock(trigger.userId, targetStart);
        if (recentFocus && recentFocus.id !== event.id) {
          const hoursSinceLastFocus = (targetStart.getTime() - recentFocus.endAt.getTime()) / (1000 * 60 * 60);
          const minRestHours = this.config.neuroRules.deepWorkMinRestHours;
          
          if (hoursSinceLastFocus < minRestHours) {
            console.log(`[HeuristicEngine] DEEP_WORK_REST: Skipping Focus move - only ${hoursSinceLastFocus.toFixed(1)}hrs since last Focus block (${recentFocus.title || 'Untitled'}), need ${minRestHours}hrs rest`);
            continue;
          }
        }
        
        // PHASE 2: Apply time-of-day multiplier
        const timeMultiplier = this.prioritizationEngine.getTimeOfDayMultiplier('focus', targetStart);
        
        moves.push({
          proposalId,
          userId: trigger.userId,
          moveType: 'move',
          sourceEventId: event.id,
          targetStartAt: targetStart,
          targetEndAt: targetEnd,
          deltaMinutes: Math.round((targetStart.getTime() - event.startAt.getTime()) / (1000 * 60)),
          baselineUpdatedAt: event.updatedAt,
          baselineVersion: 1,
          churnCost: this.calculateChurnCost(event),
          category: 'deep_work',
          reasonCodes: [
            assignmentPriority?.totalScore >= 0.8 ? 'CRITICAL_ASSIGNMENT_URGENT' : 'HIGH_ENERGY_OPTIMIZATION',
            originalTimeOfDay !== 'morning' ? 'MOVE_TO_MORNING_PEAK' : 'OPTIMIZE_TIMING',
            'DEEP_WORK_PROTECTION'
          ],
          basePriority: 1.0,
          energyMultiplier: timeMultiplier,
          finalPriority: 1.0 * timeMultiplier,
          metadata: {
            originalStartAt: event.startAt.toISOString(),
            originalEndAt: event.endAt.toISOString(),
            title: event.title || 'Focus Session',
            eventTitle: event.title || 'Focus Session',
            originalTimeOfDay,
            targetTimeOfDay: getTimeOfDay(targetStart, this.config),
            assignmentPriorityScore: assignmentPriority?.totalScore,
            energyLevel: trigger.energyLevel,
            ...(trigger.targetAssignmentId && { assignmentId: trigger.targetAssignmentId })
          }
        });
      }
    } else {
      console.log(`[HeuristicEngine] No critical assignment or high energy, protecting Focus blocks`);
    }

    // PHASE 2: Other Events Protection
    // Most "other" events (if they're movable at all) should only be moved in extreme cases
    // For now, we leave them alone unless there's a very specific need
    if (otherEvents.length > 0) {
      console.log(`[HeuristicEngine] Found ${otherEvents.length} other movable events, leaving in place (no high-priority need to move them)`);
    }

    console.log(`[HeuristicEngine] Generated ${moves.length} intelligent moves using Phase 2 heuristics`);
    return moves;
  }

  /**
   * Calculate churn cost for an event move
   * Based on event type and duration
   */
  private calculateChurnCost(event: {
    eventType: string;
    startAt: Date;
    endAt: Date;
  }): number {
    const durationMinutes = Math.round((event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60));
    
    // Base churn: duration in minutes
    let churnCost = durationMinutes;
    
    // Adjust by event type
    switch (event.eventType) {
      case 'Focus':
        churnCost *= 2; // High cost for moving focus blocks
        break;
      case 'Chill':
        churnCost *= 0.5; // Lower cost for moving chill blocks
        break;
      case 'Class':
      case 'Work':
      case 'OfficeHours':
        churnCost *= 10; // Very high cost (these should be immovable)
        break;
      default:
        churnCost *= 1; // Standard cost
    }
    
    return Math.round(churnCost);
  }

  /**
   * Categorize event for scoring
   */
  private categorizeEvent(eventType: string): string {
    switch (eventType) {
      case 'Focus':
        return 'deep_work';
      case 'Chill':
        return 'light';
      case 'Class':
      case 'Work':
        return 'standard';
      default:
        return 'standard';
    }
  }

  /**
   * Check if event has a schedule conflict
   */
  private hasScheduleConflict(event: any, schedule: any[]): boolean {
    return schedule.some(other => {
      if (other.id === event.id) return false;
      // Check for overlap
      return (event.startAt < other.endAt && event.endAt > other.startAt);
    });
  }

  /**
   * Get adjacent chunks for a chunked Focus block
   * Returns all chunks for the same assignment, ordered by start time
   */
  private async getAdjacentChunks(event: any, userId: string) {
    if (!event.linkedAssignmentId || !event.metadata?.chunkIndex) return [];
    
    const chunks = await db.query.calendarEventsNew.findMany({
      where: and(
        eq(calendarEventsNew.userId, userId),
        eq(calendarEventsNew.linkedAssignmentId, event.linkedAssignmentId),
        eq(calendarEventsNew.eventType, 'Focus')
      ),
      orderBy: [sql`start_at ASC`]
    });
    
    return chunks.filter(c => c.metadata?.chunkIndex !== undefined);
  }

  /**
   * Find a slot for a chunked Focus block that respects 8hr gaps from other chunks
   */
  private findSlotRespectingChunks(event: any, adjacentChunks: any[], schedule: any[]): Date {
    const MIN_GAP_MS = 8 * 60 * 60 * 1000; // 8 hours
    const duration = event.endAt.getTime() - event.startAt.getTime();
    
    // Start with a candidate 2 hours after the original time
    let candidateStart = new Date(event.startAt.getTime() + 2 * 60 * 60 * 1000);
    
    // Ensure candidate respects 8hr gaps from all other chunks
    let attempts = 0;
    const maxAttempts = 50; // Safety limit
    
    while (attempts < maxAttempts) {
      let tooClose = false;
      
      // Check distance from all adjacent chunks
      for (const chunk of adjacentChunks) {
        if (chunk.id === event.id) continue;
        
        const timeDiff = Math.abs(candidateStart.getTime() - chunk.startAt.getTime());
        if (timeDiff < MIN_GAP_MS) {
          // Too close, push further away
          candidateStart = new Date(chunk.endAt.getTime() + MIN_GAP_MS);
          tooClose = true;
          break;
        }
      }
      
      // If we found a good slot, check for conflicts with other schedule events
      if (!tooClose) {
        const candidateEnd = new Date(candidateStart.getTime() + duration);
        const hasConflict = this.hasScheduleConflict(
          { ...event, startAt: candidateStart, endAt: candidateEnd },
          schedule
        );
        
        if (!hasConflict) {
          // Found a good slot!
          return candidateStart;
        }
        
        // Has conflict, try 1 hour later
        candidateStart = new Date(candidateStart.getTime() + 60 * 60 * 1000);
      }
      
      attempts++;
    }
    
    // If we couldn't find a perfect slot, return the last candidate
    // (better than nothing, and will be subject to user review)
    console.warn(`[HeuristicEngine] Could not find perfect slot for chunked Focus block after ${maxAttempts} attempts`);
    return candidateStart;
  }

  /**
   * COMPREHENSIVE OPTIMIZATION: Generate a holistic schedule optimization proposal
   * 
   * This is the main entry point for the new comprehensive optimization system.
   * It orchestrates all the analysis and optimization components to generate
   * intelligent, multi-event proposals that optimize the entire schedule.
   */
  async generateComprehensiveProposal(trigger: {
    userId: string;
    energyLevel: number;
    type: 'quick_add' | 'daily' | 'energy_change' | 'manual';
    targetAssignmentId?: string;
    lookaheadDays?: number;
  }): Promise<{ proposalId: string; moves: ProposalMove[] }> {
    const proposalId = randomUUID();
    const lookaheadDays = trigger.lookaheadDays || 14;
    
    console.log(`[HeuristicEngine] COMPREHENSIVE OPTIMIZATION for user ${trigger.userId}, type: ${trigger.type}`);

    // Initialize analysis engines
    const scheduleAnalyzer = new ScheduleAnalyzer(trigger.userId);
    const slotMatcher = new SlotMatcher(trigger.userId);
    const workloadBalancer = new WorkloadBalancer(trigger.userId);

    const moves: ProposalMove[] = [];

    // STEP 1: Run comprehensive schedule analysis
    console.log(`[HeuristicEngine] Step 1: Running schedule analysis`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:BEFORE_ANALYSIS',message:'Before schedule analysis',data:{userId:trigger.userId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
    // #endregion
    const [conflicts, workloadAnalysis, balanceReport] = await Promise.all([
      scheduleAnalyzer.detectConflicts(trigger.userId, lookaheadDays).catch((err) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:DETECT_CONFLICTS_ERROR',message:'Error in detectConflicts',data:{error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
        // #endregion
        throw err;
      }),
      scheduleAnalyzer.analyzeWorkload(trigger.userId, lookaheadDays).catch((err) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:ANALYZE_WORKLOAD_ERROR',message:'Error in analyzeWorkload',data:{error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
        // #endregion
        throw err;
      }),
      workloadBalancer.balanceWorkload(trigger.userId, lookaheadDays, trigger.energyLevel).catch((err) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:BALANCE_WORKLOAD_ERROR',message:'Error in balanceWorkload',data:{error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
        // #endregion
        throw err;
      })
    ]);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:AFTER_ANALYSIS',message:'After schedule analysis',data:{conflictsCount:conflicts.length,balanceCount:balanceReport.proposals.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
    // #endregion

    console.log(`[HeuristicEngine] Found ${conflicts.length} conflicts, ${balanceReport.crammingRiskCount} cramming risks`);

    // STEP 2: Address conflicts (CRITICAL PRIORITY)
    console.log(`[HeuristicEngine] Step 2: Addressing conflicts`);
    for (const conflict of conflicts) {
      if (conflict.severity === 'critical' || conflict.severity === 'high') {
        // Pick the best resolution option
        const bestResolution = conflict.resolutionOptions.sort((a, b) => a.cost - b.cost)[0];
        
        if (bestResolution) {
          // Find the event being moved from the conflict
          const eventBeingMoved = conflict.events.find(e => e.id === bestResolution.targetEventId);
          
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: bestResolution.action === 'delete' ? 'delete' : 'move',
            sourceEventId: bestResolution.targetEventId,
            targetStartAt: bestResolution.proposal.startAt,
            targetEndAt: bestResolution.proposal.endAt,
            deltaMinutes: bestResolution.proposal.startAt ? 
              Math.round((bestResolution.proposal.startAt.getTime() - new Date().getTime()) / (1000 * 60)) : 0,
            churnCost: bestResolution.cost,
            category: 'conflict_resolution',
            reasonCodes: [`CONFLICT_RESOLUTION_${conflict.type.toUpperCase()}`, `SEVERITY_${conflict.severity.toUpperCase()}`],
            basePriority: 1.0,
            energyMultiplier: 1.0,
            finalPriority: 1.0,
            metadata: {
              conflictType: conflict.type,
              resolution: bestResolution.explanation,
              eventTitle: eventBeingMoved?.title || 'Event',
              title: eventBeingMoved?.title || 'Event',
              originalStartAt: eventBeingMoved?.startAt.toISOString(),
              originalEndAt: eventBeingMoved?.endAt.toISOString(),
              eventType: eventBeingMoved?.eventType
            }
          });
        }
      }
    }

    // STEP 3: Address cramming risks (HIGH PRIORITY)
    console.log(`[HeuristicEngine] Step 3: Addressing cramming prevention`);
    const crammingProposals = balanceReport.proposals.filter(p => 
      p.priority === 'critical' || p.priority === 'high'
    );

    for (const proposal of crammingProposals) {
      for (const action of proposal.actions) {
        if (action.type === 'add_focus' && action.slot && action.proposedStartAt && action.proposedEndAt) {
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'insert',
            targetStartAt: action.proposedStartAt,
            targetEndAt: action.proposedEndAt,
            deltaMinutes: 0,
            churnCost: action.churnCost,
            category: 'deep_work',
            reasonCodes: [`CRAMMING_PREVENTION_${proposal.priority.toUpperCase()}`, 'WORKLOAD_BALANCE'],
            basePriority: proposal.priority === 'critical' ? 0.95 : 0.85,
            energyMultiplier: 1.0,
            finalPriority: proposal.priority === 'critical' ? 0.95 : 0.85,
            metadata: {
              assignmentId: proposal.assignmentId,
              assignmentTitle: proposal.assignmentTitle,
              dueDate: proposal.dueDate.toISOString(),
              title: action.explanation,
              eventTitle: `Focus: ${proposal.assignmentTitle}`,
              deficit: proposal.targetScheduledMinutes - proposal.currentScheduledMinutes,
              reasoning: proposal.reasoning
            }
          });
        }
      }
    }

    // STEP 4: Address workload redistribution (MEDIUM PRIORITY)
    console.log(`[HeuristicEngine] Step 4: Workload redistribution`);
    const redistributionProposals = balanceReport.proposals.filter(p => 
      p.priority === 'medium' && p.actions.some(a => a.type === 'move_focus')
    );

    for (const proposal of redistributionProposals) {
      for (const action of proposal.actions) {
        if (action.type === 'move_focus' && action.eventId && action.proposedStartAt && action.proposedEndAt) {
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'move',
            sourceEventId: action.eventId,
            targetStartAt: action.proposedStartAt,
            targetEndAt: action.proposedEndAt,
            deltaMinutes: Math.round((action.proposedStartAt.getTime() - new Date().getTime()) / (1000 * 60)),
            churnCost: action.churnCost,
            category: 'deep_work',
            reasonCodes: ['WORKLOAD_REDISTRIBUTION', 'PREVENT_OVERLOAD'],
            basePriority: 0.6,
            energyMultiplier: 1.0,
            finalPriority: 0.6,
            metadata: {
              originalDay: action.eventId,
              targetDay: action.proposedStartAt.toISOString().split('T')[0],
              reasoning: action.explanation
            }
          });
        }
      }
    }

    // STEP 5: Energy-based optimization (LOW PRIORITY)
    console.log(`[HeuristicEngine] Step 5: Energy-based optimization`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:STEP5_START',message:'Step 5 start',data:{triggerType:trigger.type,energyLevel:trigger.energyLevel},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
    // #endregion
    if (trigger.type === 'energy_change' && (trigger.energyLevel >= 8 || trigger.energyLevel <= 3)) {
      // If energy changed significantly, suggest moving Focus blocks to better times
      const now = new Date();
      const endDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // Next 3 days only

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:BEFORE_FOCUS_QUERY',message:'Before upcomingFocus query',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
      // #endregion
      const upcomingFocus = await db
        .select()
        .from(calendarEventsNew)
        .where(
          and(
            eq(calendarEventsNew.userId, trigger.userId),
            eq(calendarEventsNew.eventType, 'Focus'),
            eq(calendarEventsNew.isMovable, true),
            gte(calendarEventsNew.startAt, now),
            lte(calendarEventsNew.startAt, endDate)
          )
        )
        .limit(2); // Only optimize next 2 Focus blocks
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:AFTER_FOCUS_QUERY',message:'After upcomingFocus query',data:{focusCount:upcomingFocus.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
      // #endregion

      for (const focusBlock of upcomingFocus) {
        const duration = (focusBlock.endAt.getTime() - focusBlock.startAt.getTime()) / (1000 * 60);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:BEFORE_SLOT_MATCHER',message:'Before slotMatcher.findOptimalSlot',data:{focusBlockId:focusBlock.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
        // #endregion
        const match = await slotMatcher.findOptimalSlot(
          {
            id: focusBlock.id,
            title: focusBlock.title || 'Focus Block',
            duration,
            linkedAssignmentId: focusBlock.linkedAssignmentId || undefined,
            category: 'focus'
          },
          trigger.userId,
          trigger.energyLevel,
          { lookaheadDays: 3 }
        );
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:AFTER_SLOT_MATCHER',message:'After slotMatcher.findOptimalSlot',data:{hasMatch:!!match,matchScore:match?.score},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
        // #endregion

        if (match && match.score > 70) {
          // Only move if the new slot is significantly better
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'move',
            sourceEventId: focusBlock.id,
            targetStartAt: match.slot.startAt,
            targetEndAt: match.slot.endAt,
            deltaMinutes: Math.round((match.slot.startAt.getTime() - focusBlock.startAt.getTime()) / (1000 * 60)),
            churnCost: duration * 0.5, // Lower cost for energy optimization
            category: 'deep_work',
            reasonCodes: ['ENERGY_OPTIMIZATION', ...match.reasonCodes],
            basePriority: 0.4,
            energyMultiplier: trigger.energyLevel / 10,
            finalPriority: 0.4 * (trigger.energyLevel / 10),
            metadata: {
              eventTitle: focusBlock.title || 'Focus Block',
              title: `Optimize for ${trigger.energyLevel >= 8 ? 'high' : 'low'} energy`,
              originalStartAt: focusBlock.startAt.toISOString(),
              energyLevel: trigger.energyLevel,
              matchScore: match.score,
              explanation: match.explanation
            }
          });
        }
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:STEP5_END',message:'Step 5 complete',data:{movesCount:moves.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
    // #endregion

    console.log(`[HeuristicEngine] Generated ${moves.length} comprehensive optimization moves`);

    // STEP 6: Apply churn limits
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:BEFORE_CHURN_CHECK',message:'Before churn check',data:{movesCount:moves.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
    // #endregion
    const churnCheck = await this.checkChurnLimits(trigger.userId, moves, trigger.energyLevel);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'heuristic-engine.ts:AFTER_CHURN_CHECK',message:'After churn check',data:{allowed:churnCheck.allowed},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SQL_ERROR',runId:'trace'})}).catch(()=>{});
    // #endregion
    if (!churnCheck.allowed) {
      console.warn(`[HeuristicEngine] Churn limit exceeded, filtering moves`);
      // Keep only highest priority moves
      moves.sort((a, b) => (b.finalPriority || 0) - (a.finalPriority || 0));
      const allowedMoves = moves.slice(0, this.config.churnLimits.dailyMaxMoves);
      console.log(`[HeuristicEngine] Reduced from ${moves.length} to ${allowedMoves.length} moves`);
      
      // Update moves array
      moves.length = 0;
      moves.push(...allowedMoves);
    }

    // STEP 7: Persist proposal
    if (moves.length > 0) {
      await db.insert(rebalancingProposals).values({
        id: proposalId,
        userId: trigger.userId,
        trigger: trigger.type,
        energyLevel: trigger.energyLevel,
        movesCount: moves.length,
        churnCostTotal: moves.reduce((sum, m) => sum + m.churnCost, 0),
        status: 'proposed'
      });

      await db.insert(proposalMoves).values(
        moves.map(move => ({
          id: randomUUID(),
          proposalId: move.proposalId,
          userId: move.userId,
          moveType: move.moveType,
          sourceEventId: move.sourceEventId || null,
          targetStartAt: move.targetStartAt || null,
          targetEndAt: move.targetEndAt || null,
          deltaMinutes: move.deltaMinutes || null,
          churnCost: move.churnCost,
          category: move.category || null,
          reasonCodes: move.reasonCodes,
          basePriority: move.basePriority ? move.basePriority.toString() : null,
          energyMultiplier: move.energyMultiplier ? move.energyMultiplier.toString() : null,
          finalPriority: move.finalPriority ? move.finalPriority.toString() : null,
          feasibilityFlags: move.feasibilityFlags || null,
          baselineUpdatedAt: move.baselineUpdatedAt || null,
          baselineVersion: move.baselineVersion || null,
          metadata: move.metadata || null
        }))
      );
    }

    console.log(`[HeuristicEngine] Comprehensive optimization complete: ${moves.length} moves proposed`);
    return { proposalId, moves };
  }

  /**
   * Check if event has a schedule conflict (used by chunking logic)
   */
  private hasScheduleConflict(event: any, schedule: any[]): boolean {
    const immovableEvents = schedule.filter(e => !e.isMovable && e.id !== event.id);
    
    for (const otherEvent of immovableEvents) {
      if (event.startAt < otherEvent.endAt && event.endAt > otherEvent.startAt) {
        console.log(`[HeuristicEngine] Conflict: ${event.title} overlaps with immovable ${otherEvent.title}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a proposed target slot conflicts with immovable events
   */
  private checkTargetSlotConflict(
    targetStart: Date,
    targetEnd: Date,
    schedule: any[],
    eventBeingMoved?: any
  ): boolean {
    const immovableEvents = schedule.filter(e => !e.isMovable);
    
    for (const event of immovableEvents) {
      if (targetStart < event.endAt && targetEnd > event.startAt) {
        console.log(`[HeuristicEngine] Target slot conflict: ${targetStart.toISOString()} - ${targetEnd.toISOString()} conflicts with ${event.title}`);
        return true;
      }
    }
    
    // **CRITICAL**: Check if move would violate the event's deadline/due date
    if (eventBeingMoved && eventBeingMoved.metadata) {
      const metadata = eventBeingMoved.metadata;
      
      // Check for due date in various possible formats
      const dueDateStr = metadata.dueDate || metadata.deadline || metadata.assignmentDueDate;
      
      if (dueDateStr) {
        const dueDate = new Date(dueDateStr);
        
        // The event MUST finish BEFORE the due date
        if (targetEnd > dueDate) {
          console.log(`[HeuristicEngine] DEADLINE VIOLATION PREVENTED: ${eventBeingMoved.title || 'Event'} would end at ${targetEnd.toISOString()} which is AFTER due date ${dueDate.toISOString()}`);
          return true; // Reject this move
        }
      }
    }
    
    return false;
  }
}

