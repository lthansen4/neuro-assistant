-- Migration 0022: Add Priority 2 ADHD-friendly fields
-- Features:
-- 1. Wall of Awful Detection (deferral tracking)
-- 2. Artificial Urgency (internal deadline adjustment)
-- 3. Recovery Forcing (deep work limits)
-- 4. Grade Rescue Logic (course grade tracking)

-- Add deferral tracking to assignments (Wall of Awful)
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS deferral_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_stuck BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_deferred_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stuck_intervention_shown BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for stuck assignments (quick queries)
CREATE INDEX IF NOT EXISTS idx_assignments_stuck ON assignments(user_id, is_stuck) WHERE is_stuck = TRUE;

-- Add current grade tracking to courses (Grade Rescue Logic)
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS current_grade NUMERIC(5, 2), -- 0.00 to 100.00
ADD COLUMN IF NOT EXISTS is_major BOOLEAN NOT NULL DEFAULT FALSE, -- Major/minor flag
ADD COLUMN IF NOT EXISTS grade_updated_at TIMESTAMPTZ;

-- Add deep work tracking to users (Recovery Forcing)
-- We'll track daily deep work hours via calendar events, but add a flag to user preferences
-- (user preferences will be handled via user_config table)

-- Create daily deep work summary table (Recovery Forcing)
CREATE TABLE IF NOT EXISTS daily_deep_work_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_deep_work_minutes INTEGER NOT NULL DEFAULT 0,
  recovery_forced BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE if we blocked scheduling due to >4hr limit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_deep_work_user_date ON daily_deep_work_summary(user_id, date);

-- Create deferral history table (for Wall of Awful tracking)
CREATE TABLE IF NOT EXISTS assignment_deferrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deferred_from TIMESTAMPTZ NOT NULL, -- Original scheduled time
  deferred_to TIMESTAMPTZ, -- New scheduled time (NULL if unscheduled)
  reason TEXT, -- Optional: User-provided reason
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deferrals_assignment ON assignment_deferrals(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deferrals_user ON assignment_deferrals(user_id, created_at);

-- Add comments for documentation
COMMENT ON COLUMN assignments.deferral_count IS 'Wall of Awful: Number of times this assignment has been deferred. Flag as stuck after 3.';
COMMENT ON COLUMN assignments.is_stuck IS 'Wall of Awful: TRUE if assignment has been deferred 3+ times. Requires intervention.';
COMMENT ON COLUMN assignments.last_deferred_at IS 'Wall of Awful: Timestamp of most recent deferral.';
COMMENT ON COLUMN assignments.stuck_intervention_shown IS 'Wall of Awful: TRUE if we have shown the intervention prompt to break into micro-tasks.';

COMMENT ON COLUMN courses.current_grade IS 'Grade Rescue Logic: Current grade percentage (0-100). Boost priority if < 75%.';
COMMENT ON COLUMN courses.is_major IS 'Grade Rescue Logic: TRUE if this is a major course (25% priority boost).';
COMMENT ON COLUMN courses.grade_updated_at IS 'Grade Rescue Logic: Last time the grade was updated.';

COMMENT ON TABLE daily_deep_work_summary IS 'Recovery Forcing: Track daily deep work hours. Prevent scheduling if > 4hr/day.';
COMMENT ON COLUMN daily_deep_work_summary.recovery_forced IS 'Recovery Forcing: TRUE if we blocked further deep work for this day (>4hr limit).';

COMMENT ON TABLE assignment_deferrals IS 'Wall of Awful: Track every time an assignment is deferred. Used to detect stuck patterns.';





