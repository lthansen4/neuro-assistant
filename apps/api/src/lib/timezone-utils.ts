/**
 * Timezone Utilities
 * 
 * Provides timezone-aware date/time operations for the rebalancing engine.
 * Uses Luxon for reliable timezone handling.
 */

import { DateTime } from 'luxon';
import { db } from './db';
import { users } from '../../../../packages/db/src/schema';
import { eq } from 'drizzle-orm';

// Default timezone if user hasn't set one
export const DEFAULT_TIMEZONE = 'America/Chicago'; // CST/CDT

// Sleep window configuration (in user's local time)
export const SLEEP_CONFIG = {
  startHour: 23,      // 11 PM - sleep starts
  endHourWeekday: 7,  // 7 AM - wake up on weekdays
  endHourWeekend: 10, // 10 AM - sleep in on weekends
};

/**
 * Get user's timezone from database
 * Falls back to default if not set
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { timezone: true }
    });
    
    // Validate timezone is a valid IANA timezone
    const tz = user?.timezone || DEFAULT_TIMEZONE;
    if (DateTime.local().setZone(tz).isValid) {
      return tz;
    }
    
    console.warn(`[TimezoneUtils] Invalid timezone "${tz}" for user ${userId}, using default`);
    return DEFAULT_TIMEZONE;
  } catch (error) {
    console.error(`[TimezoneUtils] Error fetching timezone for user ${userId}:`, error);
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Check if a given date/time falls within the sleep window
 * 
 * @param date - The date to check (can be JS Date or ISO string)
 * @param timezone - IANA timezone string (e.g., 'America/Chicago')
 * @returns true if the time is within sleep hours
 */
export function isInSleepWindow(date: Date | string, timezone: string): boolean {
  const dt = DateTime.fromJSDate(
    typeof date === 'string' ? new Date(date) : date
  ).setZone(timezone);
  
  if (!dt.isValid) {
    console.error(`[TimezoneUtils] Invalid date for sleep window check: ${date}`);
    return false; // Don't block if we can't parse
  }
  
  const hour = dt.hour;
  const isWeekend = dt.weekday === 6 || dt.weekday === 7; // Saturday=6, Sunday=7 in Luxon
  
  const sleepEnd = isWeekend ? SLEEP_CONFIG.endHourWeekend : SLEEP_CONFIG.endHourWeekday;
  
  // Sleep window spans midnight: 11 PM to 7/10 AM
  // So we're IN sleep if:
  // - hour >= 23 (11 PM or later), OR
  // - hour < 7 (before 7 AM on weekdays) or hour < 10 (before 10 AM on weekends)
  const inSleep = hour >= SLEEP_CONFIG.startHour || hour < sleepEnd;
  
  return inSleep;
}

/**
 * Get the next available time after sleep window ends
 * 
 * @param date - Start from this date
 * @param timezone - User's timezone
 * @param bufferHours - Hours after sleep ends to suggest (default: 2 for 9 AM start)
 */
export function getNextWakeTime(
  date: Date | string, 
  timezone: string, 
  bufferHours: number = 2
): Date {
  const dt = DateTime.fromJSDate(
    typeof date === 'string' ? new Date(date) : date
  ).setZone(timezone);
  
  const isWeekend = dt.weekday === 6 || dt.weekday === 7;
  const sleepEnd = isWeekend ? SLEEP_CONFIG.endHourWeekend : SLEEP_CONFIG.endHourWeekday;
  const targetHour = sleepEnd + bufferHours;
  
  let targetDate = dt.set({ hour: targetHour, minute: 0, second: 0, millisecond: 0 });
  
  // If that time has already passed today, use tomorrow
  if (targetDate <= dt) {
    targetDate = targetDate.plus({ days: 1 });
    // Recalculate for weekend/weekday
    const nextDayIsWeekend = targetDate.weekday === 6 || targetDate.weekday === 7;
    const nextSleepEnd = nextDayIsWeekend ? SLEEP_CONFIG.endHourWeekend : SLEEP_CONFIG.endHourWeekday;
    targetDate = targetDate.set({ hour: nextSleepEnd + bufferHours });
  }
  
  return targetDate.toJSDate();
}

/**
 * Get time of day category for a given date
 */
export function getTimeOfDayInTimezone(
  date: Date | string, 
  timezone: string
): 'morning' | 'afternoon' | 'evening' | 'night' {
  const dt = DateTime.fromJSDate(
    typeof date === 'string' ? new Date(date) : date
  ).setZone(timezone);
  
  const hour = dt.hour;
  
  if (isInSleepWindow(date, timezone)) {
    return 'night';
  }
  
  if (hour < 12) {
    return 'morning';
  }
  
  if (hour < 17) {
    return 'afternoon';
  }
  
  return 'evening';
}

/**
 * Convert a local time (hour) in user's timezone to UTC Date
 */
export function localHourToUTC(
  baseDate: Date,
  localHour: number,
  timezone: string
): Date {
  const dt = DateTime.fromJSDate(baseDate)
    .setZone(timezone)
    .set({ hour: localHour, minute: 0, second: 0, millisecond: 0 });
  
  return dt.toUTC().toJSDate();
}

/**
 * Format a date in user's timezone for logging
 */
export function formatInTimezone(date: Date | string, timezone: string): string {
  const dt = DateTime.fromJSDate(
    typeof date === 'string' ? new Date(date) : date
  ).setZone(timezone);
  
  return dt.toFormat('EEE MMM d, yyyy h:mm a ZZZZ');
}

/**
 * Check if a proposed time slot violates any constraints
 * Returns null if valid, or an error message if invalid
 */
export function validateTimeSlot(
  startAt: Date,
  endAt: Date,
  timezone: string,
  dueDate?: Date | null
): string | null {
  // Check sleep window
  if (isInSleepWindow(startAt, timezone)) {
    return `Start time (${formatInTimezone(startAt, timezone)}) is during sleep hours`;
  }
  
  if (isInSleepWindow(endAt, timezone)) {
    return `End time (${formatInTimezone(endAt, timezone)}) is during sleep hours`;
  }
  
  // Check if end is after due date
  if (dueDate && endAt > dueDate) {
    return `End time (${formatInTimezone(endAt, timezone)}) is after due date (${formatInTimezone(dueDate, timezone)})`;
  }
  
  // Check if start is in the past
  if (startAt < new Date()) {
    return `Start time is in the past`;
  }
  
  return null; // Valid
}



