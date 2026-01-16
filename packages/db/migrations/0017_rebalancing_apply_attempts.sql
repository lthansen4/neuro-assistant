-- 0017: Rebalancing — Apply Attempts
-- 
-- Purpose:
-- - Audit trail for each confirm/undo attempt including conflicts
-- - Track status, errors, and partial success scenarios
-- - Enable diagnostics and performance monitoring
--
-- Prerequisites:
-- - rebalancing_proposals table (from migration 0013_5) ✅
-- - users table (from migration 0001) ✅
--
-- Notes:
-- - Records all apply/undo operations for audit and debugging
-- - Conflicts JSONB stores details about stale events or constraint violations
-- - result_summary JSONB stores counts of applied/skipped moves

BEGIN;

-- 1) rebalancing_apply_attempts
-- Audit of each confirm/undo attempt including conflicts
CREATE TABLE IF NOT EXISTS rebalancing_apply_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES rebalancing_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Added FK for RLS and data integrity
  attempt_no INT NOT NULL, -- Sequential attempt number per proposal
  operation TEXT NOT NULL, -- 'confirm' | 'undo'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ, -- NULL if still in progress or failed
  status TEXT NOT NULL, -- 'success' | 'partial_success' | 'stale_conflict' | 'failed'
  idempotency_key TEXT, -- For at-most-once semantics (optional)
  conflicts JSONB, -- Details on which events were stale: [{ eventId, expectedUpdatedAt, actualUpdatedAt, reason }]
  error TEXT, -- Error message if status = 'failed'
  result_summary JSONB -- { "applied": n, "skipped": m, "churn_applied": x }
);

-- Indexes for rebalancing_apply_attempts
-- Primary lookup: by proposal and attempt number
CREATE INDEX IF NOT EXISTS idx_apply_attempts_proposal 
  ON rebalancing_apply_attempts (proposal_id, attempt_no);

-- Secondary lookup: by user and status for diagnostics
CREATE INDEX IF NOT EXISTS idx_apply_attempts_status
  ON rebalancing_apply_attempts (user_id, status, started_at DESC);

-- 2) Add check constraints for enums
DO $$
BEGIN
  -- Check constraint for operation
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rebalancing_apply_attempts_operation_chk'
  ) THEN
    ALTER TABLE rebalancing_apply_attempts
      ADD CONSTRAINT rebalancing_apply_attempts_operation_chk
      CHECK (operation IN ('confirm', 'undo'));
  END IF;

  -- Check constraint for status
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rebalancing_apply_attempts_status_chk'
  ) THEN
    ALTER TABLE rebalancing_apply_attempts
      ADD CONSTRAINT rebalancing_apply_attempts_status_chk
      CHECK (status IN ('success', 'partial_success', 'stale_conflict', 'failed'));
  END IF;
END$$;

COMMIT;

-- Rollback instructions (manual):
-- DROP INDEX IF EXISTS idx_apply_attempts_status ON rebalancing_apply_attempts;
-- DROP INDEX IF EXISTS idx_apply_attempts_proposal ON rebalancing_apply_attempts;
-- ALTER TABLE rebalancing_apply_attempts DROP CONSTRAINT IF EXISTS rebalancing_apply_attempts_status_chk;
-- ALTER TABLE rebalancing_apply_attempts DROP CONSTRAINT IF EXISTS rebalancing_apply_attempts_operation_chk;
-- DROP TABLE IF EXISTS rebalancing_apply_attempts CASCADE;





