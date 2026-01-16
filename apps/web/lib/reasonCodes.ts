/**
 * Educational Reason Code Translations
 * 
 * Maps technical backend reason codes to student-friendly explanations
 * that teach prioritization and time management concepts.
 */

export interface ReasonExplanation {
  short: string;        // Brief label for the badge
  explanation: string;  // Educational explanation (teaching moment)
  icon: string;         // Emoji for visual cue
}

export const REASON_EXPLANATIONS: Record<string, ReasonExplanation> = {
  // High Priority & Deadline Management
  CHILL_PREEMPTED: {
    short: "Break time moved",
    explanation: "Your break is being rescheduled to make room for important work. ADHD brains need rest, but sometimes we have to move breaks around deadlines. The break is still there - just at a better time when you'll really need it!",
    icon: "🔄"
  },
  
  HIGH_PRIORITY_ASSIGNMENT_URGENT: {
    short: "Urgent deadline",
    explanation: "This assignment is due very soon! When something is both important AND urgent, it gets top priority. This follows the Eisenhower Matrix - urgent + important = do it first. Tackling this now prevents last-minute panic.",
    icon: "🚨"
  },
  
  HIGH_PRIORITY_ASSIGNMENT_IMPORTANT: {
    short: "Important work",
    explanation: "This assignment is important for your grade, even if it's not due immediately. Scheduling it early prevents cramming and gives your brain time to process the material properly. Quality work takes time!",
    icon: "⭐"
  },
  
  DEADLINE_PROXIMITY: {
    short: "Deadline approaching",
    explanation: "The due date is getting close, so this work is being prioritized. Starting earlier gives you buffer time for unexpected challenges or if you need to ask questions.",
    icon: "⏰"
  },
  
  // Conflict Resolution
  CHUNKED_BLOCK_CRITICAL_MOVE: {
    short: "Critical timing",
    explanation: "This work session needs to be at a specific time to avoid conflicts with other commitments. Breaking big tasks into chunks and fitting them around your fixed schedule helps you make steady progress.",
    icon: "🧩"
  },
  
  CONFLICT_RESOLUTION: {
    short: "Fixing overlap",
    explanation: "Two things were scheduled at the same time, which is impossible! This move resolves the conflict so you can actually do both. Smart scheduling means making sure everything has its own space.",
    icon: "🔧"
  },
  
  CONFLICT_RESOLUTION_HARD: {
    short: "Resolving major conflict",
    explanation: "There was a significant scheduling conflict that needed fixing. This change ensures you have dedicated time for each task without double-booking yourself.",
    icon: "⚠️"
  },
  
  CONFLICT_RESOLUTION_SOFT: {
    short: "Optimizing overlap",
    explanation: "There was a minor timing issue that's being smoothed out. This makes your schedule flow better and reduces stress from back-to-back commitments.",
    icon: "🔄"
  },
  
  SEVERITY_HIGH: {
    short: "High-priority fix",
    explanation: "This conflict was blocking important work, so it's being resolved with priority. Clearing your path lets you focus on what matters most.",
    icon: "🚨"
  },
  
  SEVERITY_MEDIUM: {
    short: "Medium-priority fix",
    explanation: "This scheduling issue needed attention but isn't critical. Still, fixing it now prevents it from becoming a bigger problem later.",
    icon: "⚠️"
  },
  
  SEVERITY_LOW: {
    short: "Minor adjustment",
    explanation: "A small timing optimization that makes your schedule flow more smoothly. These little improvements add up to less stress overall!",
    icon: "🔄"
  },
  
  // Energy & Timing Optimization
  SLEEP_VIOLATION: {
    short: "Outside rest hours",
    explanation: "Something was scheduled during sleep time (11pm-7am). Your brain needs rest to function! This move ensures you get proper sleep while still getting work done during productive hours.",
    icon: "😴"
  },
  
  MOVE_TO_MORNING_PEAK: {
    short: "Morning energy boost",
    explanation: "This is being moved to morning when your energy is typically highest. For challenging work, it's better to tackle it when you're fresh rather than forcing it during low-energy times.",
    icon: "🌅"
  },
  
  ENERGY_OPTIMIZATION: {
    short: "Better energy match",
    explanation: "This task is being scheduled for a time when your energy level better matches what the work needs. Working with your natural rhythms makes everything easier!",
    icon: "⚡"
  },
  
  OPTIMIZE_TIMING: {
    short: "Timing optimization",
    explanation: "This time slot is a better fit for this type of work based on your schedule patterns. Small timing adjustments can make work feel less overwhelming.",
    icon: "🎯"
  },
  
  HIGH_ENERGY_OPTIMIZATION: {
    short: "Peak performance time",
    explanation: "You're feeling energized, so this important work is being scheduled now while you can give it your best focus. Strike while the iron is hot!",
    icon: "🔥"
  },
  
  // Workload Management
  CRAMMING_PREVENTION_CRITICAL: {
    short: "Anti-cramming (urgent)",
    explanation: "This prevents you from trying to do everything at the last minute. Cramming doesn't work well for ADHD brains - spreading work out helps you actually learn and remember.",
    icon: "🛑"
  },
  
  CRAMMING_PREVENTION_HIGH: {
    short: "Anti-cramming",
    explanation: "Starting this work earlier prevents the stress and poor quality that comes from last-minute rushing. Your future self will thank you!",
    icon: "📚"
  },
  
  CRAMMING_PREVENTION: {
    short: "Spread out work",
    explanation: "Breaking this work into earlier chunks helps you avoid cramming. Your brain processes and retains information better when you give it time between sessions.",
    icon: "📖"
  },
  
  WORKLOAD_BALANCE: {
    short: "Balanced schedule",
    explanation: "This helps distribute your work more evenly across days so you don't have overwhelming days followed by empty ones. Consistency beats cramming!",
    icon: "⚖️"
  },
  
  WORKLOAD_REDISTRIBUTION: {
    short: "Evening out workload",
    explanation: "Moving some work around to prevent any single day from being overloaded. When every day is reasonable, you're more likely to actually do the work!",
    icon: "📊"
  },
  
  PREVENT_OVERLOAD: {
    short: "Avoiding burnout",
    explanation: "This prevents you from having too much scheduled in one day. Overloading your schedule leads to nothing getting done. Realistic scheduling = actual progress!",
    icon: "🛡️"
  },
  
  // General
  EVENT_CHANGED: {
    short: "Updated event",
    explanation: "The original event was modified, so this adjustment keeps everything in sync. Staying flexible when things change is a key skill!",
    icon: "🔄"
  },
  
  EVENT_DELETED: {
    short: "Event removed",
    explanation: "The original event no longer exists, so this makes room in your schedule. Sometimes plans change, and that's okay!",
    icon: "❌"
  },
  
  HIGH_PRIORITY_PREEMPTION: {
    short: "High-priority override",
    explanation: "A high-priority task needs this time slot. When deadlines and importance collide, the most critical work comes first.",
    icon: "⚡"
  },
  
  CONFLICT_WITH_CHILL: {
    short: "Rest time adjusted",
    explanation: "Your break time is being moved to accommodate important work. The break is still there - it's just finding a better spot in your day.",
    icon: "🔄"
  },
  
  ENERGY_FIT_BOOST: {
    short: "Energy-matched timing",
    explanation: "This work type matches well with your energy at this time. Matching tasks to energy levels makes everything feel easier!",
    icon: "✨"
  }
};

/**
 * Get explanation for a reason code
 * @param code - The technical reason code from backend
 * @returns Explanation object or null if not found
 */
export function getReasonExplanation(code: string): ReasonExplanation | null {
  return REASON_EXPLANATIONS[code] || null;
}

/**
 * Get multiple explanations for an array of codes
 * @param codes - Array of reason codes
 * @returns Array of explanation objects (skips unknown codes)
 */
export function getReasonExplanations(codes: string[]): ReasonExplanation[] {
  return codes
    .map(code => REASON_EXPLANATIONS[code])
    .filter((exp): exp is ReasonExplanation => exp !== null && exp !== undefined);
}

/**
 * Format a list of reason codes into a readable summary
 * @param codes - Array of reason codes
 * @returns Human-readable summary string
 */
export function formatReasonSummary(codes: string[]): string {
  const explanations = getReasonExplanations(codes);
  if (explanations.length === 0) return "Schedule optimization";
  if (explanations.length === 1) return explanations[0].short;
  return explanations.map(exp => exp.short).join(", ");
}





