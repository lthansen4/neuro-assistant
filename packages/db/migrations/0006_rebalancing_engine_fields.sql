-- Migration 0006: Additive changes for Rebalancing Engine
-- This migration adds fields needed for the Rebalancing Engine
-- All changes are additive - no breaking changes

-- 1. Update COURSES: Add term and year for the Rebalancing Engine
-- (Note: These may already exist from 0005, but using IF NOT EXISTS for safety)
ALTER TABLE courses 
  ADD COLUMN IF NOT EXISTS term VARCHAR(32),
  ADD COLUMN IF NOT EXISTS year INTEGER;

-- 2. Update CALENDAR_EVENTS: Add recurrence flag
-- Note: is_movable already exists with default false - we keep the existing default
ALTER TABLE calendar_events 
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

-- Note: is_movable already exists in calendar_events (from 0001_unified.sql)
-- It has default false, which we preserve. The migration will skip adding it.

-- 3. ASSIGNMENTS: effort_estimate_minutes already exists
-- The user's original migration checked for 'estimated_effort_minutes' (different name),
-- but we already have 'effort_estimate_minutes'. We keep the existing column name.
-- No action needed - column already exists.

-- 4. USER_STREAKS: Current table has different structure
-- Current: current_streak_days, longest_streak_days, last_active_date, unique on user_id
-- Proposed: streak_type, current_count, longest_count, last_incremented_on, unique on (user_id, streak_type)
-- 
-- We have two options:
-- A) Migrate existing table to new structure (breaking change - not recommended)
-- B) Create a new table for multi-type streaks (recommended)
--
-- For now, we'll add the new structure as a separate table to avoid breaking existing code.
-- If you want to migrate the existing table, that should be a separate, explicit migration.

-- Create new user_streaks_v2 table for multi-type streaks (if needed)
-- Commented out for now - uncomment if you want to create a new table instead of migrating
/*
CREATE TABLE IF NOT EXISTS user_streaks_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_type varchar(32) NOT NULL, -- 'productivity', 'login'
  current_count int NOT NULL DEFAULT 0,
  longest_count int NOT NULL DEFAULT 0,
  last_incremented_on date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, streak_type)
);
*/

-- 5. Add Indices for Performance
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
-- Note: idx_courses_user_name already exists, but idx_courses_user is more general

-- Note: user_streaks index would be added if we create the new table
-- CREATE INDEX IF NOT EXISTS idx_streaks_user ON user_streaks_v2(user_id);







