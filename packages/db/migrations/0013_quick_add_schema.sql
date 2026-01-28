BEGIN;

-- Migration 0013: Quick Add Schema Enhancements
-- This migration adds missing fields and indexes to existing quick add tables
-- (Tables were created in migration 0002, this adds enhancements)

-- 1. USER COURSE ALIASES
-- Ensure table exists (should already exist from 0002)
CREATE TABLE IF NOT EXISTS user_course_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  confidence NUMERIC(4,3) DEFAULT 1.0, -- parser confidence or user-confirmed (1.0)
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing constraint if it doesn't exist (using different name to avoid conflicts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_user_alias'
  ) THEN
    -- Drop old constraint if it exists with different name
    IF EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'uniq_user_alias_ci'
    ) THEN
      EXECUTE 'DROP INDEX IF EXISTS uniq_user_alias_ci';
    END IF;
    
    -- Create new constraint using unique index (PostgreSQL doesn't support UNIQUE constraint with expressions directly)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'uq_user_alias'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX uq_user_alias ON user_course_aliases(user_id, lower(alias))';
    END IF;
  END IF;
END$$;

-- 2. QUICK ADD LOGS
-- Ensure table exists (should already exist from 0002)
CREATE TABLE IF NOT EXISTS quick_add_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_input TEXT NOT NULL,
  parsed_payload JSONB,
  confidence NUMERIC(4,3),
  dedupe_hash TEXT,
  created_assignment_id UUID,
  created_event_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns if they don't exist
ALTER TABLE quick_add_logs
  ADD COLUMN IF NOT EXISTS intent TEXT, -- 'event' | 'assignment' | 'ambiguous'
  ADD COLUMN IF NOT EXISTS ambiguity_reason TEXT, -- Why did we ask the user?
  ADD COLUMN IF NOT EXISTS user_resolution TEXT; -- What did they choose?

-- 3. INDEXES
-- Rename existing index if needed, or create new one
DO $$
BEGIN
  -- Check if old index exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_quick_add_logs_user_created'
      AND tablename = 'quick_add_logs'
  ) THEN
    -- Rename to new name if different
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_quick_add_logs_user_date'
    ) THEN
      EXECUTE 'ALTER INDEX idx_quick_add_logs_user_created RENAME TO idx_quick_add_logs_user_date';
    END IF;
  ELSE
    -- Create new index if neither exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_quick_add_logs_user_date'
    ) THEN
      EXECUTE 'CREATE INDEX idx_quick_add_logs_user_date ON quick_add_logs(user_id, created_at DESC)';
    END IF;
  END IF;
END$$;

-- Unique dedupe hash per user to prevent rapid double-clicks
-- This replaces the non-unique index from 0002
DO $$
BEGIN
  -- Drop old non-unique index if it exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_quick_add_logs_dedupe'
      AND tablename = 'quick_add_logs'
  ) THEN
    DROP INDEX idx_quick_add_logs_dedupe;
  END IF;
  
  -- Create new unique index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_quick_add_dedupe'
  ) THEN
    CREATE UNIQUE INDEX idx_quick_add_dedupe
      ON quick_add_logs(user_id, dedupe_hash)
      WHERE dedupe_hash IS NOT NULL;
  END IF;
END$$;

COMMIT;







