import { HeuristicConfig, getHeuristicConfig, getTimeOfDay } from './heuristic-config';
import { db } from './db';
import { assignments } from '../../../../packages/db/src/schema';
import { eq, and, gte } from 'drizzle-orm';

/**
 * Prioritization Engine
 * 
 * Scores assignments and events based on:
 * - Urgency (deadline proximity)
 * - Impact (grade weight, course importance)
 * - Energy Fit (does it match current energy level?)
 * - Friction (context switching cost)
 * 
 * Formula: Score = (Urgency × W) + (Impact × W) + (EnergyFit × W) − Friction
 */

export interface PriorityScore {
  totalScore: number;          // Final weighted score (0-1)
  urgencyScore: number;        // 0-1 based on deadline
  impactScore: number;         // 0-1 based on importance
  energyFitScore: number;      // 0-1 based on energy match
  frictionScore: number;       // 0-1 penalty for context switching
  breakdown: {
    daysUntilDue?: number;
    gradeWeight?: number;
    energyLevel?: number;
    taskComplexity?: 'light' | 'medium' | 'heavy';
    contextSwitchCost?: number;
  };
}

export class PrioritizationEngine {
  private config: HeuristicConfig;

  constructor(userId?: string) {
    this.config = getHeuristicConfig(userId);
  }

  /**
   * Calculate urgency score based on days until due
   * 
   * < 1 day = 1.0 (critical!)
   * 1-3 days = 0.8 (urgent)
   * 3-7 days = 0.5 (moderate)
   * > 7 days = 0.2 (low)
   */
  calculateUrgencyScore(dueDate: Date): number {
    const now = new Date();
    const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilDue < 0) {
      return 1.0; // Overdue! Maximum urgency
    }
    if (daysUntilDue < this.config.urgencyThresholds.critical) {
      return 1.0; // Critical: due in < 24 hours
    }
    if (daysUntilDue < this.config.urgencyThresholds.urgent) {
      return 0.8; // Urgent: due in < 3 days
    }
    if (daysUntilDue < this.config.urgencyThresholds.moderate) {
      return 0.5; // Moderate: due in < 7 days
    }
    
    // Low urgency: due in > 7 days
    // Gradually decrease from 0.5 to 0.1 over next 30 days
    const weeksOut = daysUntilDue / 7;
    return Math.max(0.1, 0.5 - (weeksOut - 1) * 0.1);
  }

  /**
   * Calculate impact score based on grade weight
   * 
   * High grade weight (>20%) = high impact
   * Medium grade weight (10-20%) = medium impact  
   * Low grade weight (<10%) = low impact
   */
  calculateImpactScore(gradeWeight?: number): number {
    if (!gradeWeight) {
      return 0.5; // Default: medium impact if unknown
    }

    // Normalize grade weight to 0-1 scale
    // Assume max meaningful weight is 50% (like a final exam)
    const normalized = Math.min(gradeWeight / 50, 1.0);
    
    // Apply curve: small weights have less impact
    if (gradeWeight < 5) return 0.2;
    if (gradeWeight < 10) return 0.4;
    if (gradeWeight < 20) return 0.6;
    if (gradeWeight < 30) return 0.8;
    return 1.0; // High stakes!
  }

  /**
   * Calculate energy fit score
   * 
   * Does the task match the current energy level?
   * - High energy + Deep Work = good fit (1.0)
   * - Low energy + Chill = good fit (1.0)
   * - High energy + Chill = poor fit (0.3)
   * - Low energy + Deep Work = poor fit (0.2)
   */
  calculateEnergyFitScore(
    taskType: 'focus' | 'chill' | 'admin' | 'light',
    currentEnergy: number
  ): number {
    const { deepWorkMinEnergy, chillMaxEnergy, lowEnergyThreshold, highEnergyThreshold } = this.config.energyRules;

    // High energy (7-10)
    if (currentEnergy >= highEnergyThreshold) {
      if (taskType === 'focus') return 1.0;  // Perfect match!
      if (taskType === 'admin') return 0.7;  // Okay match
      if (taskType === 'light') return 0.5;  // Not ideal use of high energy
      if (taskType === 'chill') return 0.3;  // Waste of high energy
    }

    // Low energy (1-4)
    if (currentEnergy <= lowEnergyThreshold) {
      if (taskType === 'chill') return 1.0;  // Perfect match!
      if (taskType === 'light') return 0.8;  // Good match
      if (taskType === 'admin') return 0.5;  // Manageable
      if (taskType === 'focus') return 0.2;  // Bad match - will struggle
    }

    // Medium energy (5-6)
    if (taskType === 'admin') return 1.0;   // Perfect for medium energy
    if (taskType === 'focus') return 0.7;   // Can do it, not optimal
    if (taskType === 'light') return 0.8;   // Good
    if (taskType === 'chill') return 0.6;   // Okay

    return 0.5; // Fallback: neutral fit
  }

  /**
   * Calculate friction score (context switching penalty)
   * 
   * Heavy context switch (different subject) = 0.3 penalty
   * Medium switch (same subject, different type) = 0.15 penalty
   * Light switch (same type) = 0.05 penalty
   */
  calculateFrictionScore(
    previousTaskType?: string,
    currentTaskType?: string,
    previousSubject?: string,
    currentSubject?: string
  ): number {
    if (!previousTaskType || !currentTaskType) {
      return 0; // No previous task, no friction
    }

    // Heavy switch: different subject
    if (previousSubject && currentSubject && previousSubject !== currentSubject) {
      return 0.3; // 30% penalty for major context switch
    }

    // Medium switch: same subject, different task type
    if (previousTaskType !== currentTaskType) {
      return 0.15; // 15% penalty for task type switch
    }

    // Light switch: same type, same subject
    return 0.05; // 5% penalty for any switch
  }

  /**
   * Calculate overall priority score for an assignment
   */
  async calculateAssignmentPriority(
    assignmentId: string,
    currentEnergy: number,
    previousContext?: { taskType: string; subject: string }
  ): Promise<PriorityScore> {
    // Fetch assignment details
    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId)
    });

    if (!assignment || !assignment.dueDate) {
      throw new Error(`Assignment ${assignmentId} not found or has no due date`);
    }

    // Calculate component scores
    const urgencyScore = this.calculateUrgencyScore(assignment.dueDate);
    
    // Extract grade weight from weightOverride (stored as numeric/string)
    const gradeWeight = assignment.weightOverride ? parseFloat(assignment.weightOverride.toString()) : undefined;
    const impactScore = this.calculateImpactScore(gradeWeight);
    
    // Determine task type from assignment category or metadata
    const taskType = this.inferTaskType(assignment);
    const energyFitScore = this.calculateEnergyFitScore(taskType, currentEnergy);
    
    const frictionScore = this.calculateFrictionScore(
      previousContext?.taskType,
      taskType,
      previousContext?.subject,
      assignment.courseId || undefined
    );

    // Apply weighted formula
    const weights = this.config.priorityWeights;
    const totalScore = 
      (urgencyScore * weights.urgency) +
      (impactScore * weights.impact) +
      (energyFitScore * weights.energyFit) -
      (frictionScore * weights.friction);

    return {
      totalScore: Math.max(0, Math.min(1, totalScore)), // Clamp to 0-1
      urgencyScore,
      impactScore,
      energyFitScore,
      frictionScore,
      breakdown: {
        daysUntilDue: (assignment.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        gradeWeight,
        energyLevel: currentEnergy,
        taskComplexity: this.inferComplexity(assignment),
        contextSwitchCost: frictionScore
      }
    };
  }

  /**
   * Infer task type from assignment
   */
  private inferTaskType(assignment: any): 'focus' | 'chill' | 'admin' | 'light' {
    const title = (assignment.title || '').toLowerCase();
    const category = (assignment.category || '').toLowerCase();
    
    // Focus: exams, papers, projects, problem sets
    if (title.includes('exam') || title.includes('test') || 
        title.includes('paper') || title.includes('essay') ||
        title.includes('project') || title.includes('problem set') ||
        category === 'exam' || category === 'project' || category === 'paper') {
      return 'focus';
    }
    
    // Admin: reading, quiz, discussion post
    if (title.includes('reading') || title.includes('quiz') || 
        title.includes('discussion') ||
        category === 'reading' || category === 'quiz') {
      return 'admin';
    }
    
    // Light: participation, attendance
    if (title.includes('participation') || title.includes('attendance')) {
      return 'light';
    }
    
    // Default: focus (assume work until proven otherwise)
    return 'focus';
  }

  /**
   * Infer complexity from assignment
   */
  private inferComplexity(assignment: any): 'light' | 'medium' | 'heavy' {
    const estimatedMinutes = assignment.effortEstimateMinutes || 60;
    
    if (estimatedMinutes < 30) return 'light';
    if (estimatedMinutes < 120) return 'medium';
    return 'heavy';
  }

  /**
   * Get time-based multiplier
   * 
   * Morning: 1.2x for Deep Work (brain is fresh)
   * Evening: 0.7x for Deep Work (brain is tired)
   * Evening: 1.3x for Chill (natural wind-down time)
   */
  getTimeOfDayMultiplier(
    taskType: 'focus' | 'chill' | 'admin' | 'light',
    targetTime: Date
  ): number {
    const timeOfDay = getTimeOfDay(targetTime, this.config);
    const hour = targetTime.getUTCHours();

    // Evening wind-down period
    if (hour >= this.config.neuroRules.eveningWindDownHour) {
      if (taskType === 'focus') return 0.6;  // Avoid Deep Work in evening
      if (taskType === 'chill') return 1.3;  // Perfect time for Chill
      if (taskType === 'admin') return 0.9;  // Light admin okay
    }

    // Morning productivity peak
    if (timeOfDay === 'morning' && this.config.timePreferences.preferMorningWork) {
      if (taskType === 'focus') return 1.2;  // Boost Deep Work in morning
      if (taskType === 'chill') return 0.8;  // Less ideal for Chill
    }

    // Afternoon: neutral
    if (timeOfDay === 'afternoon') {
      return 1.0; // No modifier
    }

    return 1.0; // Default: no change
  }
}





