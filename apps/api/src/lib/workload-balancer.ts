import { ScheduleAnalyzer, FreeSlot, WorkloadAnalysis } from './schedule-analyzer';
import { SlotMatcher, FocusBlockInfo } from './slot-matcher';
import { getHeuristicConfig } from './heuristic-config';
import { db } from './db';
import { assignments, calendarEventsNew } from '../../../../packages/db/src/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

/**
 * Workload Balancer
 * 
 * Distributes work evenly across days to prevent:
 * - Last-minute cramming
 * - Burnout from overloaded days
 * - Procrastination on large assignments
 * 
 * Proposes:
 * - Adding Focus blocks for under-scheduled assignments
 * - Removing/resizing Focus blocks for over-scheduled assignments
 * - Redistributing work for better balance
 */

export interface BalancingProposal {
  assignmentId: string;
  assignmentTitle: string;
  dueDate: Date;
  currentScheduledMinutes: number;
  targetScheduledMinutes: number;
  actions: BalancingAction[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  reasoning: string[];
}

export interface BalancingAction {
  type: 'add_focus' | 'remove_focus' | 'resize_focus' | 'move_focus';
  eventId?: string; // For remove/resize/move
  slot?: FreeSlot; // For add/move
  duration: number; // minutes
  proposedStartAt?: Date;
  proposedEndAt?: Date;
  explanation: string;
  churnCost: number;
}

export interface WorkloadBalanceReport {
  overallBalance: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  totalProposals: number;
  crammingRiskCount: number;
  overloadedDaysCount: number;
  underutilizedDaysCount: number;
  proposals: BalancingProposal[];
  summary: string[];
}

export class WorkloadBalancer {
  private config: ReturnType<typeof getHeuristicConfig>;
  private scheduleAnalyzer: ScheduleAnalyzer;
  private slotMatcher: SlotMatcher;

  constructor(userId?: string) {
    this.config = getHeuristicConfig(userId);
    this.scheduleAnalyzer = new ScheduleAnalyzer(userId);
    this.slotMatcher = new SlotMatcher(userId);
  }

  /**
   * Generate workload balancing proposals
   */
  async balanceWorkload(
    userId: string,
    lookaheadDays: number,
    energyLevel: number = 5
  ): Promise<WorkloadBalanceReport> {
    console.log(`[WorkloadBalancer] Analyzing workload balance for next ${lookaheadDays} days`);

    // Get comprehensive workload analysis
    const analysis = await this.scheduleAnalyzer.analyzeWorkload(userId, lookaheadDays);

    const proposals: BalancingProposal[] = [];

    // 1. Address cramming risks (highest priority)
    for (const risk of analysis.crammingRisk) {
      const proposal = await this.generateCrammingPreventionProposal(
        risk,
        userId,
        energyLevel,
        analysis
      );
      if (proposal) {
        proposals.push(proposal);
      }
    }

    // 2. Address overloaded days
    if (analysis.overloadedDays.length > 0) {
      const redistributionProposals = await this.generateRedistributionProposals(
        analysis.overloadedDays,
        analysis,
        userId,
        energyLevel,
        lookaheadDays
      );
      proposals.push(...redistributionProposals);
    }

    // 3. Fill underutilized days if there are unscheduled assignments
    if (analysis.underutilizedDays.length > 0 && analysis.crammingRisk.length > 0) {
      const utilizationProposals = await this.generateUtilizationProposals(
        analysis.underutilizedDays,
        analysis,
        userId,
        energyLevel
      );
      proposals.push(...utilizationProposals);
    }

    // Sort proposals by priority
    proposals.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Determine overall balance
    const overallBalance = this.determineOverallBalance(analysis, proposals);

    // Generate summary
    const summary = this.generateSummary(analysis, proposals);

    console.log(`[WorkloadBalancer] Generated ${proposals.length} balancing proposals`);

    return {
      overallBalance,
      totalProposals: proposals.length,
      crammingRiskCount: analysis.crammingRisk.length,
      overloadedDaysCount: analysis.overloadedDays.length,
      underutilizedDaysCount: analysis.underutilizedDays.length,
      proposals,
      summary
    };
  }

  /**
   * Generate proposal to prevent cramming for an at-risk assignment
   */
  private async generateCrammingPreventionProposal(
    risk: WorkloadAnalysis['crammingRisk'][0],
    userId: string,
    energyLevel: number,
    analysis: WorkloadAnalysis
  ): Promise<BalancingProposal | null> {
    console.log(`[WorkloadBalancer] Generating cramming prevention for "${risk.assignmentTitle}" (deficit: ${risk.deficit} min)`);

    if (risk.deficit <= 0) {
      return null; // No deficit, no need to add time
    }

    const actions: BalancingAction[] = [];
    const reasoning: string[] = [];

    // Determine how many Focus blocks we need to add
    const maxBlockDuration = 120; // 2 hours max per block
    const numBlocksNeeded = Math.ceil(risk.deficit / maxBlockDuration);
    
    reasoning.push(`Assignment needs ${risk.deficit} more minutes of scheduled work`);
    reasoning.push(`Recommending ${numBlocksNeeded} Focus block(s) to complete on time`);

    // For each needed block, find an optimal slot
    const now = new Date();
    const endDate = new Date(risk.dueDate.getTime() - 24 * 60 * 60 * 1000); // Day before due date

    let remainingDeficit = risk.deficit;

    for (let i = 0; i < numBlocksNeeded && remainingDeficit > 0; i++) {
      const blockDuration = Math.min(remainingDeficit, maxBlockDuration);
      
      // Create a Focus block info
      const focusBlock: FocusBlockInfo = {
        title: `${risk.assignmentTitle} - Work Session ${i + 1}`,
        duration: blockDuration,
        linkedAssignmentId: risk.assignmentId,
        category: 'focus'
      };

      // Find optimal slot
      const match = await this.slotMatcher.findOptimalSlot(
        focusBlock,
        userId,
        energyLevel,
        {
          lookaheadDays: Math.ceil(risk.daysUntilDue),
          avoidWeekends: false, // Allow weekends if needed for urgent work
          considerWorkload: true
        }
      );

      if (match) {
        actions.push({
          type: 'add_focus',
          slot: match.slot,
          duration: blockDuration,
          proposedStartAt: match.slot.startAt,
          proposedEndAt: match.slot.endAt,
          explanation: `Schedule ${blockDuration}-minute work session: ${match.explanation.join(', ')}`,
          churnCost: 0 // Adding is free
        });

        remainingDeficit -= blockDuration;
      } else {
        reasoning.push(`⚠️ Could not find optimal slot for ${blockDuration}-minute session`);
      }
    }

    if (actions.length === 0) {
      reasoning.push('❌ Unable to find any available slots - may need to reschedule existing events');
      return null;
    }

    return {
      assignmentId: risk.assignmentId,
      assignmentTitle: risk.assignmentTitle,
      dueDate: risk.dueDate,
      currentScheduledMinutes: risk.scheduledMinutes,
      targetScheduledMinutes: risk.totalMinutesNeeded,
      actions,
      priority: risk.riskLevel,
      reasoning
    };
  }

  /**
   * Generate proposals to redistribute work from overloaded days
   */
  private async generateRedistributionProposals(
    overloadedDays: string[],
    analysis: WorkloadAnalysis,
    userId: string,
    energyLevel: number,
    lookaheadDays: number
  ): Promise<BalancingProposal[]> {
    console.log(`[WorkloadBalancer] Generating redistribution proposals for ${overloadedDays.length} overloaded days`);

    const proposals: BalancingProposal[] = [];
    const maxDailyMinutes = this.config.optimizationRules.maxDailyWorkHours * 60;

    for (const dateKey of overloadedDays) {
      const dayWorkload = analysis.dailyWorkload.get(dateKey) || 0;
      const excess = dayWorkload - maxDailyMinutes;

      if (excess <= 0) continue;

      // Find Focus blocks on this day
      const dayStart = new Date(dateKey + 'T00:00:00Z');
      const dayEnd = new Date(dateKey + 'T23:59:59Z');

      const dayEvents = await db
        .select()
        .from(calendarEventsNew)
        .where(
          and(
            eq(calendarEventsNew.userId, userId),
            eq(calendarEventsNew.eventType, 'Focus'),
            eq(calendarEventsNew.isMovable, true),
            gte(calendarEventsNew.startAt, dayStart),
            lte(calendarEventsNew.startAt, dayEnd)
          )
        )
        .orderBy(sql`${calendarEventsNew.startAt} ASC`);

      // Sort by priority (move lower priority blocks first)
      // For now, just take the last block chronologically (often lowest priority)
      const blockToMove = dayEvents[dayEvents.length - 1];

      if (!blockToMove) continue;

      const blockDuration = (blockToMove.endAt.getTime() - blockToMove.startAt.getTime()) / (1000 * 60);

      // Find a better slot for this block
      const focusBlock: FocusBlockInfo = {
        id: blockToMove.id,
        title: blockToMove.title || 'Focus Block',
        duration: blockDuration,
        linkedAssignmentId: blockToMove.linkedAssignmentId || undefined,
        category: 'focus'
      };

      const match = await this.slotMatcher.findOptimalSlot(
        focusBlock,
        userId,
        energyLevel,
        { lookaheadDays, considerWorkload: true }
      );

      if (match && match.slot.startAt.toISOString().split('T')[0] !== dateKey) {
        // Found a slot on a different day
        proposals.push({
          assignmentId: blockToMove.linkedAssignmentId || 'unknown',
          assignmentTitle: blockToMove.title || 'Focus Block',
          dueDate: dayEnd,
          currentScheduledMinutes: dayWorkload,
          targetScheduledMinutes: maxDailyMinutes,
          actions: [{
            type: 'move_focus',
            eventId: blockToMove.id,
            slot: match.slot,
            duration: blockDuration,
            proposedStartAt: match.slot.startAt,
            proposedEndAt: match.slot.endAt,
            explanation: `Move from overloaded day (${Math.round(dayWorkload / 60)}h) to better balanced day`,
            churnCost: blockDuration * 2 // Moving has cost
          }],
          priority: 'medium',
          reasoning: [
            `Day is overloaded (${Math.round(dayWorkload / 60)}h > ${this.config.optimizationRules.maxDailyWorkHours}h max)`,
            `Moving this block will reduce load to ${Math.round((dayWorkload - blockDuration) / 60)}h`,
            `Better slot found: ${match.explanation.join(', ')}`
          ]
        });
      }
    }

    return proposals;
  }

  /**
   * Generate proposals to utilize underutilized days
   */
  private async generateUtilizationProposals(
    underutilizedDays: string[],
    analysis: WorkloadAnalysis,
    userId: string,
    energyLevel: number
  ): Promise<BalancingProposal[]> {
    console.log(`[WorkloadBalancer] Generating utilization proposals for ${underutilizedDays.length} underutilized days`);

    const proposals: BalancingProposal[] = [];
    const minDailyMinutes = this.config.optimizationRules.minDailyWorkHours * 60;

    // Only suggest adding work to underutilized days if there are assignments at risk
    const atRiskAssignments = analysis.crammingRisk.filter(r => r.deficit > 30);

    if (atRiskAssignments.length === 0) {
      return proposals; // No need to fill underutilized days if nothing is at risk
    }

    // For each underutilized day, suggest adding a Focus block for an at-risk assignment
    for (const dateKey of underutilizedDays.slice(0, 3)) { // Limit to 3 suggestions
      const dayWorkload = analysis.dailyWorkload.get(dateKey) || 0;
      const available = minDailyMinutes - dayWorkload;

      if (available < 30) continue; // Need at least 30 minutes

      // Pick the highest priority at-risk assignment
      const targetAssignment = atRiskAssignments[0];
      if (!targetAssignment) break;

      const suggestedDuration = Math.min(available, 120, targetAssignment.deficit);

      // Find a slot on this specific day
      const dayStart = new Date(dateKey + 'T00:00:00Z');
      const dayEnd = new Date(dateKey + 'T23:59:59Z');

      const freeSlots = await this.scheduleAnalyzer.findFreeSlots(
        userId,
        suggestedDuration,
        dayStart,
        dayEnd
      );

      if (freeSlots.length > 0) {
        const bestSlot = freeSlots[0]; // Already sorted by quality

        proposals.push({
          assignmentId: targetAssignment.assignmentId,
          assignmentTitle: targetAssignment.assignmentTitle,
          dueDate: targetAssignment.dueDate,
          currentScheduledMinutes: targetAssignment.scheduledMinutes,
          targetScheduledMinutes: targetAssignment.totalMinutesNeeded,
          actions: [{
            type: 'add_focus',
            slot: bestSlot,
            duration: suggestedDuration,
            proposedStartAt: bestSlot.startAt,
            proposedEndAt: bestSlot.endAt,
            explanation: `Utilize underused day to prevent cramming on "${targetAssignment.assignmentTitle}"`,
            churnCost: 0
          }],
          priority: 'low',
          reasoning: [
            `Day is underutilized (${Math.round(dayWorkload / 60)}h < ${this.config.optimizationRules.minDailyWorkHours}h target)`,
            `${targetAssignment.assignmentTitle} is at risk (${targetAssignment.deficit} min deficit)`,
            `Adding ${suggestedDuration}-minute session maintains momentum and reduces cramming`
          ]
        });
      }
    }

    return proposals;
  }

  /**
   * Determine overall balance quality
   */
  private determineOverallBalance(
    analysis: WorkloadAnalysis,
    proposals: BalancingProposal[]
  ): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    // Critical if any critical-risk assignments
    if (analysis.crammingRisk.some(r => r.riskLevel === 'critical')) {
      return 'critical';
    }

    // Poor if multiple high-risk assignments or many overloaded days
    if (
      analysis.crammingRisk.filter(r => r.riskLevel === 'high').length >= 2 ||
      analysis.overloadedDays.length >= 3
    ) {
      return 'poor';
    }

    // Fair if some medium-risk assignments or some overloaded days
    if (
      analysis.crammingRisk.length > 0 ||
      analysis.overloadedDays.length > 0
    ) {
      return 'fair';
    }

    // Good if workload is mostly balanced
    const avgWorkload = analysis.weeklyAverage / 7;
    const targetMinutes = this.config.optimizationRules.targetDailyWorkHours * 60;
    
    if (Math.abs(avgWorkload - targetMinutes) < 30) {
      return 'excellent';
    }

    return 'good';
  }

  /**
   * Generate summary messages
   */
  private generateSummary(
    analysis: WorkloadAnalysis,
    proposals: BalancingProposal[]
  ): string[] {
    const summary: string[] = [];

    // Overall workload
    const avgDailyHours = Math.round((analysis.weeklyAverage / 7) / 60 * 10) / 10;
    summary.push(`Average daily workload: ${avgDailyHours} hours`);

    // Cramming risks
    if (analysis.crammingRisk.length > 0) {
      const critical = analysis.crammingRisk.filter(r => r.riskLevel === 'critical').length;
      const high = analysis.crammingRisk.filter(r => r.riskLevel === 'high').length;
      
      if (critical > 0) {
        summary.push(`⚠️ ${critical} assignment(s) at critical cramming risk`);
      }
      if (high > 0) {
        summary.push(`⚠️ ${high} assignment(s) at high cramming risk`);
      }
    } else {
      summary.push(`✅ No cramming risks detected`);
    }

    // Overloaded days
    if (analysis.overloadedDays.length > 0) {
      summary.push(`📅 ${analysis.overloadedDays.length} overloaded day(s) detected`);
    } else {
      summary.push(`✅ No overloaded days`);
    }

    // Proposals
    if (proposals.length > 0) {
      const addActions = proposals.reduce((sum, p) => sum + p.actions.filter(a => a.type === 'add_focus').length, 0);
      const moveActions = proposals.reduce((sum, p) => sum + p.actions.filter(a => a.type === 'move_focus').length, 0);
      
      if (addActions > 0) {
        summary.push(`💡 Recommending ${addActions} new Focus block(s)`);
      }
      if (moveActions > 0) {
        summary.push(`💡 Recommending ${moveActions} move(s) for better balance`);
      }
    } else {
      summary.push(`✨ Workload is well balanced - no changes needed`);
    }

    return summary;
  }

  /**
   * Calculate total churn cost for all proposals
   */
  calculateTotalChurnCost(proposals: BalancingProposal[]): number {
    return proposals.reduce((total, proposal) => {
      return total + proposal.actions.reduce((sum, action) => sum + action.churnCost, 0);
    }, 0);
  }

  /**
   * Filter proposals by priority threshold
   */
  filterByPriority(
    proposals: BalancingProposal[],
    minPriority: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  ): BalancingProposal[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const threshold = priorityOrder[minPriority];
    
    return proposals.filter(p => priorityOrder[p.priority] >= threshold);
  }
}





