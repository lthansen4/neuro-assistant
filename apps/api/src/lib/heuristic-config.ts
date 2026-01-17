/**
 * Heuristic Configuration
 * 
 * All tunable parameters for the rebalancing engine.
 * These can be adjusted based on real-world usage data without code changes.
 */

export interface HeuristicConfig {
  // Priority Formula Weights
  priorityWeights: {
    urgency: number;      // How close is the deadline? (0-1)
    impact: number;       // How important is it? Grade weight (0-1)
    energyFit: number;    // Does it match current energy? (0-1)
    friction: number;     // Cost of context switching (-1 to 0)
  };

  // Urgency Scoring (days until due)
  urgencyThresholds: {
    critical: number;     // < 1 day = critical
    urgent: number;       // < 3 days = urgent
    moderate: number;     // < 7 days = moderate
    // > 7 days = low urgency
  };

  // Energy Matching
  energyRules: {
    deepWorkMinEnergy: number;    // Min energy for Deep Work tasks (1-10)
    chillMaxEnergy: number;       // Max energy for Chill blocks (1-10)
    lowEnergyThreshold: number;   // Below this = avoid hard tasks
    highEnergyThreshold: number;  // Above this = boost hard tasks
  };

  // Neuro-Adaptive Rules
  neuroRules: {
    deepWorkMinRestHours: number;     // Min hours between Deep Work sessions
    transitionTaxMinutes: number;     // Buffer for context switching
    heavyTransitionTaxMinutes: number; // Buffer for major context switches
    eveningWindDownHour: number;      // After this, avoid intense work (24hr)
    sleepProtectionStart: number;     // 23 = 11 PM
    sleepProtectionEnd: number;       // 7 = 7 AM
  };

  // Churn Management
  churnLimits: {
    dailyMaxMoves: number;           // Max moves per day
    dailyMaxMinutesMoved: number;    // Max minutes of schedule churn per day
    aggressiveThreshold: number;     // If energy > this, allow more churn
  };

  // Time Preferences
  timePreferences: {
    morningStartHour: number;        // Morning starts (24hr format)
    afternoonStartHour: number;      // Afternoon starts
    eveningStartHour: number;        // Evening starts
    preferMorningWork: boolean;      // Prefer morning for hard tasks?
    weekendBuffer: number;           // Extra rest on weekends (hours)
  };

  // Chunking Rules (for long-form assignments)
  chunkingRules: {
    maxChunkMinutes: number;         // Max duration per chunk (2-hour sessions)
    minGapHours: number;             // Min hours between chunks (brain rest)
    maxChunksPerDay: number;         // Max chunks per day (prevent overload)
    chunkingThreshold: number;       // Minutes threshold to trigger chunking
  };

  // Optimization Rules (for comprehensive calendar optimization)
  optimizationRules: {
    maxDailyWorkHours: number;            // Max work per day (hours)
    targetDailyWorkHours: number;         // Target for balanced schedule (hours)
    minDailyWorkHours: number;            // Min to maintain momentum (hours)
    crammingThresholdDays: number;        // < N days = cramming risk
    freeSlotMinDuration: number;          // Min duration for viable slot (minutes)
    optimalMorningHours: [number, number]; // Best time for hard work [start, end]
    optimalAfternoonHours: [number, number]; // Good time for medium work
    weekendWorkMultiplier: number;        // Prefer weekdays, but allow weekends
    autoOptimizationEnabled: boolean;     // Enable daily auto-optimization
    autoOptimizationHour: number;         // Run at N AM local time
    energyChangeTriggerDelta: number;     // Trigger optimization if energy changes by N+
  };
}

/**
 * Default Heuristic Configuration
 * 
 * Conservative defaults based on:
 * - ADHD/executive function research
 * - Pomodoro technique principles
 * - Context switching studies
 * - User feedback (will evolve)
 */
export const DEFAULT_HEURISTIC_CONFIG: HeuristicConfig = {
  priorityWeights: {
    urgency: 0.4,      // Deadline proximity is very important
    impact: 0.3,       // Grade weight matters
    energyFit: 0.2,    // Match energy to task
    friction: 0.1      // Context switching penalty
  },

  urgencyThresholds: {
    critical: 1,       // Due in < 24 hours
    urgent: 3,         // Due in < 3 days
    moderate: 7        // Due in < 7 days
  },

  energyRules: {
    deepWorkMinEnergy: 6,     // Need decent energy for Deep Work
    chillMaxEnergy: 5,        // Chill is for low-medium energy
    lowEnergyThreshold: 4,    // Below 4 = low energy mode
    highEnergyThreshold: 7    // Above 7 = high energy mode
  },

  neuroRules: {
    deepWorkMinRestHours: 8,          // At least 8 hours between Deep Work
    transitionTaxMinutes: 15,         // 15 min buffer for normal transitions
    heavyTransitionTaxMinutes: 30,    // 30 min for major context switches
    eveningWindDownHour: 21,          // 9 PM - start winding down
    sleepProtectionStart: 23,         // 11 PM
    sleepProtectionEnd: 7             // 7 AM
  },

  churnLimits: {
    dailyMaxMoves: 5,                 // Don't move more than 5 events/day
    dailyMaxMinutesMoved: 180,        // Max 3 hours of schedule churn/day
    aggressiveThreshold: 8            // If energy >= 8, allow more changes
  },

  timePreferences: {
    morningStartHour: 7,              // Morning: 7 AM - 12 PM
    afternoonStartHour: 12,           // Afternoon: 12 PM - 5 PM
    eveningStartHour: 17,             // Evening: 5 PM - 9 PM
    preferMorningWork: true,          // Deep Work better in morning
    weekendBuffer: 2                  // Extra 2 hours rest on weekends
  },

  chunkingRules: {
    maxChunkMinutes: 120,             // 2-hour sessions (avoid mental fatigue)
    minGapHours: 8,                   // 8-hour brain rest between sessions
    maxChunksPerDay: 2,               // Max 2 chunks/day (prevent overload)
    chunkingThreshold: 240            // 4+ hours triggers chunking
  },

  optimizationRules: {
    maxDailyWorkHours: 4,             // Max 4 hours of work per day
    targetDailyWorkHours: 3,          // Target 3 hours for balanced schedule
    minDailyWorkHours: 1,             // Min 1 hour to maintain momentum
    crammingThresholdDays: 2,         // < 2 days until due = cramming risk
    freeSlotMinDuration: 30,          // Min 30-minute slots are viable
    optimalMorningHours: [9, 11],     // 9-11 AM best for hard work
    optimalAfternoonHours: [14, 16],  // 2-4 PM good for medium work
    weekendWorkMultiplier: 0.5,       // Prefer weekdays over weekends
    autoOptimizationEnabled: true,    // Enable daily automatic optimization
    autoOptimizationHour: 7,          // Run at 7 AM local time
    energyChangeTriggerDelta: 3       // Trigger if energy changes by ±3
  }
};

/**
 * Get active heuristic config
 * 
 * For now returns defaults, but could be extended to:
 * - Load user-specific overrides from database
 * - A/B test different configurations
 * - Adjust based on observed metrics
 */
export function getHeuristicConfig(userId?: string): HeuristicConfig {
  // TODO: Load user-specific config from database if it exists
  // For now, everyone gets the defaults
  return DEFAULT_HEURISTIC_CONFIG;
}

import { DateTime } from 'luxon';

/**
 * Helper: Get time of day category
 * @param date - The date to check
 * @param config - Heuristic configuration
 * @param timezone - Optional IANA timezone (e.g., 'America/Chicago'). Defaults to UTC for backwards compatibility.
 */
export function getTimeOfDay(
  date: Date, 
  config: HeuristicConfig,
  timezone?: string
): 'morning' | 'afternoon' | 'evening' | 'night' {
  // Convert to the specified timezone (or UTC if not provided)
  const dt = timezone 
    ? DateTime.fromJSDate(date).setZone(timezone)
    : DateTime.fromJSDate(date, { zone: 'utc' });
  
  const hour = dt.hour;
  
  if (hour >= config.neuroRules.sleepProtectionStart || hour < config.neuroRules.sleepProtectionEnd) {
    return 'night';
  }
  if (hour < config.timePreferences.afternoonStartHour) {
    return 'morning';
  }
  if (hour < config.timePreferences.eveningStartHour) {
    return 'afternoon';
  }
  return 'evening';
}

/**
 * Helper: Check if it's a weekend
 * @param date - The date to check
 * @param timezone - Optional IANA timezone. Defaults to UTC for backwards compatibility.
 */
export function isWeekend(date: Date, timezone?: string): boolean {
  const dt = timezone 
    ? DateTime.fromJSDate(date).setZone(timezone)
    : DateTime.fromJSDate(date, { zone: 'utc' });
  
  // Luxon weekday: 1=Monday, 7=Sunday (ISO standard)
  return dt.weekday === 6 || dt.weekday === 7; // Saturday=6, Sunday=7
}





