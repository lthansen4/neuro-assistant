/**
 * ADHD GUARDIAN - Priority 2 Features
 * 
 * "The Benevolent Advisor" - Protects users from executive function pitfalls
 * 
 * Features:
 * 1. Wall of Awful Detection - Intervene after 3 deferrals
 * 2. Artificial Urgency - Treat deadlines as 24h earlier
 * 3. Recovery Forcing - Prevent >4hr deep work days
 * 4. Grade Rescue Logic - Boost assignments in struggling courses
 */

import { db } from './db';
import * as schema from '../../../../packages/db/src/schema';
import { eq, and, sql, gte, lte, desc } from 'drizzle-orm';
import { DateTime } from 'luxon';

// ============================================================================
// 1. WALL OF AWFUL DETECTION
// ============================================================================

/**
 * Track a deferral and check if assignment is now stuck
 * Returns TRUE if this is the 3rd deferral (stuck threshold)
 */
export async function trackDeferral(
  userId: string,
  assignmentId: string,
  deferredFrom: Date,
  deferredTo: Date | null,
  reason?: string
): Promise<{ isStuck: boolean; deferralCount: number }> {
  console.log(`[Wall of Awful] Tracking deferral for assignment ${assignmentId}`);
  
  // 1. Record the deferral
  await db.insert(schema.assignmentDeferrals).values({
    assignmentId,
    userId,
    deferredFrom,
    deferredTo,
    reason
  });
  
  // 2. Increment deferral count on assignment
  const [assignment] = await db
    .update(schema.assignments)
    .set({
      deferralCount: sql`${schema.assignments.deferralCount} + 1`,
      lastDeferredAt: new Date(),
      // Flag as stuck if this is the 3rd deferral
      isStuck: sql`CASE WHEN ${schema.assignments.deferralCount} + 1 >= 3 THEN TRUE ELSE FALSE END`
    })
    .where(eq(schema.assignments.id, assignmentId))
    .returning();
  
  const isStuck = assignment.isStuck;
  const deferralCount = assignment.deferralCount;
  
  if (isStuck) {
    console.log(`[Wall of Awful] ⚠️  Assignment "${assignment.title}" is now STUCK (${deferralCount} deferrals)`);
    console.log(`[Wall of Awful] Intervention required: Break into micro-tasks`);
  } else {
    console.log(`[Wall of Awful] Deferral ${deferralCount}/3 tracked for "${assignment.title}"`);
  }
  
  return { isStuck, deferralCount };
}

/**
 * Get all stuck assignments for a user
 */
export async function getStuckAssignments(userId: string) {
  return db.query.assignments.findMany({
    where: and(
      eq(schema.assignments.userId, userId),
      eq(schema.assignments.isStuck, true)
    ),
    with: {
      course: true
    },
    orderBy: desc(schema.assignments.lastDeferredAt)
  });
}

/**
 * Mark stuck intervention as shown
 */
export async function markInterventionShown(assignmentId: string) {
  await db
    .update(schema.assignments)
    .set({ stuckInterventionShown: true })
    .where(eq(schema.assignments.id, assignmentId));
  
  console.log(`[Wall of Awful] Intervention shown for assignment ${assignmentId}`);
}

/**
 * Reset stuck flag (e.g., after user breaks into micro-tasks)
 */
export async function resetStuckFlag(assignmentId: string) {
  await db
    .update(schema.assignments)
    .set({
      isStuck: false,
      deferralCount: 0,
      stuckInterventionShown: false
    })
    .where(eq(schema.assignments.id, assignmentId));
  
  console.log(`[Wall of Awful] Stuck flag reset for assignment ${assignmentId}`);
}

// ============================================================================
// 2. ARTIFICIAL URGENCY
// ============================================================================

/**
 * Apply artificial urgency to deadline
 * For chronic procrastinators, internally treat deadlines as 24h earlier
 */
export function applyArtificialUrgency(dueDate: Date, enabled: boolean = true): Date {
  if (!enabled) return dueDate;
  
  const adjusted = new Date(dueDate);
  adjusted.setHours(adjusted.getHours() - 24); // Move 24 hours earlier
  
  console.log(`[Artificial Urgency] Adjusted deadline: ${dueDate.toISOString()} → ${adjusted.toISOString()}`);
  return adjusted;
}

/**
 * Calculate urgency score with artificial urgency applied
 * Returns higher urgency score as deadline approaches
 */
export function calculateUrgencyScore(
  dueDate: Date,
  applyArtificial: boolean = true
): number {
  const deadline = applyArtificial ? applyArtificialUrgency(dueDate) : dueDate;
  const now = new Date();
  
  const hoursUntilDue = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  // Exponential urgency: Score grows rapidly as deadline approaches
  // Score range: 0.0 (far away) to 1.0 (imminent)
  if (hoursUntilDue <= 0) return 1.0; // Overdue
  if (hoursUntilDue >= 168) return 0.1; // >1 week away
  
  // Exponential curve: 1 / (hours + 1)
  const urgency = 1 / (hoursUntilDue / 24 + 1);
  
  return Math.min(1.0, urgency);
}

// ============================================================================
// 3. RECOVERY FORCING
// ============================================================================

/**
 * Check if user has exceeded deep work limit for today
 * Returns TRUE if user has done >4 hours of deep work today
 */
export async function hasExceededDeepWorkLimit(userId: string, date: Date): Promise<boolean> {
  const dateStr = DateTime.fromJSDate(date).toISODate();
  if (!dateStr) {
    console.error('[Recovery Forcing] Invalid date provided');
    return false;
  }
  
  // Get or create daily summary
  const summary = await db.query.dailyDeepWorkSummary.findFirst({
    where: and(
      eq(schema.dailyDeepWorkSummary.userId, userId),
      eq(schema.dailyDeepWorkSummary.date, dateStr)
    )
  });
  
  if (!summary) {
    // No deep work yet today
    return false;
  }
  
  const deepWorkHours = summary.totalDeepWorkMinutes / 60;
  const exceeded = deepWorkHours >= 4.0;
  
  if (exceeded) {
    console.log(`[Recovery Forcing] ⚠️  User ${userId} has exceeded 4hr deep work limit (${deepWorkHours.toFixed(1)}hr)`);
    console.log(`[Recovery Forcing] Blocking further deep work scheduling for today`);
  }
  
  return exceeded;
}

/**
 * Update daily deep work summary with new Focus block
 */
export async function trackDeepWork(userId: string, date: Date, durationMinutes: number) {
  const dateStr = DateTime.fromJSDate(date).toISODate();
  if (!dateStr) {
    console.error('[Recovery Forcing] Invalid date provided to trackDeepWork');
    return;
  }
  
  // Upsert daily summary
  const existing = await db.query.dailyDeepWorkSummary.findFirst({
    where: and(
      eq(schema.dailyDeepWorkSummary.userId, userId),
      eq(schema.dailyDeepWorkSummary.date, dateStr)
    )
  });
  
  if (existing) {
    const newTotal = existing.totalDeepWorkMinutes + durationMinutes;
    const recoveryForced = newTotal >= 240; // 4 hours
    
    await db
      .update(schema.dailyDeepWorkSummary)
      .set({
        totalDeepWorkMinutes: newTotal,
        recoveryForced,
        updatedAt: new Date()
      })
      .where(eq(schema.dailyDeepWorkSummary.id, existing.id));
    
    console.log(`[Recovery Forcing] Updated deep work: ${newTotal}min (${(newTotal / 60).toFixed(1)}hr)`);
    
    if (recoveryForced && !existing.recoveryForced) {
      console.log(`[Recovery Forcing] 🛑 RECOVERY FORCED - No more deep work today!`);
    }
  } else {
    await db.insert(schema.dailyDeepWorkSummary).values({
      userId,
      date: dateStr,
      totalDeepWorkMinutes: durationMinutes,
      recoveryForced: durationMinutes >= 240
    });
    
    console.log(`[Recovery Forcing] Created deep work summary: ${durationMinutes}min`);
  }
}

/**
 * Get total deep work minutes for a specific date
 */
export async function getDeepWorkMinutes(userId: string, date: Date): Promise<number> {
  const dateStr = DateTime.fromJSDate(date).toISODate();
  if (!dateStr) {
    console.error('[Recovery Forcing] Invalid date provided to getDeepWorkMinutes');
    return 0;
  }
  
  const summary = await db.query.dailyDeepWorkSummary.findFirst({
    where: and(
      eq(schema.dailyDeepWorkSummary.userId, userId),
      eq(schema.dailyDeepWorkSummary.date, dateStr)
    )
  });
  
  return summary?.totalDeepWorkMinutes || 0;
}

// ============================================================================
// 4. GRADE RESCUE LOGIC
// ============================================================================

/**
 * Calculate priority boost for assignments in struggling courses
 * Returns multiplier: 1.0 (no boost) to 1.5 (50% boost)
 */
export async function calculateGradeRescueBoost(
  assignmentId: string
): Promise<{ boost: number; reason: string }> {
  const assignment = await db.query.assignments.findFirst({
    where: eq(schema.assignments.id, assignmentId)
  });
  
  if (!assignment?.courseId) {
    return { boost: 1.0, reason: 'No course associated' };
  }
  
  const course = await db.query.courses.findFirst({
    where: eq(schema.courses.id, assignment.courseId)
  });
  
  if (!course) {
    return { boost: 1.0, reason: 'Course not found' };
  }
  let boost = 1.0;
  let reasons: string[] = [];
  
  // 1. Major course boost (+25%)
  if (course.isMajor) {
    boost += 0.25;
    reasons.push('Major course (+25%)');
  }
  
  // 2. Grade rescue boost (if current grade < 75%)
  if (course.currentGrade !== null) {
    const grade = parseFloat(course.currentGrade.toString());
    
    if (grade < 75) {
      const rescueBoost = 0.25; // 25% boost for struggling courses
      boost += rescueBoost;
      reasons.push(`Grade rescue (${grade}% < 75%, +25%)`);
      
      console.log(`[Grade Rescue] 🚨 Course "${course.name}" needs rescue (grade: ${grade}%)`);
    } else {
      reasons.push(`Good standing (${grade}%)`);
    }
  } else {
    reasons.push('Grade not tracked');
  }
  
  const finalBoost = Math.min(boost, 1.5); // Cap at 50% total boost
  const reasonStr = reasons.join(', ');
  
  if (finalBoost > 1.0) {
    console.log(`[Grade Rescue] Priority boost: ${finalBoost.toFixed(2)}x (${reasonStr})`);
  }
  
  return { boost: finalBoost, reason: reasonStr };
}

/**
 * Update course grade
 */
export async function updateCourseGrade(courseId: string, grade: number) {
  await db
    .update(schema.courses)
    .set({
      currentGrade: grade.toString(),
      gradeUpdatedAt: new Date()
    })
    .where(eq(schema.courses.id, courseId));
  
  console.log(`[Grade Rescue] Updated course ${courseId} grade: ${grade}%`);
  
  // Check if rescue logic should kick in
  if (grade < 75) {
    console.log(`[Grade Rescue] ⚠️  Grade below 75% - assignments in this course will receive priority boost`);
  }
}

/**
 * Set course as major
 */
export async function setCourseAsMajor(courseId: string, isMajor: boolean) {
  await db
    .update(schema.courses)
    .set({ isMajor })
    .where(eq(schema.courses.id, courseId));
  
  console.log(`[Grade Rescue] Course ${courseId} major status: ${isMajor}`);
}

// ============================================================================
// COMPREHENSIVE PRIORITY CALCULATION
// ============================================================================

/**
 * Calculate comprehensive priority score for an assignment
 * Combines all Priority 2 features
 */
export async function calculateComprehensivePriority(
  assignmentId: string,
  gradeWeight: number = 0.1,
  energyLevel: number = 5
): Promise<number> {
  const assignment = await db.query.assignments.findFirst({
    where: eq(schema.assignments.id, assignmentId),
    with: { course: true }
  });
  
  if (!assignment || !assignment.dueDate) {
    return 0.0;
  }
  
  // 1. Base urgency (with artificial urgency applied)
  const urgency = calculateUrgencyScore(assignment.dueDate, true);
  
  // 2. Grade weight impact
  const weightImpact = gradeWeight;
  
  // 3. Grade rescue boost
  const { boost: gradeBoost } = await calculateGradeRescueBoost(assignmentId);
  
  // 4. Energy multiplier (from Neuro-Adaptive Policy)
  const energyMult = energyLevel >= 8 ? 1.5 : (energyLevel <= 3 ? 0.1 : 1.0);
  
  // 5. Stuck penalty (lower priority if stuck - needs intervention, not more pressure)
  const stuckPenalty = assignment.isStuck ? 0.5 : 1.0;
  
  // FINAL SCORE
  const score = (urgency * 0.4 + weightImpact * 0.4) * gradeBoost * energyMult * stuckPenalty;
  
  console.log(`[Priority] Assignment "${assignment.title}":`);
  console.log(`  Urgency: ${urgency.toFixed(2)} (artificial urgency applied)`);
  console.log(`  Weight: ${weightImpact.toFixed(2)}`);
  console.log(`  Grade boost: ${gradeBoost.toFixed(2)}x`);
  console.log(`  Energy mult: ${energyMult.toFixed(2)}x`);
  console.log(`  Stuck penalty: ${stuckPenalty.toFixed(2)}x`);
  console.log(`  FINAL SCORE: ${score.toFixed(3)}`);
  
  return score;
}

export default {
  // Wall of Awful
  trackDeferral,
  getStuckAssignments,
  markInterventionShown,
  resetStuckFlag,
  
  // Artificial Urgency
  applyArtificialUrgency,
  calculateUrgencyScore,
  
  // Recovery Forcing
  hasExceededDeepWorkLimit,
  trackDeepWork,
  getDeepWorkMinutes,
  
  // Grade Rescue
  calculateGradeRescueBoost,
  updateCourseGrade,
  setCourseAsMajor,
  
  // Comprehensive
  calculateComprehensivePriority
};

