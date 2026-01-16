-- Migration 0010: Courses + Grading Components
-- Adds normalized grading_components table for Grade Forecast calculations
-- Keeps grade_weights_json on courses for fast UI loading
-- NOTE: This is additive - no breaking changes

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure grade_weights_json exists (may already exist from 0001)
-- This JSONB field is kept for fast UI loading (Syllabus breakdown display)
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS grade_weights_json jsonb;

-- 2) Normalized grading components table for forecasting/calculations
-- This table enables:
--   - Accurate grade calculations (with drop_lowest, etc.)
--   - Grade forecast projections
--   - Rebalancing engine support
CREATE TABLE IF NOT EXISTS grading_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name varchar(128) NOT NULL,  -- e.g., "Midterm", "Homework", "Final Exam"
  weight_percent numeric(5,2) NOT NULL,  -- 0.00 to 100.00
  drop_lowest smallint,  -- Optional: drop N lowest scores (e.g., drop_lowest = 2 means drop 2 lowest homeworks)
  source varchar(64),  -- 'syllabus', 'manual', 'imported'
  source_item_id uuid,  -- Link to source if from syllabus staging
  parse_run_id uuid REFERENCES syllabus_parse_runs(id),  -- Link to parse run if from syllabus
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT grading_weight_range_chk CHECK (weight_percent >= 0 AND weight_percent <= 100),
  CONSTRAINT grading_drop_lowest_chk CHECK (drop_lowest IS NULL OR drop_lowest >= 0)
);

-- Trigger for updated_at
-- Note: set_updated_at() function may already exist from migration 0008, but IF NOT EXISTS handles it
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_grading_components') THEN
    CREATE TRIGGER set_updated_at_grading_components
    BEFORE UPDATE ON grading_components
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- 3) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_grading_components_course ON grading_components(course_id);

-- Optional: Index for parsing/source tracking
CREATE INDEX IF NOT EXISTS idx_grading_components_parse_run ON grading_components(parse_run_id) 
  WHERE parse_run_id IS NOT NULL;

COMMIT;

-- Verification queries (run after migration):
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'grade_weights_json';
-- SELECT * FROM grading_components WHERE course_id = '...';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'grading_components';





