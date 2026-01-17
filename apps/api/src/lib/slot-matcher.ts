import { ScheduleAnalyzer, FreeSlot } from './schedule-analyzer';
import { PrioritizationEngine } from './prioritization-engine';
import { getHeuristicConfig, getTimeOfDay } from './heuristic-config';
import { db } from './db';
import { assignments, calendarEventsNew } from '../../../../packages/db/src/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Slot Matcher
 * 
 * Intelligently matches Focus blocks to optimal time slots based on:
 * - Time-of-day preferences (morning for hard work)
 * - Energy level fit
 * - Proximity to assignment due date
 * - Workload balance
 * - Chunking constraints
 */

export interface FocusBlockInfo {
  id?: string; // Existing block ID (if rescheduling)
  title: string;
  duration: number; // minutes
  linkedAssignmentId?: string;
  category?: 'focus' | 'admin' | 'light';
  chunkIndex?: number;
  totalChunks?: number;
}

export interface SlotMatch {
  slot: FreeSlot;
  focusBlock: FocusBlockInfo;
  score: number; // 0-100
  confidence: 'high' | 'medium' | 'low';
  explanation: string[];
  alternativeSlots: Array<{ slot: FreeSlot; score: number }>;
  reasonCodes: string[];
}

export interface SlotScore {
  timeOfDayScore: number;
  energyFitScore: number;
  proximityScore: number;
  workloadBalanceScore: number;
  chunkingScore: number;
  totalScore: number;
  breakdown: {
    timeOfDay: string;
    energyFit: string;
    proximity: string;
    workloadBalance: string;
    chunking: string;
  };
}

export class SlotMatcher {
  private config: ReturnType<typeof getHeuristicConfig>;
  private scheduleAnalyzer: ScheduleAnalyzer;
  private prioritizationEngine: PrioritizationEngine;
  private timezoneInitialized: boolean = false;

  constructor(userId?: string) {
    this.config = getHeuristicConfig(userId);
    this.scheduleAnalyzer = new ScheduleAnalyzer(userId);
    this.prioritizationEngine = new PrioritizationEngine(userId);
  }

  /**
   * Initialize timezone for the schedule analyzer
   */
  private async ensureTimezoneInitialized(): Promise<void> {
    if (!this.timezoneInitialized) {
      await this.scheduleAnalyzer.initTimezone();
      this.timezoneInitialized = true;
    }
  }

  /**
   * Find the optimal time slot for a Focus block
   */
  async findOptimalSlot(
    focusBlock: FocusBlockInfo,
    userId: string,
    energyLevel: number,
    options: {
      lookaheadDays?: number;
      avoidWeekends?: boolean;
      considerWorkload?: boolean;
    } = {}
  ): Promise<SlotMatch | null> {
    // Ensure timezone is initialized before processing
    await this.ensureTimezoneInitialized();
    
    const lookaheadDays = options.lookaheadDays || 14;
    const now = new Date();
    let endDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

    console.log(`[SlotMatcher] Finding optimal slot for "${focusBlock.title}" (${focusBlock.duration} min)`);

    // If linked to assignment, constrain end date to assignment due date
    let assignment = null;
    if (focusBlock.linkedAssignmentId) {
      assignment = await db.query.assignments.findFirst({
        where: eq(assignments.id, focusBlock.linkedAssignmentId)
      });
      
      if (assignment && assignment.dueDate) {
        // Use the assignment due date as the hard deadline
        const assignmentDeadline = new Date(assignment.dueDate.getTime());
        
        // If the deadline is in the future, we must finish before it
        if (assignmentDeadline > now) {
          // If deadline is more than 24h away, try to finish 4h before (buffer)
          // otherwise just finish before the deadline itself
          const hoursUntilDue = (assignmentDeadline.getTime() - now.getTime()) / (1000 * 60 * 60);
          const bufferMs = hoursUntilDue > 24 ? 4 * 60 * 60 * 1000 : 0;
          
          const adjustedDeadline = new Date(assignmentDeadline.getTime() - bufferMs);
          if (adjustedDeadline < endDate) {
            endDate = adjustedDeadline;
            console.log(`[SlotMatcher] Constraining search to ${endDate.toISOString()} (before due date)`);
          }
        } else {
          // Deadline is in the past or right now, use 14 days lookahead but log it
          console.log(`[SlotMatcher] Assignment deadline is in the past, using standard lookahead`);
        }
      }
    }

    // Get all free slots in the window
    const freeSlots = await this.scheduleAnalyzer.findFreeSlots(
      userId,
      focusBlock.duration,
      now,
      endDate,
      {
        avoidWeekends: options.avoidWeekends,
        energyLevel,
        preferredTimeOfDay: focusBlock.category === 'focus' ? 'morning' : undefined
      }
    );

    if (freeSlots.length === 0) {
      console.log(`[SlotMatcher] No free slots found for "${focusBlock.title}"`);
      return null;
    }

    console.log(`[SlotMatcher] Found ${freeSlots.length} candidate slots`);

    // Get workload analysis if needed
    let workloadAnalysis = null;
    if (options.considerWorkload !== false) {
      workloadAnalysis = await this.scheduleAnalyzer.analyzeWorkload(userId, lookaheadDays);
    }

    // Get other chunks if this is part of a chunked assignment
    let otherChunks: any[] = [];
    if (focusBlock.linkedAssignmentId && focusBlock.chunkIndex !== undefined) {
      otherChunks = await db.query.calendarEventsNew.findMany({
        where: and(
          eq(calendarEventsNew.userId, userId),
          eq(calendarEventsNew.linkedAssignmentId, focusBlock.linkedAssignmentId),
          eq(calendarEventsNew.eventType, 'Focus')
        )
      });
      
      // Filter to only chunks, excluding the current one
      otherChunks = otherChunks.filter(e => 
        e.metadata?.chunkIndex !== undefined && 
        e.id !== focusBlock.id
      );
    }

    // Score each slot
    const scoredSlots = await Promise.all(
      freeSlots.map(async slot => ({
        slot,
        score: await this.scoreSlot(
          slot,
          focusBlock,
          energyLevel,
          assignment,
          workloadAnalysis,
          otherChunks
        )
      }))
    );

    // Sort by score (descending)
    scoredSlots.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // Get top match and alternatives
    const topMatch = scoredSlots[0];
    const alternatives = scoredSlots.slice(1, 4); // Top 3 alternatives

    // Determine confidence
    const confidence = this.determineConfidence(topMatch.score, alternatives);

    // Generate explanation
    const explanation = this.generateExplanation(topMatch.score, focusBlock, assignment);

    // Generate reason codes
    const reasonCodes = this.generateReasonCodes(topMatch.score, focusBlock);

    console.log(`[SlotMatcher] Best slot: ${topMatch.slot.startAt.toISOString()} (score: ${topMatch.score.totalScore.toFixed(2)})`);

    return {
      slot: topMatch.slot,
      focusBlock,
      score: topMatch.score.totalScore,
      confidence,
      explanation,
      alternativeSlots: alternatives.map(a => ({ slot: a.slot, score: a.score.totalScore })),
      reasonCodes
    };
  }

  /**
   * Score a time slot for a Focus block
   */
  private async scoreSlot(
    slot: FreeSlot,
    focusBlock: FocusBlockInfo,
    energyLevel: number,
    assignment: any | null,
    workloadAnalysis: any | null,
    otherChunks: any[]
  ): Promise<SlotScore> {
    // 1. Time of Day Score (0-25 points)
    const timeOfDayScore = this.scoreTimeOfDay(slot, focusBlock);

    // 2. Energy Fit Score (0-25 points)
    const energyFitScore = this.scoreEnergyFit(slot, energyLevel, focusBlock);

    // 3. Proximity Score - closer to due date = higher score (0-20 points)
    const proximityScore = this.scoreProximity(slot, assignment);

    // 4. Workload Balance Score (0-20 points)
    const workloadBalanceScore = this.scoreWorkloadBalance(slot, workloadAnalysis);

    // 5. Chunking Score - respect 8-hour gaps (0-10 points)
    const chunkingScore = this.scoreChunking(slot, focusBlock, otherChunks);

    const totalScore = timeOfDayScore.score + energyFitScore.score + proximityScore.score + 
                       workloadBalanceScore.score + chunkingScore.score;

    return {
      timeOfDayScore: timeOfDayScore.score,
      energyFitScore: energyFitScore.score,
      proximityScore: proximityScore.score,
      workloadBalanceScore: workloadBalanceScore.score,
      chunkingScore: chunkingScore.score,
      totalScore,
      breakdown: {
        timeOfDay: timeOfDayScore.explanation,
        energyFit: energyFitScore.explanation,
        proximity: proximityScore.explanation,
        workloadBalance: workloadBalanceScore.explanation,
        chunking: chunkingScore.explanation
      }
    };
  }

  /**
   * Score based on time of day preferences
   */
  private scoreTimeOfDay(
    slot: FreeSlot,
    focusBlock: FocusBlockInfo
  ): { score: number; explanation: string } {
    const timeOfDay = slot.timeOfDay;
    const category = focusBlock.category || 'focus';

    let score = 0;
    let explanation = '';

    if (category === 'focus') {
      // Hard work: prefer morning
      if (timeOfDay === 'morning') {
        score = 25;
        explanation = 'Morning slot - optimal for focused work';
      } else if (timeOfDay === 'afternoon') {
        score = 18;
        explanation = 'Afternoon slot - good for focused work';
      } else if (timeOfDay === 'evening') {
        score = 10;
        explanation = 'Evening slot - suboptimal for focused work';
      } else {
        score = 0;
        explanation = 'Night slot - avoid for focused work';
      }
    } else if (category === 'admin') {
      // Medium work: prefer afternoon
      if (timeOfDay === 'afternoon') {
        score = 25;
        explanation = 'Afternoon slot - ideal for administrative work';
      } else if (timeOfDay === 'morning') {
        score = 20;
        explanation = 'Morning slot - good for administrative work';
      } else if (timeOfDay === 'evening') {
        score = 15;
        explanation = 'Evening slot - acceptable for administrative work';
      }
    } else {
      // Light work: flexible, slight preference for afternoon/evening
      if (timeOfDay === 'afternoon' || timeOfDay === 'evening') {
        score = 22;
        explanation = `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} slot - good for light work`;
      } else if (timeOfDay === 'morning') {
        score = 18;
        explanation = 'Morning slot - acceptable for light work';
      }
    }

    // Weekend penalty
    if (slot.isWeekend) {
      score *= this.config.optimizationRules.weekendWorkMultiplier;
      explanation += ' (weekend)';
    }

    return { score, explanation };
  }

  /**
   * Score based on energy fit
   */
  private scoreEnergyFit(
    slot: FreeSlot,
    energyLevel: number,
    focusBlock: FocusBlockInfo
  ): { score: number; explanation: string } {
    const category = focusBlock.category || 'focus';
    
    // Use prioritization engine's energy fit calculation
    const fitScore = this.prioritizationEngine.calculateEnergyFitScore(category, energyLevel);
    
    // Scale to 0-25 points
    const score = fitScore * 25;
    
    let explanation = '';
    if (fitScore >= 0.9) {
      explanation = 'Perfect energy match for this task';
    } else if (fitScore >= 0.7) {
      explanation = 'Good energy match';
    } else if (fitScore >= 0.5) {
      explanation = 'Acceptable energy match';
    } else {
      explanation = 'Poor energy match - may be challenging';
    }

    return { score, explanation };
  }

  /**
   * Score based on proximity to assignment due date
   */
  private scoreProximity(
    slot: FreeSlot,
    assignment: any | null
  ): { score: number; explanation: string } {
    if (!assignment || !assignment.dueDate) {
      return { score: 15, explanation: 'No due date - moderate priority' };
    }

    const slotTime = slot.startAt.getTime();
    const dueTime = assignment.dueDate.getTime();
    const daysUntilDue = (dueTime - slotTime) / (1000 * 60 * 60 * 24);

    let score = 0;
    let explanation = '';

    if (daysUntilDue < 1) {
      score = 20; // Very close to due date
      explanation = 'Very close to deadline - high priority';
    } else if (daysUntilDue < 3) {
      score = 18; // Close to due date
      explanation = 'Close to deadline';
    } else if (daysUntilDue < 7) {
      score = 15; // Moderate proximity
      explanation = 'Moderate timeline until due';
    } else {
      // Prefer earlier slots for distant due dates (avoid procrastination)
      score = Math.max(5, 15 - (daysUntilDue - 7) * 0.5);
      explanation = 'Plenty of time - start early';
    }

    return { score, explanation };
  }

  /**
   * Score based on workload balance
   */
  private scoreWorkloadBalance(
    slot: FreeSlot,
    workloadAnalysis: any | null
  ): { score: number; explanation: string } {
    if (!workloadAnalysis) {
      return { score: 15, explanation: 'No workload data available' };
    }

    const dateKey = slot.startAt.toISOString().split('T')[0];
    const dayWorkload = workloadAnalysis.dailyWorkload.get(dateKey) || 0;
    const targetMinutes = this.config.optimizationRules.targetDailyWorkHours * 60;
    const maxMinutes = this.config.optimizationRules.maxDailyWorkHours * 60;

    let score = 0;
    let explanation = '';

    if (dayWorkload >= maxMinutes) {
      score = 0;
      explanation = 'Day already at max capacity';
    } else if (dayWorkload >= targetMinutes) {
      score = 10;
      explanation = 'Day approaching target workload';
    } else if (dayWorkload >= targetMinutes * 0.7) {
      score = 18;
      explanation = 'Good workload balance for this day';
    } else {
      score = 20;
      explanation = 'Underutilized day - perfect for scheduling';
    }

    return { score, explanation };
  }

  /**
   * Score based on chunking constraints
   */
  private scoreChunking(
    slot: FreeSlot,
    focusBlock: FocusBlockInfo,
    otherChunks: any[]
  ): { score: number; explanation: string } {
    // If not part of a chunked assignment, full score
    if (focusBlock.chunkIndex === undefined || otherChunks.length === 0) {
      return { score: 10, explanation: 'Not part of chunked assignment' };
    }

    const minGapMs = this.config.chunkingRules.minGapHours * 60 * 60 * 1000;
    const slotTime = slot.startAt.getTime();

    // Check distance from all other chunks
    let minDistance = Infinity;
    let hasViolation = false;

    for (const chunk of otherChunks) {
      const chunkStart = new Date(chunk.startAt).getTime();
      const distance = Math.abs(slotTime - chunkStart);
      
      if (distance < minDistance) {
        minDistance = distance;
      }
      
      if (distance < minGapMs) {
        hasViolation = true;
      }
    }

    if (hasViolation) {
      return { 
        score: 0, 
        explanation: `Too close to another chunk (need ${this.config.chunkingRules.minGapHours}hr gap)` 
      };
    }

    const gapHours = minDistance / (1000 * 60 * 60);
    if (gapHours >= minGapMs / (1000 * 60 * 60) * 1.5) {
      return { score: 10, explanation: `Excellent spacing from other chunks (${gapHours.toFixed(1)}hr gap)` };
    } else {
      return { score: 8, explanation: `Good spacing from other chunks (${gapHours.toFixed(1)}hr gap)` };
    }
  }

  /**
   * Determine confidence level based on score and alternatives
   */
  private determineConfidence(
    topScore: SlotScore,
    alternatives: Array<{ slot: FreeSlot; score: SlotScore }>
  ): 'high' | 'medium' | 'low' {
    const topTotal = topScore.totalScore;

    // High confidence if score > 80 and significantly better than alternatives
    if (topTotal >= 80) {
      if (alternatives.length === 0 || alternatives[0].score.totalScore < topTotal * 0.85) {
        return 'high';
      }
    }

    // Low confidence if score < 50 or alternatives are very close
    if (topTotal < 50) {
      return 'low';
    }

    if (alternatives.length > 0 && alternatives[0].score.totalScore > topTotal * 0.95) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    score: SlotScore,
    focusBlock: FocusBlockInfo,
    assignment: any | null
  ): string[] {
    const explanation: string[] = [];

    explanation.push(score.breakdown.timeOfDay);
    explanation.push(score.breakdown.energyFit);
    
    if (assignment) {
      explanation.push(score.breakdown.proximity);
    }
    
    explanation.push(score.breakdown.workloadBalance);
    
    if (focusBlock.chunkIndex !== undefined) {
      explanation.push(score.breakdown.chunking);
    }

    return explanation;
  }

  /**
   * Generate reason codes for tracking
   */
  private generateReasonCodes(
    score: SlotScore,
    focusBlock: FocusBlockInfo
  ): string[] {
    const codes: string[] = [];

    if (score.timeOfDayScore >= 20) {
      codes.push('OPTIMAL_TIME_OF_DAY');
    } else if (score.timeOfDayScore >= 15) {
      codes.push('GOOD_TIME_OF_DAY');
    }

    if (score.energyFitScore >= 22) {
      codes.push('EXCELLENT_ENERGY_FIT');
    } else if (score.energyFitScore < 12) {
      codes.push('SUBOPTIMAL_ENERGY_FIT');
    }

    if (score.proximityScore >= 18) {
      codes.push('URGENT_DEADLINE');
    }

    if (score.workloadBalanceScore >= 18) {
      codes.push('BALANCED_WORKLOAD');
    } else if (score.workloadBalanceScore === 0) {
      codes.push('OVERLOADED_DAY');
    }

    if (focusBlock.chunkIndex !== undefined) {
      if (score.chunkingScore >= 8) {
        codes.push('RESPECTS_CHUNKING_GAPS');
      } else if (score.chunkingScore === 0) {
        codes.push('VIOLATES_CHUNKING_GAPS');
      }
    }

    return codes;
  }

  /**
   * Find optimal slots for multiple Focus blocks at once
   */
  async findOptimalSlotsForMultiple(
    focusBlocks: FocusBlockInfo[],
    userId: string,
    energyLevel: number,
    options: {
      lookaheadDays?: number;
      avoidWeekends?: boolean;
    } = {}
  ): Promise<SlotMatch[]> {
    console.log(`[SlotMatcher] Finding optimal slots for ${focusBlocks.length} Focus blocks`);

    const matches: SlotMatch[] = [];

    for (const block of focusBlocks) {
      const match = await this.findOptimalSlot(block, userId, energyLevel, {
        ...options,
        considerWorkload: true
      });
      
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }
}





