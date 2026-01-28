-- Migration 0033: Add Buffer Time Tracking
-- 
-- Epic 4 Enhancement: Track 15-minute buffer time rewards from focus sessions
-- Buffer time expires at midnight (daily reset), separate from earned chill time
--
-- Why: After completing a focus session, students earn a 15-minute "transition tax"
-- buffer that can be redeemed immediately but expires if unused by end of day.

ALTER TABLE user_daily_productivity 
  ADD COLUMN IF NOT EXISTS buffer_minutes_earned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_minutes_used INTEGER NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN user_daily_productivity.buffer_minutes_earned IS 'Total buffer minutes earned today (15 min per focus session, refreshes not stacks)';
COMMENT ON COLUMN user_daily_productivity.buffer_minutes_used IS 'Buffer minutes redeemed today (expires at midnight)';



