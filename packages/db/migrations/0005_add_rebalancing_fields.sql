-- Migration 0005: Additive migration for Rebalancing Engine support
-- Adds term/year to courses and is_recurring to calendar_events
-- No breaking changes - all fields are nullable with defaults
-- 
-- NOTE: This migration is superseded by 0006_rebalancing_engine_fields.sql
-- which includes these changes plus additional fields. This file is kept
-- for historical reference.

-- Add term and year to courses table for Rebalancing Engine
ALTER TABLE courses 
  ADD COLUMN IF NOT EXISTS term VARCHAR(32),
  ADD COLUMN IF NOT EXISTS year INTEGER;

-- Add is_recurring flag to calendar_events for Rebalancing Engine
ALTER TABLE calendar_events 
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

-- Optional: Add index for term/year queries if needed
-- CREATE INDEX IF NOT EXISTS idx_courses_term_year ON courses(term, year) WHERE term IS NOT NULL AND year IS NOT NULL;





