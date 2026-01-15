-- 0015: Rebalancing — Rollback Snapshots
-- 
-- Purpose:
-- - Enable the one-tap "Undo" feature by storing pre-move state
-- - Links snapshots to proposals for fast lookup
-- - Supports 7-day retention cleanup job
--
-- Prerequisites:
-- - rebalancing_proposals table (from migration 0013_5) ✅
-- - users table (from migration 0001) ✅
--
-- Notes:
-- - Circular reference: rollback_snapshots.proposal_id → rebalancing_proposals.id
--   and rebalancing_proposals.snapshot_id → rollback_snapshots.id
--   This is safe because snapshot_id is nullable and can be set after snapshot creation

BEGIN;

-- 1) Create rollback_snapshots table
-- Stores point-in-time event state for undo operations
CREATE TABLE IF NOT EXISTS rollback_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID UNIQUE NOT NULL REFERENCES rebalancing_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Added FK for RLS and data integrity
  payload JSONB NOT NULL, -- Array of { event_id, start_at, end_at, title, is_movable, metadata, updated_at, version }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Index for the 7-day retention cleanup job
-- Allows efficient queries by user and creation date for cleanup
CREATE INDEX IF NOT EXISTS idx_snapshots_user_created 
  ON rollback_snapshots (user_id, created_at DESC);

-- 3) Link the snapshot back to the proposal (bidirectional reference)
-- This allows fast lookup from proposal to snapshot
-- Note: snapshot_id column may already exist from migration 0013_5 (as UUID without FK)
DO $$
BEGIN
  -- Add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rebalancing_proposals'
      AND column_name = 'snapshot_id'
  ) THEN
    ALTER TABLE rebalancing_proposals 
      ADD COLUMN snapshot_id UUID;
    
    RAISE NOTICE 'Added snapshot_id column to rebalancing_proposals';
  ELSE
    RAISE NOTICE 'snapshot_id column already exists in rebalancing_proposals';
  END IF;

  -- Add FK constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'rebalancing_proposals'::regclass
      AND conname = 'rebalancing_proposals_snapshot_id_fkey'
  ) THEN
    ALTER TABLE rebalancing_proposals 
      ADD CONSTRAINT rebalancing_proposals_snapshot_id_fkey
      FOREIGN KEY (snapshot_id) 
      REFERENCES rollback_snapshots(id) 
      ON DELETE SET NULL; -- If snapshot is deleted, set proposal.snapshot_id to NULL (don't cascade)
    
    RAISE NOTICE 'Added FK constraint from rebalancing_proposals.snapshot_id to rollback_snapshots.id';
  ELSE
    RAISE NOTICE 'FK constraint on rebalancing_proposals.snapshot_id already exists';
  END IF;
END$$;

COMMIT;

-- Rollback instructions (manual):
-- ALTER TABLE rebalancing_proposals DROP CONSTRAINT IF EXISTS rebalancing_proposals_snapshot_id_fkey;
-- ALTER TABLE rebalancing_proposals DROP COLUMN IF EXISTS snapshot_id;
-- DROP INDEX IF EXISTS idx_snapshots_user_created;
-- DROP TABLE IF EXISTS rollback_snapshots CASCADE;



