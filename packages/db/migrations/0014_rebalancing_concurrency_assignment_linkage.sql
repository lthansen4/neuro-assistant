-- 0014: Rebalancing Engine — Concurrency Baselines & Assignment Linkage
-- 
-- Purpose:
-- - Adds baseline fields for stale-checks (baseline_updated_at, baseline_version)
-- - Adds metadata column for assignment/calendar event linkage
-- - Creates indexes for performance (assignment lookups, metadata queries)
-- - Adds defense-in-depth trigger to prevent moving/resizing immovable events
--
-- Prerequisites:
-- - calendar_events_new table (created in migration 0008) ✅
-- - proposal_moves table (should exist, but gracefully handles missing case) ⚠️
--
-- Notes:
-- - Uses IF NOT EXISTS for additive safety
-- - Index creation is non-concurrent to keep this migration single-transaction friendly
--   (switch to CONCURRENTLY in a follow-up ops script if your table sizes require it)

BEGIN;

-- 1) proposal_moves: baseline fields for stale-checks (captured at plan time)
--    NOTE: This assumes proposal_moves exists. If it doesn't, the migration will fail.
--    See MIGRATION_0014_REVIEW.md for prerequisite table creation.

DO $$
BEGIN
  -- Check if proposal_moves table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'proposal_moves'
  ) THEN
    -- Table exists, add columns
    ALTER TABLE proposal_moves
      ADD COLUMN IF NOT EXISTS baseline_updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS baseline_version BIGINT,
      ADD COLUMN IF NOT EXISTS metadata JSONB;
    
    RAISE NOTICE 'Added baseline fields to proposal_moves table.';
  ELSE
    RAISE WARNING 'proposal_moves table does not exist. Skipping column additions.';
    RAISE WARNING 'Please create rebalancing base tables (rebalancing_proposals, proposal_moves) before applying this migration.';
  END IF;
END$$;

-- 2) Helpful source lookup index (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'proposal_moves'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_proposal_moves_source
      ON proposal_moves (source_event_id);
    RAISE NOTICE 'Created idx_proposal_moves_source index.';
  END IF;
END$$;

-- 3) GIN index for metadata lookups (assignment_id and others) (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'proposal_moves'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_proposal_moves_metadata_gin
      ON proposal_moves
      USING gin (metadata);
    RAISE NOTICE 'Created idx_proposal_moves_metadata_gin index.';
  END IF;
END$$;

-- 4) Assignment linkage: expression index to filter moves by assignment_id
--    Stored as text to avoid cast issues if JSON holds string UUIDs (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'proposal_moves'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_moves_assignment
      ON proposal_moves ((metadata->>'assignment_id'));
    RAISE NOTICE 'Created idx_moves_assignment index.';
  END IF;
END$$;

-- 5) Calendar event linkage: user + assignment_id for fast fetch of scheduled work for a given assignment
--    NOTE: calendar_events_new must exist (created in migration 0008)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events_new'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_events_user_assignment
      ON calendar_events_new (user_id, (metadata->>'assignment_id'));
    RAISE NOTICE 'Created idx_events_user_assignment index.';
  ELSE
    RAISE WARNING 'calendar_events_new table does not exist. Skipping index creation.';
    RAISE WARNING 'This migration requires calendar_events_new from migration 0008.';
  END IF;
END$$;

-- 6) Defense-in-depth: prevent moving/resizing immovable events at the DB layer
--    Allows non-time edits (title, notes, etc.) but blocks start/end mutations when is_movable=false
--    NOTE: calendar_events_new must exist (created in migration 0008)
DO $$
BEGIN
  -- Check if calendar_events_new exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events_new'
  ) THEN
    RAISE WARNING 'calendar_events_new table does not exist. Skipping trigger creation.';
    RAISE WARNING 'This migration requires calendar_events_new from migration 0008.';
    RETURN;
  END IF;

  -- Create function if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'prevent_move_immovable'
      AND pg_get_function_arguments(p.oid) = ''
  ) THEN
    CREATE FUNCTION prevent_move_immovable() RETURNS trigger AS $f$
    BEGIN
      IF (OLD.is_movable = FALSE)
         AND (
           (NEW.start_at IS DISTINCT FROM OLD.start_at)
           OR (NEW.end_at IS DISTINCT FROM OLD.end_at)
         )
      THEN
        RAISE EXCEPTION 'Cannot move or resize an immovable event (id=%).', OLD.id
          USING ERRCODE = '23514'; -- check_violation
      END IF;
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
    
    RAISE NOTICE 'Created prevent_move_immovable() function.';
  ELSE
    RAISE NOTICE 'Function prevent_move_immovable() already exists. Skipping creation.';
  END IF;

  -- Create trigger if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_prevent_move_immovable'
      AND tgrelid = 'calendar_events_new'::regclass
  ) THEN
    CREATE TRIGGER trg_prevent_move_immovable
      BEFORE UPDATE ON calendar_events_new
      FOR EACH ROW
      EXECUTE FUNCTION prevent_move_immovable();
    
    RAISE NOTICE 'Created trg_prevent_move_immovable trigger.';
  ELSE
    RAISE NOTICE 'Trigger trg_prevent_move_immovable already exists. Skipping creation.';
  END IF;
END$$;

COMMIT;

-- Rollback instructions (manual):
-- DROP TRIGGER IF EXISTS trg_prevent_move_immovable ON calendar_events_new;
-- DROP FUNCTION IF EXISTS prevent_move_immovable();
-- DROP INDEX IF EXISTS idx_events_user_assignment ON calendar_events_new;
-- DROP INDEX IF EXISTS idx_moves_assignment ON proposal_moves;
-- DROP INDEX IF EXISTS idx_proposal_moves_metadata_gin ON proposal_moves;
-- DROP INDEX IF EXISTS idx_proposal_moves_source ON proposal_moves;
-- ALTER TABLE proposal_moves DROP COLUMN IF EXISTS baseline_updated_at;
-- ALTER TABLE proposal_moves DROP COLUMN IF EXISTS baseline_version;
-- ALTER TABLE proposal_moves DROP COLUMN IF EXISTS metadata;



