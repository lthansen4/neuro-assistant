import { db } from './db';
import { calendarEventsNew, assignments } from '../../../../packages/db/src/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { getHeuristicConfig, getTimeOfDay } from './heuristic-config';
import { PrioritizationEngine } from './prioritization-engine';
import { 
  getUserTimezone, 
  isInSleepWindow as checkSleepWindow, 
  getNextWakeTime,
  getTimeOfDayInTimezone,
  DEFAULT_TIMEZONE 
} from './timezone-utils';

/**
 * Schedule Analyzer
 * 
 * Provides comprehensive schedule analysis including:
 * - Free slot detection
 * - Conflict detection
 * - Workload analysis and cramming risk assessment
 */

export interface FreeSlot {
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  energyFitScore: number;
  quality: 'optimal' | 'good' | 'acceptable' | 'poor';
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  isWeekend: boolean;
}

export interface ScheduleConflict {
  type: 'overlap' | 'too_close' | 'violates_rest' | 'in_sleep_window';
  events: Array<{
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    eventType: string;
    isMovable: boolean;
  }>;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolutionOptions: ConflictResolution[];
}

export interface ConflictResolution {
  action: 'move' | 'resize' | 'split' | 'delete';
  targetEventId: string;
  proposal: {
    startAt?: Date;
    endAt?: Date;
    duration?: number;
  };
  cost: number; // Churn cost
  explanation: string;
}

export interface WorkloadAnalysis {
  dailyWorkload: Map<string, number>; // Date string (YYYY-MM-DD) -> total minutes
  weeklyAverage: number;
  peakDays: Array<{ date: string; minutes: number; percentage: number }>;
  crammingRisk: Array<{
    assignmentId: string;
    assignmentTitle: string;
    dueDate: Date;
    daysUntilDue: number;
    totalMinutesNeeded: number;
    scheduledMinutes: number;
    deficit: number;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
  }>;
  recommendations: string[];
  overloadedDays: string[]; // Dates with > maxDailyWorkHours
  underutilizedDays: string[]; // Dates with < minDailyWorkHours
}

export class ScheduleAnalyzer {
  private config: ReturnType<typeof getHeuristicConfig>;
  private prioritizationEngine: PrioritizationEngine;
  private userId: string | undefined;
  private userTimezone: string = DEFAULT_TIMEZONE;

  constructor(userId?: string) {
    this.userId = userId;
    this.config = getHeuristicConfig(userId);
    this.prioritizationEngine = new PrioritizationEngine(userId);
  }
  
  /**
   * Initialize timezone - should be called before analysis
   */
  async initTimezone(): Promise<void> {
    if (this.userId) {
      this.userTimezone = await getUserTimezone(this.userId);
      console.log(`[ScheduleAnalyzer] Using timezone: ${this.userTimezone}`);
    }
  }

  /**
   * Find all free slots in the calendar within a date range
   */
  async findFreeSlots(
    userId: string,
    minDuration: number,
    startDate: Date,
    endDate: Date,
    preferences: {
      preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
      avoidWeekends?: boolean;
      energyLevel?: number;
    } = {}
  ): Promise<FreeSlot[]> {
    console.log(`[ScheduleAnalyzer] Finding free slots from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Fetch ALL events (movable + immovable) in the date range
    const events = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, userId),
          gte(calendarEventsNew.endAt, startDate),
          lte(calendarEventsNew.startAt, endDate)
        )
      )
      .orderBy(sql`${calendarEventsNew.startAt} ASC`);

    console.log(`[ScheduleAnalyzer] Found ${events.length} existing events`);

    // Find gaps between events
    const freeSlots: FreeSlot[] = [];
    let currentTime = new Date(Math.max(startDate.getTime(), Date.now())); // Start from now or startDate, whichever is later

    for (const event of events) {
      const eventStart = new Date(event.startAt);
      const eventEnd = new Date(event.endAt);

      // Check if there's a gap between currentTime and this event
      if (eventStart > currentTime) {
        const gap = this.analyzeTimeSlot(currentTime, eventStart, minDuration, preferences);
        if (gap) {
          freeSlots.push(gap);
        }
      }

      // Move currentTime to the end of this event
      if (eventEnd > currentTime) {
        currentTime = eventEnd;
      }
    }

    // Check for gap between last event and endDate
    if (currentTime < endDate) {
      const gap = this.analyzeTimeSlot(currentTime, endDate, minDuration, preferences);
      if (gap) {
        freeSlots.push(gap);
      }
    }

    console.log(`[ScheduleAnalyzer] Found ${freeSlots.length} free slots (before filtering)`);
    
    // Log first few slots for debugging
    if (freeSlots.length > 0) {
      console.log(`[ScheduleAnalyzer] Sample free slots:`, freeSlots.slice(0, 3).map(s => ({
        start: s.startAt.toISOString(),
        duration: s.durationMinutes,
        timeOfDay: s.timeOfDay,
        quality: s.quality
      })));
    }

    // Filter by preferences
    let filteredSlots = freeSlots;

    if (preferences.avoidWeekends) {
      filteredSlots = filteredSlots.filter(slot => !slot.isWeekend);
    }

    if (preferences.preferredTimeOfDay) {
      // Prioritize preferred time but don't exclude others
      filteredSlots.sort((a, b) => {
        const aMatch = a.timeOfDay === preferences.preferredTimeOfDay ? 1 : 0;
        const bMatch = b.timeOfDay === preferences.preferredTimeOfDay ? 1 : 0;
        return bMatch - aMatch; // Sort matching slots first
      });
    }

    // Sort by quality score (descending)
    filteredSlots.sort((a, b) => {
      const qualityOrder = { optimal: 4, good: 3, acceptable: 2, poor: 1 };
      const scoreA = qualityOrder[a.quality] + a.energyFitScore;
      const scoreB = qualityOrder[b.quality] + b.energyFitScore;
      return scoreB - scoreA;
    });

    console.log(`[ScheduleAnalyzer] Returning ${filteredSlots.length} filtered free slots`);
    return filteredSlots;
  }

  /**
   * Analyze a potential time slot and determine if it's viable
   */
  private analyzeTimeSlot(
    startAt: Date,
    endAt: Date,
    minDuration: number,
    preferences: { preferredTimeOfDay?: string; energyLevel?: number }
  ): FreeSlot | null {
    const durationMs = endAt.getTime() - startAt.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    // Must meet minimum duration
    if (durationMinutes < minDuration) {
      return null;
    }

    // Split slots that span sleep windows
    const sleepStart = this.config.neuroRules.sleepProtectionStart;
    const sleepEnd = this.config.neuroRules.sleepProtectionEnd;
    
    const startHour = startAt.getUTCHours();
    const endHour = endAt.getUTCHours();

    // Skip slots that are entirely in sleep window
    if (this.isInSleepWindow(startAt) && this.isInSleepWindow(endAt)) {
      return null;
    }

    // If slot spans into sleep window, truncate it
    let adjustedStart = startAt;
    let adjustedEnd = endAt;

    if (startHour < sleepEnd && endHour >= sleepEnd) {
      // Slot starts in sleep, ends after - move start to sleepEnd
      adjustedStart = new Date(startAt);
      adjustedStart.setUTCHours(sleepEnd, 0, 0, 0);
    }

    if (startHour < sleepStart && endHour >= sleepStart) {
      // Slot ends in sleep - truncate end to sleepStart
      adjustedEnd = new Date(endAt);
      adjustedEnd.setUTCHours(sleepStart, 0, 0, 0);
    }

    // Recalculate duration after adjustments
    const adjustedDuration = Math.floor((adjustedEnd.getTime() - adjustedStart.getTime()) / (1000 * 60));
    if (adjustedDuration < minDuration) {
      return null;
    }

    const timeOfDay = getTimeOfDay(adjustedStart, this.config);
    const dayOfWeek = adjustedStart.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Score energy fit based on time of day and user's energy level
    const energyFitScore = this.calculateEnergyFitScore(timeOfDay, preferences.energyLevel || 5);

    // Determine quality based on time of day and duration
    const quality = this.determineSlotQuality(timeOfDay, adjustedDuration, isWeekend, energyFitScore);

    return {
      startAt: adjustedStart,
      endAt: adjustedEnd,
      durationMinutes: adjustedDuration,
      timeOfDay,
      energyFitScore,
      quality,
      dayOfWeek,
      isWeekend
    };
  }

  /**
   * Check if a time is in the sleep window
   * Uses the shared timezone utility for consistent behavior
   */
  private isInSleepWindow(date: Date): boolean {
    return checkSleepWindow(date, this.userTimezone);
  }

  /**
   * Calculate energy fit score for a time slot
   */
  private calculateEnergyFitScore(timeOfDay: string, energyLevel: number): number {
    // Morning: best for high-energy work
    if (timeOfDay === 'morning') {
      return energyLevel >= 7 ? 1.0 : energyLevel >= 5 ? 0.8 : 0.6;
    }
    
    // Afternoon: good for medium-energy work
    if (timeOfDay === 'afternoon') {
      return energyLevel >= 5 ? 0.9 : energyLevel >= 3 ? 0.7 : 0.5;
    }
    
    // Evening: best for low-energy work
    if (timeOfDay === 'evening') {
      return energyLevel <= 4 ? 1.0 : energyLevel <= 6 ? 0.7 : 0.5;
    }
    
    // Night: should be avoided (sleep window)
    return 0.1;
  }

  /**
   * Determine slot quality based on various factors
   */
  private determineSlotQuality(
    timeOfDay: string,
    duration: number,
    isWeekend: boolean,
    energyFitScore: number
  ): 'optimal' | 'good' | 'acceptable' | 'poor' {
    let score = 0;

    // Time of day scoring
    if (timeOfDay === 'morning') score += 3;
    else if (timeOfDay === 'afternoon') score += 2;
    else if (timeOfDay === 'evening') score += 1;
    else score += 0; // night

    // Duration scoring (prefer 60-120 minute slots)
    if (duration >= 60 && duration <= 120) score += 2;
    else if (duration >= 30 && duration <= 180) score += 1;

    // Weekend penalty
    if (isWeekend) score -= 1;

    // Energy fit bonus
    if (energyFitScore >= 0.9) score += 2;
    else if (energyFitScore >= 0.7) score += 1;

    // Determine quality
    if (score >= 6) return 'optimal';
    if (score >= 4) return 'good';
    if (score >= 2) return 'acceptable';
    return 'poor';
  }

  /**
   * Detect scheduling conflicts in the calendar
   */
  async detectConflicts(
    userId: string,
    lookaheadDays: number
  ): Promise<ScheduleConflict[]> {
    console.log(`[ScheduleAnalyzer] Detecting conflicts for next ${lookaheadDays} days`);

    const now = new Date();
    const endDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

    // Fetch all events in the lookahead window
    const events = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, userId),
          gte(calendarEventsNew.endAt, now),
          lte(calendarEventsNew.startAt, endDate)
        )
      )
      .orderBy(sql`${calendarEventsNew.startAt} ASC`);

    const conflicts: ScheduleConflict[] = [];

    // Check for overlaps
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];

        // Check if events overlap
        if (event1.startAt < event2.endAt && event1.endAt > event2.startAt) {
          conflicts.push({
            type: 'overlap',
            events: [
              {
                id: event1.id,
                title: event1.title || 'Untitled',
                startAt: event1.startAt,
                endAt: event1.endAt,
                eventType: event1.eventType,
                isMovable: event1.isMovable
              },
              {
                id: event2.id,
                title: event2.title || 'Untitled',
                startAt: event2.startAt,
                endAt: event2.endAt,
                eventType: event2.eventType,
                isMovable: event2.isMovable
              }
            ],
            severity: this.determineConflictSeverity(event1, event2),
            resolutionOptions: await this.generateResolutionOptions(event1, event2, userId)
          });
        }
      }
    }

    // Check for Focus blocks violating rest constraints
    const focusBlocks = events.filter(e => e.eventType === 'Focus').sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const minRestHours = this.config.neuroRules.deepWorkMinRestHours;
    
    for (let i = 0; i < focusBlocks.length - 1; i++) {
      const current = focusBlocks[i];
      const next = focusBlocks[i + 1];
      
      const gapHours = (next.startAt.getTime() - current.endAt.getTime()) / (1000 * 60 * 60);
      
      if (gapHours < minRestHours) {
        conflicts.push({
          type: 'violates_rest',
          events: [
            {
              id: current.id,
              title: current.title || 'Focus Block',
              startAt: current.startAt,
              endAt: current.endAt,
              eventType: current.eventType,
              isMovable: current.isMovable
            },
            {
              id: next.id,
              title: next.title || 'Focus Block',
              startAt: next.startAt,
              endAt: next.endAt,
              eventType: next.eventType,
              isMovable: next.isMovable
            }
          ],
          severity: 'high',
          resolutionOptions: await this.generateRestViolationResolutions(current, next, userId, minRestHours)
        });
      }
    }

    // Check for events in sleep window
    for (const event of events) {
      if (this.isInSleepWindow(event.startAt) || this.isInSleepWindow(event.endAt)) {
        conflicts.push({
          type: 'in_sleep_window',
          events: [{
            id: event.id,
            title: event.title || 'Untitled',
            startAt: event.startAt,
            endAt: event.endAt,
            eventType: event.eventType,
            isMovable: event.isMovable
          }],
          severity: 'critical',
          resolutionOptions: await this.generateSleepViolationResolutions(event, userId)
        });
      }
    }

    console.log(`[ScheduleAnalyzer] Found ${conflicts.length} conflicts`);
    return conflicts;
  }

  /**
   * Determine conflict severity
   */
  private determineConflictSeverity(event1: any, event2: any): 'critical' | 'high' | 'medium' | 'low' {
    // If both events are immovable, it's critical
    if (!event1.isMovable && !event2.isMovable) {
      return 'critical';
    }
    
    // If one is immovable (Class, Work), it's high
    if (!event1.isMovable || !event2.isMovable) {
      return 'high';
    }
    
    // If both are Focus blocks, it's high
    if (event1.eventType === 'Focus' && event2.eventType === 'Focus') {
      return 'high';
    }
    
    // If one is Focus, it's medium
    if (event1.eventType === 'Focus' || event2.eventType === 'Focus') {
      return 'medium';
    }
    
    // Both are Chill or low-priority, it's low
    return 'low';
  }

  /**
   * Generate resolution options for overlapping events
   */
  private async generateResolutionOptions(
    event1: any,
    event2: any,
    userId: string
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];
    const duration1 = (event1.endAt.getTime() - event1.startAt.getTime()) / (1000 * 60);
    const duration2 = (event2.endAt.getTime() - event2.startAt.getTime()) / (1000 * 60);

    // If event1 is movable, propose moving it
    if (event1.isMovable) {
      // Find a free slot after event2
      const newStart = new Date(event2.endAt.getTime() + 30 * 60 * 1000); // 30 min buffer
      resolutions.push({
        action: 'move',
        targetEventId: event1.id,
        proposal: {
          startAt: newStart,
          endAt: new Date(newStart.getTime() + duration1 * 60 * 1000)
        },
        cost: this.calculateChurnCost(event1.eventType, duration1),
        explanation: `Move "${event1.title}" to after "${event2.title}"`
      });
    }

    // If event2 is movable, propose moving it
    if (event2.isMovable) {
      // Find a free slot before event1
      const newEnd = new Date(event1.startAt.getTime() - 30 * 60 * 1000); // 30 min buffer
      const newStart = new Date(newEnd.getTime() - duration2 * 60 * 1000);
      resolutions.push({
        action: 'move',
        targetEventId: event2.id,
        proposal: {
          startAt: newStart,
          endAt: newEnd
        },
        cost: this.calculateChurnCost(event2.eventType, duration2),
        explanation: `Move "${event2.title}" to before "${event1.title}"`
      });
    }

    // If both are Chill or low-priority, propose deleting one
    if (event1.isMovable && event1.eventType === 'Chill') {
      resolutions.push({
        action: 'delete',
        targetEventId: event1.id,
        proposal: {},
        cost: duration1,
        explanation: `Remove "${event1.title}" (low priority)`
      });
    }

    // CRITICAL: Filter out any resolutions that would violate sleep windows
    const validResolutions = resolutions.filter(resolution => {
      if (resolution.action === 'delete') {
        return true; // Delete actions don't need time validation
      }
      
      const proposedStart = resolution.proposal.startAt;
      const proposedEnd = resolution.proposal.endAt;
      
      if (!proposedStart || !proposedEnd) {
        return false; // Invalid proposal
      }
      
      // Check if proposed time is in sleep window
      const inSleep = this.isInSleepWindow(proposedStart) || this.isInSleepWindow(proposedEnd);
      
      if (inSleep) {
        console.log(`[ScheduleAnalyzer] REJECTED resolution: Would move event to sleep window (${proposedStart.toISOString()})`);
        return false;
      }
      
      return true;
    });

    console.log(`[ScheduleAnalyzer] Generated ${resolutions.length} resolutions, ${validResolutions.length} valid after sleep window filter`);
    return validResolutions;
  }

  /**
   * Generate resolutions for rest constraint violations
   */
  private async generateRestViolationResolutions(
    event1: any,
    event2: any,
    userId: string,
    minRestHours: number
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];
    const duration2 = (event2.endAt.getTime() - event2.startAt.getTime()) / (1000 * 60);

    if (event2.isMovable) {
      // Move second Focus block to respect rest period
      const newStart = new Date(event1.endAt.getTime() + minRestHours * 60 * 60 * 1000);
      
      // SAFETY: Don't propose if new time is in sleep window
      if (!this.isInSleepWindow(newStart)) {
        resolutions.push({
          action: 'move',
          targetEventId: event2.id,
          proposal: {
            startAt: newStart,
            endAt: new Date(newStart.getTime() + duration2 * 60 * 1000)
          },
          cost: this.calculateChurnCost(event2.eventType, duration2),
          explanation: `Move "${event2.title}" to allow ${minRestHours}-hour brain rest`
        });
      } else {
        console.log(`[ScheduleAnalyzer] REJECTED rest violation resolution: Would move to sleep window`);
      }
    }

    return resolutions;
  }

  /**
   * Generate resolutions for sleep window violations
   */
  private async generateSleepViolationResolutions(
    event: any,
    userId: string
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];
    
    if (!event.isMovable) {
      return resolutions; // Can't move immovable events
    }

    const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60);
    const sleepEndCST = this.config.neuroRules.sleepProtectionEnd; // 7 (7am CST)
    
    // Convert CST to UTC: CST is UTC-6, so add 6 hours
    const cstOffset = 6;
    const sleepEndUTC = (sleepEndCST + cstOffset) % 24; // 7 + 6 = 13 (1pm UTC = 7am CST)

    // Move to after sleep window (2 hours after sleep ends in CST = 9am CST = 3pm UTC)
    const targetHourUTC = sleepEndUTC + 2; // 13 + 2 = 15 (3pm UTC = 9am CST)
    
    const nextMorning = new Date(event.startAt);
    nextMorning.setUTCHours(targetHourUTC, 0, 0, 0);
    
    // If that's in the past, use tomorrow
    if (nextMorning <= new Date()) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }

    // Safety check: verify the proposed time is NOT in sleep window
    if (this.isInSleepWindow(nextMorning)) {
      console.error(`[ScheduleAnalyzer] BUG: Sleep violation resolution would still be in sleep window! ${nextMorning.toISOString()}`);
      return []; // Don't propose invalid resolutions
    }

    resolutions.push({
      action: 'move',
      targetEventId: event.id,
      proposal: {
        startAt: nextMorning,
        endAt: new Date(nextMorning.getTime() + duration * 60 * 1000)
      },
      cost: this.calculateChurnCost(event.eventType, duration),
      explanation: `Move "${event.title}" out of sleep window to next morning (9am)`
    });

    return resolutions;
  }

  /**
   * Calculate churn cost for a move
   */
  private calculateChurnCost(eventType: string, durationMinutes: number): number {
    let cost = durationMinutes;
    
    switch (eventType) {
      case 'Focus':
        cost *= 2; // High cost for moving focus
        break;
      case 'Chill':
        cost *= 0.5; // Lower cost for chill
        break;
      case 'Class':
      case 'Work':
        cost *= 10; // Very high cost (should be immovable)
        break;
    }
    
    return Math.round(cost);
  }

  /**
   * Analyze workload distribution and cramming risk
   */
  async analyzeWorkload(
    userId: string,
    lookaheadDays: number
  ): Promise<WorkloadAnalysis> {
    console.log(`[ScheduleAnalyzer] Analyzing workload for next ${lookaheadDays} days`);

    const now = new Date();
    const endDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

    // Fetch all Focus events in the lookahead window
    const focusEvents = await db
      .select()
      .from(calendarEventsNew)
      .where(
        and(
          eq(calendarEventsNew.userId, userId),
          eq(calendarEventsNew.eventType, 'Focus'),
          gte(calendarEventsNew.startAt, now),
          lte(calendarEventsNew.startAt, endDate)
        )
      );

    // Build daily workload map
    const dailyWorkload = new Map<string, number>();
    
    for (const event of focusEvents) {
      const dateKey = event.startAt.toISOString().split('T')[0]; // YYYY-MM-DD
      const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60);
      dailyWorkload.set(dateKey, (dailyWorkload.get(dateKey) || 0) + duration);
    }

    // Calculate weekly average
    const totalMinutes = Array.from(dailyWorkload.values()).reduce((sum, val) => sum + val, 0);
    const weeklyAverage = lookaheadDays >= 7 ? totalMinutes / (lookaheadDays / 7) : totalMinutes;

    // Find peak days
    const peakDays = Array.from(dailyWorkload.entries())
      .map(([date, minutes]) => ({
        date,
        minutes,
        percentage: totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3);

    // Analyze cramming risk for each assignment
    const upcomingAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.userId, userId),
          gte(assignments.dueDate, now),
          lte(assignments.dueDate, endDate)
        )
      );

    const crammingRisk = [];
    const maxDailyMinutes = this.config.optimizationRules?.maxDailyWorkHours * 60 || 240;
    const targetDailyMinutes = this.config.optimizationRules?.targetDailyWorkHours * 60 || 180;

    for (const assignment of upcomingAssignments) {
      if (!assignment.dueDate) continue;

      const daysUntilDue = (assignment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const totalMinutesNeeded = assignment.effortEstimateMinutes || 60;

      // Sum up scheduled Focus blocks for this assignment
      const linkedFocus = focusEvents.filter(e => e.linkedAssignmentId === assignment.id);
      const scheduledMinutes = linkedFocus.reduce((sum, e) => {
        return sum + (e.endAt.getTime() - e.startAt.getTime()) / (1000 * 60);
      }, 0);

      const deficit = totalMinutesNeeded - scheduledMinutes;

      // Determine risk level
      let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (deficit > 0) {
        if (daysUntilDue < 1 && deficit > 60) {
          riskLevel = 'critical';
        } else if (daysUntilDue < 2 && deficit > 120) {
          riskLevel = 'high';
        } else if (daysUntilDue < 5 && deficit > 180) {
          riskLevel = 'medium';
        }
      }

      if (deficit > 30 || riskLevel !== 'low') {
        crammingRisk.push({
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          dueDate: assignment.dueDate,
          daysUntilDue: Math.round(daysUntilDue * 10) / 10,
          totalMinutesNeeded,
          scheduledMinutes,
          deficit,
          riskLevel
        });
      }
    }

    // Sort cramming risk by severity
    crammingRisk.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.riskLevel] - severityOrder[a.riskLevel];
    });

    // Generate recommendations
    const recommendations: string[] = [];
    const overloadedDays: string[] = [];
    const underutilizedDays: string[] = [];

    // Check each day against targets
    for (let i = 0; i < lookaheadDays; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const minutes = dailyWorkload.get(dateKey) || 0;

      if (minutes > maxDailyMinutes) {
        overloadedDays.push(dateKey);
      } else if (minutes < 60 && upcomingAssignments.length > 0) {
        underutilizedDays.push(dateKey);
      }
    }

    if (crammingRisk.length > 0) {
      recommendations.push(`⚠️ ${crammingRisk.length} assignment(s) at risk of cramming - schedule more Focus blocks`);
    }

    if (overloadedDays.length > 0) {
      recommendations.push(`📅 ${overloadedDays.length} overloaded day(s) - consider spreading work more evenly`);
    }

    if (weeklyAverage > targetDailyMinutes * 7) {
      recommendations.push(`⏰ Weekly workload is high (${Math.round(weeklyAverage)} min/week) - ensure adequate rest`);
    }

    if (underutilizedDays.length > 3 && crammingRisk.length > 0) {
      recommendations.push(`💡 ${underutilizedDays.length} underutilized days available - use them to reduce cramming risk`);
    }

    console.log(`[ScheduleAnalyzer] Found ${crammingRisk.length} cramming risks, ${overloadedDays.length} overloaded days`);

    return {
      dailyWorkload,
      weeklyAverage,
      peakDays,
      crammingRisk,
      recommendations,
      overloadedDays,
      underutilizedDays
    };
  }
}

