-- 0013_5: Rebalancing Engine — Base Tables
-- 
-- Purpose:
-- - Creates core tables for the Rebalancing Engine: rebalancing_proposals and proposal_moves
-- - These tables are prerequisites for migration 0014 (which adds baseline fields and triggers)
--
-- Prerequisites:
-- - users table (from migration 0001) ✅
-- - calendar_events_new table (from migration 0008) ✅
--
-- Notes:
-- - proposal_moves will have baseline_updated_at, baseline_version, and metadata added in migration 0014
-- - This migration creates the core structure only

BEGIN;

-- 1) rebalancing_proposals
-- Stores proposal metadata and status
CREATE TABLE IF NOT EXISTS rebalancing_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Trigger context
  trigger TEXT NOT NULL, -- 'manual' | 'quick_add' | 'schedule_drift' | 'morning_refresh' | 'other'
  cause JSONB, -- optional context: { assignment_id, inserted_event_id, reason }
  energy_level SMALLINT, -- 1–10 captured at run time
  
  -- Proposal stats
  moves_count INT NOT NULL DEFAULT 0,
  churn_cost_total INT NOT NULL DEFAULT 0, -- minutes (or normalized score)
  
  -- Status and lifecycle
  status TEXT NOT NULL DEFAULT 'proposed', -- 'proposed' | 'applied' | 'partially_applied' | 'cancelled' | 'expired'
  apply_mode_require_all BOOLEAN NOT NULL DEFAULT false, -- if true, any conflict → 409 and no changes
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  undone_at TIMESTAMPTZ,
  
  -- Links and safety
  snapshot_id UUID, -- FK to rollback_snapshots (FK will be added when snapshots table is created in future migration)
  idempotency_key TEXT, -- for confirm/undo safety
  
  -- Metadata
  metadata JSONB -- { reason_codes_agg, performance_ms, heuristics_version }
);

-- Indexes for rebalancing_proposals
CREATE INDEX IF NOT EXISTS idx_rebalance_user_created
  ON rebalancing_proposals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rebalance_status
  ON rebalancing_proposals(user_id, status, created_at DESC);

-- Unique index for idempotency (partial index - only when key is present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rebalance_idem
  ON rebalancing_proposals(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2) proposal_moves
-- Represents each diff: insert/move/resize/delete with scoring and guards
-- NOTE: baseline_updated_at, baseline_version, and metadata will be added in migration 0014
-- NOTE: FK to calendar_events_new will be added conditionally if table exists (created in migration 0008)
CREATE TABLE IF NOT EXISTS proposal_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES rebalancing_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Move details
  move_type TEXT NOT NULL, -- 'insert' | 'move' | 'resize' | 'delete'
  source_event_id UUID, -- FK to calendar_events_new will be added conditionally below
  
  -- Target timing
  target_start_at TIMESTAMPTZ,
  target_end_at TIMESTAMPTZ,
  delta_minutes INT, -- positive for pushes/pulls
  
  -- Scoring
  churn_cost INT NOT NULL DEFAULT 0,
  category TEXT, -- 'deep_work' | 'standard' | 'light' | 'admin' | 'chore'
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of codes, e.g., ["DEADLINE_PROXIMITY","QUIET_HOURS"]
  base_priority NUMERIC(6,3),
  energy_multiplier NUMERIC(4,2),
  final_priority NUMERIC(6,3),
  
  -- Constraints and flags
  feasibility_flags JSONB, -- { buffer_enforced:true, protected_window:false, ... }
  
  -- Baseline fields for stale-checks (will be added in migration 0014)
  -- baseline_updated_at TIMESTAMPTZ,
  -- baseline_version BIGINT,
  -- metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK to calendar_events_new if table exists (gracefully skip if it doesn't)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events_new'
  ) THEN
    -- Table exists, add FK constraint if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'proposal_moves'::regclass
        AND conname = 'proposal_moves_source_event_id_fkey'
    ) THEN
      ALTER TABLE proposal_moves
        ADD CONSTRAINT proposal_moves_source_event_id_fkey
        FOREIGN KEY (source_event_id)
        REFERENCES calendar_events_new(id)
        ON DELETE SET NULL;
      
      RAISE NOTICE 'Added FK constraint from proposal_moves.source_event_id to calendar_events_new.id';
    END IF;
  ELSE
    RAISE NOTICE 'calendar_events_new table does not exist. Skipping FK constraint (will be added when table is created)';
  END IF;
END$$;

-- Indexes for proposal_moves (core indexes only - additional indexes added in 0014)
CREATE INDEX IF NOT EXISTS idx_proposal_moves_proposal
  ON proposal_moves(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_moves_user_target
  ON proposal_moves(user_id, target_start_at);

-- Add check constraint for move_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposal_moves_move_type_chk'
  ) THEN
    ALTER TABLE proposal_moves
      ADD CONSTRAINT proposal_moves_move_type_chk
      CHECK (move_type IN ('insert', 'move', 'resize', 'delete'));
  END IF;
END$$;

-- Add check constraint for status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rebalancing_proposals_status_chk'
  ) THEN
    ALTER TABLE rebalancing_proposals
      ADD CONSTRAINT rebalancing_proposals_status_chk
      CHECK (status IN ('proposed', 'applied', 'partially_applied', 'cancelled', 'expired'));
  END IF;
END$$;

COMMIT;

-- Rollback instructions (manual):
-- DROP TABLE IF EXISTS proposal_moves CASCADE;
-- DROP TABLE IF EXISTS rebalancing_proposals CASCADE;




