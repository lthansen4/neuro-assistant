import { db } from './db';
import { calendarEventsNew, assignments, proposalMoves, rebalancingProposals } from '../../../../packages/db/src/schema';
import { eq, and, gte, lte, sql, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { PrioritizationEngine } from './prioritization-engine';
import { getHeuristicConfig, getTimeOfDay } from './heuristic-config';
import { ScheduleAnalyzer } from './schedule-analyzer';
import { SlotMatcher } from './slot-matcher';
import { WorkloadBalancer } from './workload-balancer';
import { 
  getUserTimezone, 
  isInSleepWindow as checkSleepWindow, 
  getNextWakeTime,
  formatInTimezone,
  validateTimeSlot,
  DEFAULT_TIMEZONE 
} from './timezone-utils';

// ============================================================================
// ALERT THRESHOLDS - Defines what counts as a "real problem"
// These match the alert-engine thresholds for consistency
// ============================================================================

const PROBLEM_THRESHOLDS = {
  // DEADLINE_AT_RISK: Only alert if assignment is approaching and under-scheduled
  deadlineWarningDays: 7,           // Warn if due within 7 days
  minScheduledPercent: 0.5,         // Alert if < 50% of needed time scheduled
  criticalScheduledPercent: 0.25,   // Critical if < 25% scheduled
  
  // AVOIDANCE_DETECTED: Pattern of rescheduling
  deferralThreshold: 3,             // Alert after 3+ reschedules
  
  // IMPOSSIBLE_SCHEDULE: Physical impossibilities
  maxDailyDeepWorkHours: 7,         // Alert if more than 7 hours deep work
  
  // When NOT to propose changes:
  // - Schedule is imperfect but workable
  // - Time is sufficiently scheduled (even if not "optimal")
  // - Minor imbalances between days
  // - Preference differences (morning vs afternoon)
};

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
  private prioritizationEngine: PrioritizationEngine;
  private config: ReturnType<typeof getHeuristicConfig>;
  private userId: string | undefined;
  private userTimezone: string = DEFAULT_TIMEZONE;
  
  constructor(userId?: string) {
    this.userId = userId;
    this.prioritizationEngine = new PrioritizationEngine(userId);
    this.config = getHeuristicConfig(userId);
  }
  
  /**
   * Initialize timezone - must be called before generating proposals
   */
  private async initTimezone(): Promise<void> {
    if (this.userId) {
      this.userTimezone = await getUserTimezone(this.userId);
      console.log(`[HeuristicEngine] Using timezone: ${this.userTimezone} for user ${this.userId}`);
    }
  }

  /**
   * GATEKEEPER: Check if there are REAL problems worth proposing changes for.
   * 
   * Philosophy: Only generate proposals when there's a genuine problem.
   * This is the "smoke detector" - silent 99% of the time, loud when there's fire.
   * 
   * Returns an object describing what problems (if any) need addressing.
   */
  private async detectRealProblems(userId: string): Promise<{
    hasRealProblems: boolean;
    deadlinesAtRisk: Array<{ id: string; title: string; dueDate: Date; scheduledPercent: number; hoursNeeded: number }>;
    avoidancePatterns: Array<{ id: string; title: string; deferralCount: number; dueDate: Date }>;
    sleepViolations: Array<{ eventId: string; title: string; startAt: Date }>;
    overloadedDays: Array<{ date: string; hours: number }>;
  }> {
    const now = new Date();
    const warningDate = new Date(now.getTime() + PROBLEM_THRESHOLDS.deadlineWarningDays * 24 * 60 * 60 * 1000);
    
    const deadlinesAtRisk: Array<{ id: string; title: string; dueDate: Date; scheduledPercent: number; hoursNeeded: number }> = [];
    const avoidancePatterns: Array<{ id: string; title: string; deferralCount: number; dueDate: Date }> = [];
    const sleepViolations: Array<{ eventId: string; title: string; startAt: Date }> = [];
    const overloadedDays: Array<{ date: string; hours: number }> = [];

    // 1. Check for DEADLINE_AT_RISK
    const upcomingAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.userId, userId),
          ne(assignments.status, 'Completed'),
          gte(assignments.dueDate, now),
          lte(assignments.dueDate, warningDate)
        )
      );

    for (const assignment of upcomingAssignments) {
      if (!assignment.dueDate) continue;
      
      const estimatedMinutes = assignment.effortEstimateMinutes || 60;
      
      // Calculate scheduled time
      const scheduledEvents = await db
        .select()
        .from(calendarEventsNew)
        .where(
          and(
            eq(calendarEventsNew.userId, userId),
            eq(calendarEventsNew.linkedAssignmentId, assignment.id),
            gte(calendarEventsNew.startAt, now)
          )
        );
      
      const scheduledMinutes = scheduledEvents.reduce((sum, event) => {
        const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60);
        return sum + duration;
      }, 0);
      
      const scheduledPercent = scheduledMinutes / estimatedMinutes;
      
      if (scheduledPercent < PROBLEM_THRESHOLDS.minScheduledPercent) {
        const hoursNeeded = Math.round((estimatedMinutes - scheduledMinutes) / 60 * 10) / 10;
        deadlinesAtRisk.push({
          id: assignment.id,
          title: assignment.title,
          dueDate: assignment.dueDate,
          scheduledPercent: Math.round(scheduledPercent * 100),
          hoursNeeded
        });
      }
    }

    // 2. Check for AVOIDANCE_DETECTED
    const avoidedAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.userId, userId),
          ne(assignments.status, 'Completed'),
          gte(assignments.deferralCount, PROBLEM_THRESHOLDS.deferralThreshold),
          gte(assignments.dueDate, now),
          lte(assignments.dueDate, warningDate)
        )
      );

    for (const assignment of avoidedAssignments) {
      if (!assignment.dueDate) continue;
      avoidancePatterns.push({
        id: assignment.id,
        title: assignment.title,
        deferralCount: assignment.deferralCount,
        dueDate: assignment.dueDate
      });
    }

    // 3. Check for SLEEP_VIOLATIONS
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingEvents = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, userId),
          gte(calendarEventsNew.startAt, now),
          lte(calendarEventsNew.startAt, nextWeek)
        )
      );

    for (const event of upcomingEvents) {
      if (checkSleepWindow(event.startAt, this.userTimezone)) {
        sleepViolations.push({
          eventId: event.id,
          title: event.title || 'Event',
          startAt: event.startAt
        });
      }
    }

    // 4. Check for OVERLOADED_DAYS
    const dayWorkload = new Map<string, number>();
    for (const event of upcomingEvents) {
      if (event.eventType === 'Focus' || event.eventType === 'Studying') {
        const dateKey = event.startAt.toISOString().split('T')[0];
        const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60 * 60);
        dayWorkload.set(dateKey, (dayWorkload.get(dateKey) || 0) + duration);
      }
    }

    for (const [dateKey, hours] of dayWorkload) {
      if (hours > PROBLEM_THRESHOLDS.maxDailyDeepWorkHours) {
        overloadedDays.push({ date: dateKey, hours: Math.round(hours * 10) / 10 });
      }
    }

    const hasRealProblems = 
      deadlinesAtRisk.length > 0 ||
      avoidancePatterns.length > 0 ||
      sleepViolations.length > 0 ||
      overloadedDays.length > 0;

    console.log(`[HeuristicEngine] PROBLEM DETECTION RESULTS:`);
    console.log(`[HeuristicEngine]   Deadlines at risk: ${deadlinesAtRisk.length}`);
    console.log(`[HeuristicEngine]   Avoidance patterns: ${avoidancePatterns.length}`);
    console.log(`[HeuristicEngine]   Sleep violations: ${sleepViolations.length}`);
    console.log(`[HeuristicEngine]   Overloaded days: ${overloadedDays.length}`);
    console.log(`[HeuristicEngine]   HAS REAL PROBLEMS: ${hasRealProblems}`);

    return {
      hasRealProblems,
      deadlinesAtRisk,
      avoidancePatterns,
      sleepViolations,
      overloadedDays
    };
  }
  
  /**
   * Check if a given date/time falls within the sleep window
   * Uses user's timezone for accurate local time checking
   */
  private isInSleepWindow(date: Date): boolean {
    return checkSleepWindow(date, this.userTimezone);
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
    // Initialize timezone before processing
    this.userId = trigger.userId;
    await this.initTimezone();
    
    const now = new Date();
    const lookaheadLimit = new Date(now.getTime() + 1440 * 60 * 1000); // 24-hour window (1440 minutes)

    console.log(`[HeuristicEngine] Generating proposal for user ${trigger.userId} (timezone: ${this.userTimezone})`);
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
    // Cast metadata from unknown to expected type (jsonb columns return unknown in Drizzle)
    const typedSchedule = finalSchedule.map(e => ({
      ...e,
      metadata: e.metadata as Record<string, any> | null | undefined
    }));
    const moves = await this.calculateMoves(typedSchedule, trigger, energyMultiplier, proposalId);
    
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
        const metadata = event.metadata as Record<string, any> | null | undefined;
        const isChunked = metadata?.chunkIndex !== undefined;
        
        if (isChunked && metadata) {
          // CHUNKED FOCUS: More conservative moves
          // Only move if there's a CRITICAL conflict or sleep window violation
          const hasConflict = this.hasScheduleConflict(event, schedule);
          const inSleep = this.isInSleepWindow(event.startAt) || this.isInSleepWindow(event.endAt);
          
          if (!hasConflict && !inSleep) {
            console.log(`[HeuristicEngine] Protecting chunked Focus block ${metadata.chunkIndex + 1}/${metadata.totalChunks}: ${event.title}`);
            continue; // Don't move unless necessary
          }
          
          console.log(`[HeuristicEngine] CRITICAL: Moving chunked Focus block ${metadata.chunkIndex + 1}/${metadata.totalChunks} due to conflict or sleep violation`);
          
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
              chunkIndex: metadata.chunkIndex,
              totalChunks: metadata.totalChunks,
              chunkType: metadata.chunkType,
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
    
    return chunks.filter(c => (c.metadata as any)?.chunkIndex !== undefined);
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
   * PHILOSOPHY: Only propose changes when there's a REAL problem.
   * This is a "smoke detector" - silent 99% of the time, loud when there's fire.
   * 
   * We do NOT propose changes for:
   * - Imperfect but workable schedules
   * - Sufficiently scheduled time (even if not "optimal")
   * - Minor imbalances between days
   * - Preference differences (morning vs afternoon)
   * 
   * We DO propose changes for:
   * - DEADLINE_AT_RISK: Assignment due soon with < 50% of needed time scheduled
   * - AVOIDANCE_DETECTED: Assignment deferred 3+ times, still insufficient time
   * - SLEEP_VIOLATION: Event scheduled during sleep hours (11pm-7am)
   * - BURNOUT_RISK: More than 7 hours of deep work on one day
   */
  async generateComprehensiveProposal(trigger: {
    userId: string;
    energyLevel: number;
    type: 'quick_add' | 'daily' | 'energy_change' | 'manual';
    targetAssignmentId?: string;
    lookaheadDays?: number;
  }): Promise<{ proposalId: string; moves: ProposalMove[]; message?: string }> {
    const startTime = Date.now();
    
    // Initialize timezone before processing
    this.userId = trigger.userId;
    await this.initTimezone();
    
    const proposalId = randomUUID();
    const lookaheadDays = trigger.lookaheadDays || 14;
    
    console.log(`[HeuristicEngine] ═══════════════════════════════════════════════════════════`);
    console.log(`[HeuristicEngine] SCHEDULE CHECK STARTED`);
    console.log(`[HeuristicEngine] ───────────────────────────────────────────────────────────`);
    console.log(`[HeuristicEngine] User: ${trigger.userId.substring(0, 8)}...`);
    console.log(`[HeuristicEngine] Timezone: ${this.userTimezone}`);
    console.log(`[HeuristicEngine] Trigger type: ${trigger.type}`);
    console.log(`[HeuristicEngine] Energy level: ${trigger.energyLevel}/10`);
    console.log(`[HeuristicEngine] Lookahead days: ${lookaheadDays}`);
    console.log(`[HeuristicEngine] ───────────────────────────────────────────────────────────`);

    // =========================================================================
    // GATEKEEPER: First, check if there are REAL problems worth addressing
    // =========================================================================
    console.log(`[HeuristicEngine] Step 0: Checking for real problems...`);
    const problems = await this.detectRealProblems(trigger.userId);

    if (!problems.hasRealProblems) {
      console.log(`[HeuristicEngine] ✓ NO REAL PROBLEMS DETECTED`);
      console.log(`[HeuristicEngine] Schedule looks good! Not generating proposals.`);
      console.log(`[HeuristicEngine] ═══════════════════════════════════════════════════════════`);
      
      return {
        proposalId,
        moves: [],
        message: "Your schedule looks good! No changes needed right now."
      };
    }

    console.log(`[HeuristicEngine] ⚠️ REAL PROBLEMS DETECTED - generating targeted proposals`);
    console.log(`[HeuristicEngine]   Problems to address:`);
    if (problems.deadlinesAtRisk.length > 0) {
      problems.deadlinesAtRisk.forEach(d => 
        console.log(`[HeuristicEngine]     - DEADLINE: "${d.title}" (${d.scheduledPercent}% scheduled, need ${d.hoursNeeded}h more)`)
      );
    }
    if (problems.avoidancePatterns.length > 0) {
      problems.avoidancePatterns.forEach(a => 
        console.log(`[HeuristicEngine]     - AVOIDANCE: "${a.title}" (deferred ${a.deferralCount} times)`)
      );
    }
    if (problems.sleepViolations.length > 0) {
      problems.sleepViolations.forEach(s => 
        console.log(`[HeuristicEngine]     - SLEEP: "${s.title}" at ${formatInTimezone(s.startAt, this.userTimezone)}`)
      );
    }
    if (problems.overloadedDays.length > 0) {
      problems.overloadedDays.forEach(o => 
        console.log(`[HeuristicEngine]     - OVERLOAD: ${o.date} has ${o.hours}h of work`)
      );
    }

    // Initialize analysis engines
    const scheduleAnalyzer = new ScheduleAnalyzer(trigger.userId);
    const slotMatcher = new SlotMatcher(trigger.userId);
    const workloadBalancer = new WorkloadBalancer(trigger.userId);

    const moves: ProposalMove[] = [];

    // =========================================================================
    // TARGETED PROPOSAL GENERATION
    // Only generate proposals for the specific problems detected
    // =========================================================================

    // STEP 1: Address DEADLINES AT RISK
    if (problems.deadlinesAtRisk.length > 0) {
      console.log(`[HeuristicEngine] Step 1: Scheduling time for at-risk deadlines...`);
      
      for (const deadline of problems.deadlinesAtRisk) {
        // Find optimal slots to schedule the needed time
        const match = await slotMatcher.findOptimalSlot(
          {
            id: `deadline-${deadline.id}`,
            title: `Focus: ${deadline.title}`,
            duration: Math.min(deadline.hoursNeeded * 60, 120), // Max 2 hours per block
            linkedAssignmentId: deadline.id,
            category: 'focus'
          },
          trigger.userId,
          trigger.energyLevel,
          { 
            lookaheadDays: Math.min(7, Math.ceil((deadline.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          }
        );

        if (match && match.slot) {
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'insert',
            targetStartAt: match.slot.startAt,
            targetEndAt: match.slot.endAt,
            deltaMinutes: 0,
            churnCost: match.slot.durationMinutes * 0.5,
            category: 'deep_work',
            reasonCodes: ['DEADLINE_AT_RISK', 'SCHEDULE_TIME'],
            basePriority: 0.9,
            energyMultiplier: 1.0,
            finalPriority: 0.9,
            metadata: {
              assignmentId: deadline.id,
              assignmentTitle: deadline.title,
              title: `Schedule time for "${deadline.title}"`,
              eventTitle: `Focus: ${deadline.title}`,
              dueDate: deadline.dueDate.toISOString(),
              scheduledPercent: deadline.scheduledPercent,
              hoursNeeded: deadline.hoursNeeded,
              reasoning: `Only ${deadline.scheduledPercent}% of needed time is scheduled`
            }
          });
        }
      }
    }

    // STEP 2: Address AVOIDANCE PATTERNS
    if (problems.avoidancePatterns.length > 0) {
      console.log(`[HeuristicEngine] Step 2: Addressing avoidance patterns...`);
      
      for (const avoided of problems.avoidancePatterns) {
        // Find a slot and suggest "locking it in"
        const match = await slotMatcher.findOptimalSlot(
          {
            id: `avoided-${avoided.id}`,
            title: `Focus: ${avoided.title} (locked)`,
            duration: 60, // Start with 1 hour
            linkedAssignmentId: avoided.id,
            category: 'focus'
          },
          trigger.userId,
          trigger.energyLevel,
          { 
            lookaheadDays: 3 // Schedule soon to break the pattern
          }
        );

        if (match && match.slot) {
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'insert',
            targetStartAt: match.slot.startAt,
            targetEndAt: match.slot.endAt,
            deltaMinutes: 0,
            churnCost: 60,
            category: 'deep_work',
            reasonCodes: ['AVOIDANCE_DETECTED', 'LOCK_IN_TIME'],
            basePriority: 0.85,
            energyMultiplier: 1.0,
            finalPriority: 0.85,
            metadata: {
              assignmentId: avoided.id,
              assignmentTitle: avoided.title,
              title: `Lock in time for "${avoided.title}"`,
              eventTitle: `Focus: ${avoided.title}`,
              dueDate: avoided.dueDate.toISOString(),
              deferralCount: avoided.deferralCount,
              reasoning: `This has been rescheduled ${avoided.deferralCount} times - time to lock it in`
            }
          });
        }
      }
    }

    // STEP 3: Address SLEEP VIOLATIONS
    if (problems.sleepViolations.length > 0) {
      console.log(`[HeuristicEngine] Step 3: Fixing sleep violations...`);
      
      for (const violation of problems.sleepViolations) {
        // Get the event details
        const event = await db.query.calendarEventsNew.findFirst({
          where: eq(calendarEventsNew.id, violation.eventId)
        });
        
        if (event && event.isMovable) {
          const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60);
          
          // Find a slot outside sleep hours
          const nextWake = getNextWakeTime(event.startAt, this.userTimezone);
          
          moves.push({
            proposalId,
            userId: trigger.userId,
            moveType: 'move',
            sourceEventId: violation.eventId,
            targetStartAt: nextWake,
            targetEndAt: new Date(nextWake.getTime() + duration * 60 * 1000),
            deltaMinutes: Math.round((nextWake.getTime() - event.startAt.getTime()) / (1000 * 60)),
            churnCost: duration,
            category: 'schedule_fix',
            reasonCodes: ['SLEEP_VIOLATION', 'MOVE_TO_WAKING_HOURS'],
            basePriority: 0.95,
            energyMultiplier: 1.0,
            finalPriority: 0.95,
            metadata: {
              eventId: violation.eventId,
              title: `Move "${violation.title}" out of sleep hours`,
              eventTitle: violation.title,
              originalStartAt: event.startAt.toISOString(),
              reasoning: `This is scheduled at ${formatInTimezone(event.startAt, this.userTimezone)} which is during sleep hours`
            }
          });
        }
      }
    }

    // STEP 4: Address OVERLOADED DAYS
    if (problems.overloadedDays.length > 0) {
      console.log(`[HeuristicEngine] Step 4: Balancing overloaded days...`);
      
      // Run the workload balancer for redistribution
      const balanceReport = await workloadBalancer.balanceWorkload(trigger.userId, lookaheadDays, trigger.energyLevel);
      
      // Only take redistribution actions for the overloaded days we detected
      const redistributionProposals = balanceReport.proposals.filter(p => 
        p.actions.some(a => a.type === 'move_focus')
      );

      for (const proposal of redistributionProposals.slice(0, 2)) { // Limit to 2 redistributions
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
              category: 'workload_balance',
              reasonCodes: ['OVERLOADED_DAY', 'REDISTRIBUTE_WORK'],
              basePriority: 0.7,
              energyMultiplier: 1.0,
              finalPriority: 0.7,
              metadata: {
                title: `Spread out work from overloaded day`,
                eventTitle: action.explanation,
                reasoning: action.explanation
              }
            });
          }
        }
      }
    }

    console.log(`[HeuristicEngine] Generated ${moves.length} targeted moves for real problems`);

    // STEP 5: SAFETY FILTER - Validate all moves before proceeding
    console.log(`[HeuristicEngine] Step 5: Running safety validation filter...`);
    const validatedMoves: ProposalMove[] = [];
    const rejectedMoves: { move: ProposalMove; reason: string }[] = [];

    // Get the user's schedule for conflict checking
    const now = new Date();
    const endDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
    const userSchedule = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, trigger.userId),
          gte(calendarEventsNew.startAt, now),
          lte(calendarEventsNew.startAt, endDate)
        )
      );

    for (const move of moves) {
      // Skip moves without target times (deletes)
      if (!move.targetStartAt || !move.targetEndAt) {
        if (move.moveType === 'delete') {
          validatedMoves.push(move);
        }
        continue;
      }

      // SAFETY CHECK 1: Sleep window
      if (this.isInSleepWindow(move.targetStartAt)) {
        rejectedMoves.push({
          move,
          reason: `Start time ${formatInTimezone(move.targetStartAt, this.userTimezone)} is during sleep hours`
        });
        continue;
      }
      if (this.isInSleepWindow(move.targetEndAt)) {
        rejectedMoves.push({
          move,
          reason: `End time ${formatInTimezone(move.targetEndAt, this.userTimezone)} is during sleep hours`
        });
        continue;
      }

      // SAFETY CHECK 2: Due date violation
      const metadata = move.metadata || {};
      const dueDateStr = metadata.dueDate || metadata.deadline || metadata.assignmentDueDate;
      if (dueDateStr) {
        const dueDate = new Date(dueDateStr);
        if (move.targetEndAt > dueDate) {
          rejectedMoves.push({
            move,
            reason: `End time ${formatInTimezone(move.targetEndAt, this.userTimezone)} is after due date ${formatInTimezone(dueDate, this.userTimezone)}`
          });
          continue;
        }
      }

      // SAFETY CHECK 3: Immovable event conflicts
      const immovableEvents = userSchedule.filter(e => !e.isMovable && e.id !== move.sourceEventId);
      let hasConflict = false;
      for (const immovable of immovableEvents) {
        if (move.targetStartAt < immovable.endAt && move.targetEndAt > immovable.startAt) {
          rejectedMoves.push({
            move,
            reason: `Conflicts with immovable event "${immovable.title}" (${immovable.startAt.toISOString()} - ${immovable.endAt.toISOString()})`
          });
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) continue;

      // SAFETY CHECK 4: Time is in the past
      if (move.targetStartAt < now) {
        rejectedMoves.push({
          move,
          reason: `Start time ${formatInTimezone(move.targetStartAt, this.userTimezone)} is in the past`
        });
        continue;
      }

      // All checks passed
      validatedMoves.push(move);
    }

    // Log rejected moves
    if (rejectedMoves.length > 0) {
      console.warn(`[HeuristicEngine] SAFETY FILTER: Rejected ${rejectedMoves.length} invalid moves:`);
      for (const { move, reason } of rejectedMoves) {
        console.warn(`  - ${move.metadata?.eventTitle || move.sourceEventId || 'New event'}: ${reason}`);
      }
    }

    // Update moves array with validated moves only
    moves.length = 0;
    moves.push(...validatedMoves);
    console.log(`[HeuristicEngine] After safety filter: ${moves.length} valid moves (${rejectedMoves.length} rejected)`);

    // STEP 6: Apply churn limits
    console.log(`[HeuristicEngine] Step 6: Applying churn limits...`);
    const churnCheck = await this.checkChurnLimits(trigger.userId, moves, trigger.energyLevel);
    console.log(`[HeuristicEngine]   - Daily max moves: ${this.config.churnLimits.dailyMaxMoves}`);
    console.log(`[HeuristicEngine]   - Churn allowed: ${churnCheck.allowed}`);
    
    if (!churnCheck.allowed) {
      console.warn(`[HeuristicEngine]   - CHURN LIMIT EXCEEDED, filtering moves`);
      // Keep only highest priority moves
      moves.sort((a, b) => (b.finalPriority || 0) - (a.finalPriority || 0));
      const allowedMoves = moves.slice(0, this.config.churnLimits.dailyMaxMoves);
      console.log(`[HeuristicEngine]   - Reduced from ${moves.length} to ${allowedMoves.length} moves`);
      
      // Update moves array
      moves.length = 0;
      moves.push(...allowedMoves);
    }

    // STEP 7: Persist proposal
    console.log(`[HeuristicEngine] Step 7: Persisting proposal...`);
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
      console.log(`[HeuristicEngine]   - Persisted ${moves.length} moves to database`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[HeuristicEngine] ═══════════════════════════════════════════════════════════`);
    console.log(`[HeuristicEngine] OPTIMIZATION COMPLETE`);
    console.log(`[HeuristicEngine]   - Proposal ID: ${proposalId.substring(0, 8)}...`);
    console.log(`[HeuristicEngine]   - Total moves: ${moves.length}`);
    console.log(`[HeuristicEngine]   - Total time: ${totalTime}ms`);
    console.log(`[HeuristicEngine] ═══════════════════════════════════════════════════════════`);
    
    // Log a summary of each move for debugging
    if (moves.length > 0) {
      console.log(`[HeuristicEngine] Move Summary:`);
      moves.forEach((move, i) => {
        const title = move.metadata?.eventTitle || move.metadata?.title || 'Unknown';
        const targetTime = move.targetStartAt ? formatInTimezone(move.targetStartAt, this.userTimezone) : 'N/A';
        console.log(`[HeuristicEngine]   ${i + 1}. [${move.moveType.toUpperCase()}] "${title}" -> ${targetTime}`);
      });
    }
    
    return { proposalId, moves };
  }

  /**
   * Check if event has a schedule conflict with immovable events (used by chunking logic)
   */
  private hasImmovableConflict(event: any, schedule: any[]): boolean {
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

