-- 0014_5: Rebalancing Bridge — Calendar Integration
-- 
-- Purpose:
-- - Attach rebalancing constraints and indexes to calendar_events_new
-- - Adds the index for assignment linkage (if table exists)
-- - Attaches the immovable safety trigger (if table and function exist)
-- - Enforces referential integrity for proposal_moves.source_event_id
--
-- Prerequisites:
-- - calendar_events_new table (from migration 0008) ⚠️
-- - prevent_move_immovable() function (from migration 0014) ✅
-- - proposal_moves table (from migration 0013_5) ✅
--
-- Notes:
-- - This migration gracefully handles missing calendar_events_new table
-- - FK constraint will be added only if calendar_events_new exists and proposal_moves.source_event_id doesn't already have a FK

BEGIN;

-- 1) Create the Index for Assignment Linkage
-- Allows fast lookup of calendar blocks tied to specific assignments
-- Only create if calendar_events_new table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events_new'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_events_user_assignment
      ON calendar_events_new (user_id, (metadata->>'assignment_id'));
    
    RAISE NOTICE 'Created idx_events_user_assignment index on calendar_events_new';
  ELSE
    RAISE WARNING 'calendar_events_new table does not exist. Skipping index creation.';
    RAISE WARNING 'This migration requires calendar_events_new from migration 0008.';
  END IF;
END$$;

-- 2) Attach the "Immovable" Safety Trigger
-- Uses the function created in migration 0014 to prevent engine-driven overlaps with Class/Work
-- Only create if both calendar_events_new table and prevent_move_immovable() function exist
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

  -- Create function if it doesn't exist (it may not have been created in migration 0014 if calendar_events_new didn't exist)
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
    
    RAISE NOTICE 'Created trg_prevent_move_immovable trigger on calendar_events_new';
  ELSE
    RAISE NOTICE 'Trigger trg_prevent_move_immovable already exists. Skipping creation.';
  END IF;
END$$;

-- 3) Enforce Referential Integrity
-- Ensures moves cannot point to non-existent calendar events
-- Only add FK if calendar_events_new exists and FK doesn't already exist
DO $$
BEGIN
  -- Check if calendar_events_new exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events_new'
  ) THEN
    RAISE WARNING 'calendar_events_new table does not exist. Skipping FK constraint.';
    RAISE WARNING 'FK constraint will be added when calendar_events_new is created.';
    RETURN;
  END IF;

  -- Check if proposal_moves exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'proposal_moves'
  ) THEN
    RAISE WARNING 'proposal_moves table does not exist. Skipping FK constraint.';
    RETURN;
  END IF;

  -- Check if FK constraint already exists (by name)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'proposal_moves'::regclass
      AND conname = 'fk_proposal_moves_calendar_events'
  ) THEN
    -- Also check if source_event_id already has any FK constraint (by checking if column has FK)
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'proposal_moves'::regclass
        AND a.attname = 'source_event_id'
        AND c.contype = 'f'
    ) THEN
      RAISE NOTICE 'source_event_id already has a foreign key constraint. Skipping FK creation.';
    ELSE
      ALTER TABLE proposal_moves
        ADD CONSTRAINT fk_proposal_moves_calendar_events
        FOREIGN KEY (source_event_id) 
        REFERENCES calendar_events_new(id) 
        ON DELETE SET NULL; -- Changed from CASCADE to SET NULL to match original design
      
      RAISE NOTICE 'Added FK constraint from proposal_moves.source_event_id to calendar_events_new.id';
    END IF;
  ELSE
    RAISE NOTICE 'FK constraint fk_proposal_moves_calendar_events already exists. Skipping creation.';
  END IF;
END$$;

COMMIT;

-- Rollback instructions (manual):
-- DROP TRIGGER IF EXISTS trg_prevent_move_immovable ON calendar_events_new;
-- DROP INDEX IF EXISTS idx_events_user_assignment ON calendar_events_new;
-- ALTER TABLE proposal_moves DROP CONSTRAINT IF EXISTS fk_proposal_moves_calendar_events;





