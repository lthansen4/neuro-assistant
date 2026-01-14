/**
 * Nudge Scheduler
 * 
 * Scans for classes that just ended and creates post-class nudges.
 * Respects DND hours (11 PM - 7 AM) and per-course mute settings.
 */

import { db } from './db';
import { nudges, courses, users, courseNudgeSettings } from '../../../../packages/db/src/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { OneSignalService } from './onesignal-service';

interface ScanResult {
  queued: number;
  deferred: number;
  skipped: number;
  errors: string[];
}

/**
 * Scan for classes that just ended and create nudges
 * 
 * @param windowStart - Start of the time window to scan (e.g., NOW() - 1 minute)
 * @param windowEnd - End of the time window to scan (e.g., NOW())
 */
export async function scanAndQueueNudges(
  windowStart: Date,
  windowEnd: Date = new Date()
): Promise<ScanResult> {
  const result: ScanResult = {
    queued: 0,
    deferred: 0,
    skipped: 0,
    errors: []
  };

  console.log(`[NudgeScheduler] Scanning for classes ending between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`);

  try {
    // Fetch all users with courses that have schedules
    console.log('[NudgeScheduler] Fetching users with courses...');
    
    const usersWithCourses = await db
      .select({
        userId: courses.userId,
        courseId: courses.id,
        courseName: courses.name,
        scheduleJson: courses.scheduleJson,
        userTimezone: users.timezone
      })
      .from(courses)
      .innerJoin(users, eq(courses.userId, users.id))
      .where(sql`${courses.scheduleJson} IS NOT NULL`);

    console.log(`[NudgeScheduler] Found ${usersWithCourses.length} user-course pairs with schedules`);

    for (const item of usersWithCourses) {
      try {
        console.log(`[NudgeScheduler] Processing course: ${item.courseName || 'unknown'} for user ${item.userId}`);
        
        // Parse schedule JSON - handle both formats
        let schedule = item.scheduleJson as any;
        
        // If it's a string, parse it
        if (typeof schedule === 'string') {
          try {
            schedule = JSON.parse(schedule);
          } catch (e) {
            console.log(`[NudgeScheduler] Course ${item.courseName} has invalid JSON, skipping`);
            continue;
          }
        }
        
        // Normalize to { classes: [...] } format
        let classes: any[];
        if (Array.isArray(schedule)) {
          classes = schedule;
        } else if (schedule && Array.isArray(schedule.classes)) {
          classes = schedule.classes;
        } else {
          console.log(`[NudgeScheduler] Course ${item.courseName} has no valid schedule, skipping`);
          continue;
        }

        console.log(`[NudgeScheduler] Course ${item.courseName} has ${classes.length} class(es) in schedule`);

        // Check each class instance in the schedule
        for (const classInstance of classes) {
          // Handle both "day" and "dayOfWeek", and both "Mon" string and 1 number
          let dayOfWeek: number;
          if (classInstance.day) {
            // Convert "Mon", "Tue", etc. to 0-6 (0 = Sunday)
            const dayMap: Record<string, number> = {
              'Sun': 0, 'Sunday': 0,
              'Mon': 1, 'Monday': 1,
              'Tue': 2, 'Tuesday': 2,
              'Wed': 3, 'Wednesday': 3,
              'Thu': 4, 'Thursday': 4,
              'Fri': 5, 'Friday': 5,
              'Sat': 6, 'Saturday': 6
            };
            dayOfWeek = dayMap[classInstance.day] ?? 1; // Default to Monday
          } else {
            dayOfWeek = classInstance.dayOfWeek ?? 1;
          }
          
          const startTime = classInstance.start || classInstance.startTime;
          const endTime = classInstance.end || classInstance.endTime;

          // Calculate when this class ends in user's timezone
          const userTz = item.userTimezone || 'America/Chicago';
          const now = DateTime.now().setZone(userTz);
          
          // Find the most recent occurrence of this class
          const classEndTime = calculateMostRecentClassEnd(now, dayOfWeek, endTime, userTz);

          if (!classEndTime) continue;

          // Check if this class ended within our scan window
          const classEndUTC = classEndTime.toJSDate();
          if (classEndUTC >= windowStart && classEndUTC <= windowEnd) {
            console.log(`[NudgeScheduler] Found ended class: ${item.courseName} at ${classEndTime.toISO()}`);

            // Check if nudge already exists for this course today
            const existingNudge = await db
              .select()
              .from(nudges)
              .where(
                and(
                  eq(nudges.userId, item.userId),
                  eq(nudges.courseId, item.courseId),
                  sql`((trigger_at AT TIME ZONE 'UTC')::date) = ((${classEndUTC})::date)`
                )
              )
              .limit(1);

            if (existingNudge.length > 0) {
              console.log(`[NudgeScheduler] Nudge already exists for ${item.courseName} today, skipping`);
              result.skipped++;
              continue;
            }

            // Check if course is muted
            const muteSettings = await db
              .select()
              .from(courseNudgeSettings)
              .where(
                and(
                  eq(courseNudgeSettings.userId, item.userId),
                  eq(courseNudgeSettings.courseId, item.courseId)
                )
              )
              .limit(1);

            if (muteSettings.length > 0) {
              const settings = muteSettings[0];
              if (settings.muted) {
                console.log(`[NudgeScheduler] Course ${item.courseName} is muted, skipping`);
                result.skipped++;
                continue;
              }
            }

            // Check if in DND hours (11 PM - 7 AM)
            const isDND = isInDNDWindow(classEndTime);
            let scheduledSendAt = classEndUTC;
            let status: 'queued' | 'deferred' = 'queued';

            if (isDND) {
              // Defer to next morning at 7 AM
              const nextMorning = classEndTime.set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
              const adjustedMorning = nextMorning < classEndTime ? nextMorning.plus({ days: 1 }) : nextMorning;
              scheduledSendAt = adjustedMorning.toJSDate();
              status = 'deferred';
              console.log(`[NudgeScheduler] In DND window, deferring to ${adjustedMorning.toISO()}`);
              result.deferred++;
            } else {
              result.queued++;
            }

            // Create nudge
            await db.insert(nudges).values({
              userId: item.userId,
              courseId: item.courseId,
              type: 'POST_CLASS',
              status,
              triggerAt: classEndUTC,
              scheduledSendAt,
              deliveryChannel: 'in_app', // For MVP, always in-app
              metadata: {
                classDate: classEndTime.toISODate(),
                courseName: item.courseName,
                dndDeferred: isDND
              }
            });

            console.log(`[NudgeScheduler] Created ${status} nudge for ${item.courseName}`);

            // Send push notification if not deferred
            if (!isDND) {
              try {
                // Get the database user to get their Clerk ID
                const dbUser = await db.query.users.findFirst({
                  where: eq(users.id, item.userId)
                });

                if (dbUser && dbUser.clerkUserId) {
                  const pushResult = await OneSignalService.sendPostClassNudge(
                    dbUser.clerkUserId,
                    item.courseName.split(':')[0].trim() || 'Class', // Use first part as course code
                    item.courseName,
                    '' // We don't have nudge ID yet, but OneSignal will still work
                  );

                  if (pushResult.success) {
                    console.log(`[NudgeScheduler] Push notification sent for ${item.courseName}`);
                  } else {
                    console.log(`[NudgeScheduler] Push notification failed: ${pushResult.error}`);
                  }
                }
              } catch (pushError) {
                console.error(`[NudgeScheduler] Error sending push notification:`, pushError);
                // Don't fail the whole operation if push fails
              }
            }
          }
        }
      } catch (error) {
        const err = error as Error;
        console.error(`[NudgeScheduler] Error processing course ${item.courseId}:`, err.message);
        result.errors.push(`Course ${item.courseId}: ${err.message}`);
      }
    }

    console.log(`[NudgeScheduler] Scan complete: ${result.queued} queued, ${result.deferred} deferred, ${result.skipped} skipped`);
    return result;

  } catch (error) {
    const err = error as Error;
    console.error(`[NudgeScheduler] Fatal error in scan:`, err.message);
    result.errors.push(`Fatal: ${err.message}`);
    return result;
  }
}

/**
 * Calculate the most recent end time for a class based on day of week and end time
 */
function calculateMostRecentClassEnd(
  now: DateTime,
  dayOfWeek: number, // 0 = Sunday, 6 = Saturday
  endTime: string, // "HH:MM:SS" or "HH:MM"
  timezone: string
): DateTime | null {
  try {
    // Parse end time
    const [hours, minutes] = endTime.split(':').map(Number);
    
    // Get today's day of week
    const todayDayOfWeek = now.weekday % 7; // Luxon: 1=Mon, 7=Sun -> convert to 0=Sun

    // Calculate days difference
    let daysAgo = todayDayOfWeek - dayOfWeek;
    if (daysAgo < 0) {
      daysAgo += 7; // Go back to previous week
    }

    // Calculate the class end time
    const classEnd = now
      .minus({ days: daysAgo })
      .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

    return classEnd;
  } catch (error) {
    console.error(`[NudgeScheduler] Error calculating class end time:`, error);
    return null;
  }
}

/**
 * Check if a time is in DND window (11 PM - 7 AM)
 */
function isInDNDWindow(dateTime: DateTime): boolean {
  const hour = dateTime.hour;
  return hour >= 23 || hour < 7;
}

