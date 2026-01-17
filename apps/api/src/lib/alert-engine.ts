/**
 * Alert Engine
 * 
 * Detects genuine problems that need student attention.
 * Philosophy: Only alert when there's a REAL problem, not for "optimization".
 * 
 * This is like a smoke detector - silent 99% of the time, loud when there's fire.
 */

import { db } from './db';
import { assignments, calendarEventsNew, assignmentDeferrals } from '../../../../packages/db/src/schema';
import { eq, and, gte, lte, lt, sql, isNull, ne } from 'drizzle-orm';
import { getUserTimezone, isInSleepWindow, formatInTimezone } from './timezone-utils';

// ============================================================================
// TYPES
// ============================================================================

export type AlertType = 
  | 'DEADLINE_AT_RISK'      // Assignment due soon with insufficient time scheduled
  | 'AVOIDANCE_DETECTED'    // Assignment rescheduled 3+ times, still not done
  | 'IMPOSSIBLE_SCHEDULE'   // Sleep hours, conflicts, or overloaded day
  | 'NO_PLAN_TODAY';        // Has deadlines but nothing scheduled for today

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  assignmentId?: string;
  assignmentTitle?: string;
  eventId?: string;
  dueDate?: Date;
  actionLabel: string;
  actionType: 'schedule' | 'move' | 'review';
  metadata: Record<string, any>;
}

export interface AlertCheckResult {
  hasAlerts: boolean;
  criticalCount: number;
  highCount: number;
  totalCount: number;
  alerts: Alert[];
  checkedAt: Date;
}

// ============================================================================
// THRESHOLDS - These define what counts as a "real problem"
// ============================================================================

const THRESHOLDS = {
  // DEADLINE_AT_RISK
  deadlineWarningDays: 7,           // Warn if due within this many days
  criticalDays: 2,                  // Critical if due within this many days
  minScheduledPercent: 0.5,         // Alert if < 50% of needed time scheduled
  criticalScheduledPercent: 0.25,   // Critical if < 25% scheduled
  
  // AVOIDANCE_DETECTED
  deferralThreshold: 3,             // Alert after this many reschedules
  avoidanceWarningDays: 10,         // Only warn if due within this many days
  
  // IMPOSSIBLE_SCHEDULE
  maxDailyDeepWorkHours: 7,         // Alert if more than this on one day
  
  // NO_PLAN_TODAY
  upcomingDeadlineDays: 14,         // Consider assignments due within this window
  noPlanCutoffHour: 14,             // Only alert before 2pm (still time to act)
};

// ============================================================================
// MAIN ALERT CHECK FUNCTION
// ============================================================================

export async function checkAlerts(userId: string): Promise<AlertCheckResult> {
  const startTime = Date.now();
  const userTimezone = await getUserTimezone(userId);
  
  console.log(`[AlertEngine] ═══════════════════════════════════════════`);
  console.log(`[AlertEngine] CHECKING ALERTS for user ${userId.substring(0, 8)}...`);
  console.log(`[AlertEngine] Timezone: ${userTimezone}`);
  
  const alerts: Alert[] = [];
  
  // Run all checks in parallel
  const [
    deadlineAlerts,
    avoidanceAlerts,
    impossibleAlerts,
    noPlanAlerts
  ] = await Promise.all([
    checkDeadlineAtRisk(userId, userTimezone),
    checkAvoidanceDetected(userId, userTimezone),
    checkImpossibleSchedule(userId, userTimezone),
    checkNoPlanToday(userId, userTimezone)
  ]);
  
  alerts.push(...deadlineAlerts, ...avoidanceAlerts, ...impossibleAlerts, ...noPlanAlerts);
  
  // Sort by severity (critical first)
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;
  
  console.log(`[AlertEngine] ───────────────────────────────────────────`);
  console.log(`[AlertEngine] Results: ${alerts.length} alerts found`);
  console.log(`[AlertEngine]   Critical: ${criticalCount}`);
  console.log(`[AlertEngine]   High: ${highCount}`);
  console.log(`[AlertEngine]   Time: ${Date.now() - startTime}ms`);
  console.log(`[AlertEngine] ═══════════════════════════════════════════`);
  
  return {
    hasAlerts: alerts.length > 0,
    criticalCount,
    highCount,
    totalCount: alerts.length,
    alerts,
    checkedAt: new Date()
  };
}

// ============================================================================
// ALERT TYPE 1: DEADLINE AT RISK
// ============================================================================

async function checkDeadlineAtRisk(userId: string, timezone: string): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();
  const warningDate = new Date(now.getTime() + THRESHOLDS.deadlineWarningDays * 24 * 60 * 60 * 1000);
  
  // Get assignments due within warning window that aren't completed
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
    
    const estimatedMinutes = assignment.effortEstimateMinutes || 60; // Default 1 hour if not set
    
    // Calculate scheduled time for this assignment
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
    const daysUntilDue = (assignment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    // Check if this is a problem
    if (scheduledPercent < THRESHOLDS.minScheduledPercent) {
      let severity: AlertSeverity = 'medium';
      
      if (daysUntilDue <= THRESHOLDS.criticalDays && scheduledPercent < THRESHOLDS.criticalScheduledPercent) {
        severity = 'critical';
      } else if (daysUntilDue <= THRESHOLDS.criticalDays || scheduledPercent < THRESHOLDS.criticalScheduledPercent) {
        severity = 'high';
      }
      
      const hoursNeeded = Math.round((estimatedMinutes - scheduledMinutes) / 60 * 10) / 10;
      const dueDateStr = formatInTimezone(assignment.dueDate, timezone);
      
      alerts.push({
        id: `deadline-${assignment.id}`,
        type: 'DEADLINE_AT_RISK',
        severity,
        title: assignment.title,
        message: severity === 'critical'
          ? `Due ${daysUntilDue < 1 ? 'TODAY' : 'TOMORROW'} with only ${Math.round(scheduledPercent * 100)}% of time scheduled!`
          : `Due ${dueDateStr} - you need ~${hoursNeeded} more hours scheduled.`,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        dueDate: assignment.dueDate,
        actionLabel: 'Schedule Time',
        actionType: 'schedule',
        metadata: {
          estimatedMinutes,
          scheduledMinutes,
          scheduledPercent: Math.round(scheduledPercent * 100),
          hoursNeeded,
          daysUntilDue: Math.round(daysUntilDue * 10) / 10
        }
      });
      
      console.log(`[AlertEngine] DEADLINE_AT_RISK: "${assignment.title}" - ${Math.round(scheduledPercent * 100)}% scheduled, due in ${Math.round(daysUntilDue)} days (${severity})`);
    }
  }
  
  return alerts;
}

// ============================================================================
// ALERT TYPE 2: AVOIDANCE DETECTED
// ============================================================================

async function checkAvoidanceDetected(userId: string, timezone: string): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();
  const warningDate = new Date(now.getTime() + THRESHOLDS.avoidanceWarningDays * 24 * 60 * 60 * 1000);
  
  // Get assignments that have been deferred multiple times
  const avoidedAssignments = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.userId, userId),
        ne(assignments.status, 'Completed'),
        gte(assignments.deferralCount, THRESHOLDS.deferralThreshold),
        gte(assignments.dueDate, now),
        lte(assignments.dueDate, warningDate)
      )
    );
  
  for (const assignment of avoidedAssignments) {
    if (!assignment.dueDate) continue;
    
    const daysUntilDue = (assignment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const dueDateStr = formatInTimezone(assignment.dueDate, timezone);
    
    // Severity based on how many times deferred and how close deadline is
    let severity: AlertSeverity = 'medium';
    if (daysUntilDue <= 3 || assignment.deferralCount >= 5) {
      severity = 'high';
    }
    if (daysUntilDue <= 1) {
      severity = 'critical';
    }
    
    alerts.push({
      id: `avoidance-${assignment.id}`,
      type: 'AVOIDANCE_DETECTED',
      severity,
      title: assignment.title,
      message: `You've moved this ${assignment.deferralCount} times. It's still due ${dueDateStr}.`,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      dueDate: assignment.dueDate,
      actionLabel: 'Lock In Time',
      actionType: 'schedule',
      metadata: {
        deferralCount: assignment.deferralCount,
        daysUntilDue: Math.round(daysUntilDue * 10) / 10,
        lastDeferredAt: assignment.lastDeferredAt
      }
    });
    
    console.log(`[AlertEngine] AVOIDANCE_DETECTED: "${assignment.title}" - deferred ${assignment.deferralCount}x, due in ${Math.round(daysUntilDue)} days (${severity})`);
  }
  
  return alerts;
}

// ============================================================================
// ALERT TYPE 3: IMPOSSIBLE SCHEDULE
// ============================================================================

async function checkImpossibleSchedule(userId: string, timezone: string): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();
  const checkEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Next 7 days
  
  // Get all events in the next week
  const events = await db
    .select()
    .from(calendarEventsNew)
    .where(
      and(
        eq(calendarEventsNew.userId, userId),
        gte(calendarEventsNew.startAt, now),
        lte(calendarEventsNew.startAt, checkEnd)
      )
    );
  
  // Check for sleep window violations
  for (const event of events) {
    if (isInSleepWindow(event.startAt, timezone)) {
      alerts.push({
        id: `sleep-${event.id}`,
        type: 'IMPOSSIBLE_SCHEDULE',
        severity: 'high',
        title: event.title || 'Event',
        message: `Scheduled at ${formatInTimezone(event.startAt, timezone)} - that's during sleep hours.`,
        eventId: event.id,
        actionLabel: 'Move It',
        actionType: 'move',
        metadata: {
          reason: 'sleep_hours',
          originalTime: event.startAt.toISOString()
        }
      });
      
      console.log(`[AlertEngine] IMPOSSIBLE_SCHEDULE (sleep): "${event.title}" at ${event.startAt.toISOString()}`);
    }
  }
  
  // Check for OVERLAPPING EVENTS (double-booked)
  // Sort by start time for efficient comparison
  const sortedEvents = [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const reportedOverlaps = new Set<string>(); // Avoid duplicate alerts
  
  for (let i = 0; i < sortedEvents.length; i++) {
    for (let j = i + 1; j < sortedEvents.length; j++) {
      const eventA = sortedEvents[i];
      const eventB = sortedEvents[j];
      
      // If B starts after A ends, no more overlaps possible for A
      if (eventB.startAt >= eventA.endAt) break;
      
      // We have an overlap!
      const overlapKey = [eventA.id, eventB.id].sort().join('-');
      if (reportedOverlaps.has(overlapKey)) continue;
      reportedOverlaps.add(overlapKey);
      
      // Determine which one to suggest moving (prefer moving the movable one)
      const movableEvent = eventA.isMovable ? eventA : (eventB.isMovable ? eventB : eventA);
      const otherEvent = movableEvent === eventA ? eventB : eventA;
      
      alerts.push({
        id: `overlap-${overlapKey}`,
        type: 'IMPOSSIBLE_SCHEDULE',
        severity: 'critical', // Overlaps are critical - physically impossible
        title: `Double-booked!`,
        message: `"${eventA.title || 'Event'}" and "${eventB.title || 'Event'}" overlap at ${formatInTimezone(eventA.startAt, timezone)}.`,
        eventId: movableEvent.id,
        actionLabel: 'Fix Conflict',
        actionType: 'move',
        metadata: {
          reason: 'overlap',
          event1Id: eventA.id,
          event1Title: eventA.title,
          event2Id: eventB.id,
          event2Title: eventB.title,
          overlapStart: eventB.startAt.toISOString(),
          overlapEnd: (eventA.endAt < eventB.endAt ? eventA.endAt : eventB.endAt).toISOString()
        }
      });
      
      console.log(`[AlertEngine] IMPOSSIBLE_SCHEDULE (overlap): "${eventA.title}" and "${eventB.title}" overlap`);
    }
  }
  
  // Check for overloaded days
  const dayWorkload = new Map<string, number>();
  for (const event of events) {
    if (event.eventType === 'Focus' || event.eventType === 'Studying') {
      const dateKey = event.startAt.toISOString().split('T')[0];
      const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60 * 60);
      dayWorkload.set(dateKey, (dayWorkload.get(dateKey) || 0) + duration);
    }
  }
  
  for (const [dateKey, hours] of dayWorkload) {
    if (hours > THRESHOLDS.maxDailyDeepWorkHours) {
      const date = new Date(dateKey);
      alerts.push({
        id: `overload-${dateKey}`,
        type: 'IMPOSSIBLE_SCHEDULE',
        severity: 'high',
        title: `${formatInTimezone(date, timezone).split(',')[0]} is overloaded`,
        message: `${Math.round(hours)} hours of deep work scheduled. That's too much for one day.`,
        actionLabel: 'Spread It Out',
        actionType: 'review',
        metadata: {
          reason: 'overloaded_day',
          date: dateKey,
          hours: Math.round(hours * 10) / 10
        }
      });
      
      console.log(`[AlertEngine] IMPOSSIBLE_SCHEDULE (overload): ${dateKey} has ${Math.round(hours)}h of work`);
    }
  }
  
  return alerts;
}

// ============================================================================
// ALERT TYPE 4: NO PLAN TODAY
// ============================================================================

async function checkNoPlanToday(userId: string, timezone: string): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();
  
  // Only check before 2pm (still time to act)
  const hour = now.getHours(); // Local hour
  if (hour >= THRESHOLDS.noPlanCutoffHour) {
    return alerts; // Too late in the day
  }
  
  // Check if it's a weekend - be more lenient
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  // Get today's scheduled study time
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  
  const todayEvents = await db
    .select()
    .from(calendarEventsNew)
    .where(
      and(
        eq(calendarEventsNew.userId, userId),
        gte(calendarEventsNew.startAt, todayStart),
        lte(calendarEventsNew.startAt, todayEnd),
        sql`${calendarEventsNew.eventType} IN ('Focus', 'Studying')`
      )
    );
  
  const todayStudyMinutes = todayEvents.reduce((sum, event) => {
    const duration = (event.endAt.getTime() - event.startAt.getTime()) / (1000 * 60);
    return sum + duration;
  }, 0);
  
  // Only alert if they have upcoming deadlines
  const upcomingDeadline = new Date(now.getTime() + THRESHOLDS.upcomingDeadlineDays * 24 * 60 * 60 * 1000);
  const hasUpcomingWork = await db
    .select({ count: sql<number>`count(*)` })
    .from(assignments)
    .where(
      and(
        eq(assignments.userId, userId),
        ne(assignments.status, 'Completed'),
        gte(assignments.dueDate, now),
        lte(assignments.dueDate, upcomingDeadline)
      )
    );
  
  const upcomingCount = Number(hasUpcomingWork[0]?.count || 0);
  
  // Only alert if:
  // 1. No study time today
  // 2. Has upcoming deadlines
  // 3. Not weekend (or has critical deadlines on weekend)
  if (todayStudyMinutes === 0 && upcomingCount > 0 && !isWeekend) {
    alerts.push({
      id: `noplan-${todayStart.toISOString().split('T')[0]}`,
      type: 'NO_PLAN_TODAY',
      severity: 'medium',
      title: 'No study time scheduled today',
      message: `You have ${upcomingCount} assignment${upcomingCount > 1 ? 's' : ''} due soon but nothing scheduled for today.`,
      actionLabel: 'Add Focus Time',
      actionType: 'schedule',
      metadata: {
        upcomingAssignments: upcomingCount,
        date: todayStart.toISOString().split('T')[0]
      }
    });
    
    console.log(`[AlertEngine] NO_PLAN_TODAY: 0 minutes scheduled, ${upcomingCount} assignments upcoming`);
  }
  
  return alerts;
}

// ============================================================================
// HELPER: Get suggested times for an assignment
// ============================================================================

export async function getSuggestedTimes(
  userId: string, 
  assignmentId: string,
  hoursNeeded: number
): Promise<Array<{ startAt: Date; endAt: Date; score: number }>> {
  // This will integrate with the existing SlotMatcher
  // For now, return empty - will implement in next step
  return [];
}

