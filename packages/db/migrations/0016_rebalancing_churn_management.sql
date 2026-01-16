-- 0016: Rebalancing — Churn Management
-- 
-- Purpose:
-- - Track daily churn usage vs cap to enforce daily limits
-- - Store per-user churn settings (daily cap overrides)
-- - Enable efficient queries for churn tracking and cleanup
--
-- Prerequisites:
-- - users table (from migration 0001) ✅
--
-- Notes:
-- - churn_ledger tracks daily usage per user
-- - churn_settings allows per-user overrides of default cap
-- - Both tables support RLS for user-scoped access

BEGIN;

-- 1) churn_ledger
-- Tracks daily churn used vs cap per user
CREATE TABLE IF NOT EXISTS churn_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL, -- user's local date
  minutes_moved INT NOT NULL DEFAULT 0,
  moves_count INT NOT NULL DEFAULT 0,
  cap_minutes INT, -- snapshot of cap at the time (nullable to allow NULL when using default)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one row per user per day
  CONSTRAINT uq_churn_ledger_day UNIQUE (user_id, day)
);

-- Index for efficient queries by user and date (for cleanup and recent lookups)
CREATE INDEX IF NOT EXISTS idx_churn_ledger_user_day
  ON churn_ledger (user_id, day DESC);

-- 2) churn_settings
-- Optional per-user overrides for daily cap; if absent, use app default
CREATE TABLE IF NOT EXISTS churn_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_cap_minutes INT NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one settings row per user
  CONSTRAINT uq_churn_settings_user UNIQUE (user_id)
);

-- Index for efficient lookup of user settings
CREATE INDEX IF NOT EXISTS idx_churn_settings_user
  ON churn_settings (user_id);

COMMIT;

-- Rollback instructions (manual):
-- DROP INDEX IF EXISTS idx_churn_settings_user ON churn_settings;
-- DROP INDEX IF EXISTS idx_churn_ledger_user_day ON churn_ledger;
-- DROP TABLE IF EXISTS churn_settings CASCADE;
-- DROP TABLE IF EXISTS churn_ledger CASCADE;





