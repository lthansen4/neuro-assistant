# Migration 0014 Review: Rebalancing Concurrency & Assignment Linkage

## Summary
Migration 0014 adds baseline fields for stale-checking, metadata for assignment/calendar event linkage, and a database-level defense-in-depth trigger to prevent moving/resizing immovable events.

## Critical Issues ⚠️

### 1. **CRITICAL: `proposal_moves` table does not exist**
**Issue:** The migration assumes `proposal_moves` exists, but this table has not been created in any previous migration.

**Impact:** The migration will fail with:
```
ERROR: relation "proposal_moves" does not exist
```

**Recommendation:** 
- **Option A (Preferred):** Create `proposal_moves` table in a separate migration (e.g., `0013_5_rebalancing_base_tables.sql`) before applying 0014
- **Option B:** Add a `CREATE TABLE IF NOT EXISTS proposal_moves` block at the start of 0014, then add the columns
- **Option C:** Document this as a prerequisite and require `rebalancing_proposals` and `proposal_moves` to be created first

**From PRD, `proposal_moves` should have:**
- `id` (UUID, PK)
- `proposal_id` (UUID, FK → `rebalancing_proposals.id` ON DELETE CASCADE)
- `user_id` (UUID, FK → `users.id`)
- `move_type` (TEXT) — `insert | move | resize | delete`
- `source_event_id` (UUID, nullable, FK → `calendar_events_new.id`)
- `target_start_at` (TIMESTAMPTZ, nullable)
- `target_end_at` (TIMESTAMPTZ, nullable)
- `delta_minutes` (INT, nullable)
- `churn_cost` (INT, default 0)
- `category` (TEXT, nullable)
- `reason_codes` (JSONB, default '[]')
- `base_priority` (NUMERIC(6,3), nullable)
- `energy_multiplier` (NUMERIC(4,2), nullable)
- `final_priority` (NUMERIC(6,3), nullable)
- `feasibility_flags` (JSONB, nullable)
- `created_at` (TIMESTAMPTZ, default now())

**Plus indexes:**
- `idx_proposal_moves_proposal` on (`proposal_id`)
- `idx_proposal_moves_user_target` on (`user_id`, `target_start_at`)

### 2. **`rebalancing_proposals` table does not exist**
**Issue:** `proposal_moves` has a foreign key to `rebalancing_proposals.id`, but `rebalancing_proposals` also doesn't exist.

**Impact:** Cannot create `proposal_moves` without `rebalancing_proposals` first.

**Recommendation:** Create `rebalancing_proposals` table in the same prerequisite migration as `proposal_moves`.

## Review of Provided SQL

### ✅ Positive Aspects

1. **Idempotency:** Uses `IF NOT EXISTS` and `DO` blocks for conditional logic
2. **Defense-in-depth:** Trigger on `calendar_events_new` to prevent moving immovable events at DB layer
3. **Index strategy:** Appropriate indexes for assignment linkage and metadata queries
4. **Transaction safety:** Wrapped in `BEGIN/COMMIT`

### ⚠️ Issues in Provided SQL

#### Issue 1: Missing table dependency
```sql
ALTER TABLE proposal_moves  -- ❌ Table doesn't exist!
  ADD COLUMN IF NOT EXISTS baseline_updated_at TIMESTAMPTZ,
  ...
```

**Fix:** Either create the table first or use `CREATE TABLE IF NOT EXISTS` with all columns.

#### Issue 2: Foreign key reference
```sql
CREATE INDEX IF NOT EXISTS idx_proposal_moves_source
  ON proposal_moves (source_event_id);
```

This index assumes the table exists. Safe if using `IF NOT EXISTS`, but the table creation should happen first.

#### Issue 3: Expression index syntax
```sql
CREATE INDEX IF NOT EXISTS idx_moves_assignment
  ON proposal_moves ((metadata->>'assignment_id'));
```

This is correct PostgreSQL syntax for expression indexes. ✅

#### Issue 4: Trigger function error handling
```sql
CREATE FUNCTION prevent_move_immovable() RETURNS trigger AS $f$
BEGIN
  IF (OLD.is_movable = FALSE)
     AND (
       (NEW.start_at IS DISTINCT FROM OLD.start_at)
       OR (NEW.end_at IS DISTINCT FROM OLD.end_at)
     )
  THEN
    RAISE EXCEPTION 'Cannot move or resize an immovable event (id=%).', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql;
```

**Review:**
- ✅ Correctly checks `is_movable = FALSE`
- ✅ Uses `IS DISTINCT FROM` to handle NULLs correctly
- ✅ Proper error message with event ID
- ✅ Uses `check_violation` error code (appropriate)

**Minor improvement suggestion:** Consider using `23514` (check_violation) explicitly or a custom error code for better error handling in application code.

#### Issue 5: Index on `calendar_events_new` metadata
```sql
CREATE INDEX IF NOT EXISTS idx_events_user_assignment
  ON calendar_events_new (user_id, (metadata->>'assignment_id'));
```

**Review:**
- ✅ Good covering index for assignment-linked event queries
- ✅ Expression index on JSONB path is correct
- ✅ Includes `user_id` for efficient filtering

**Consideration:** This index will only be used when querying with `user_id` and the metadata path. Ensure query patterns match this index.

### 📋 Recommended Migration Structure

**Option 1: Split into two migrations (Recommended)**

**Migration 0013_5: Create base rebalancing tables**
```sql
-- Create rebalancing_proposals table
-- Create proposal_moves table (without baseline fields)
-- Create initial indexes
```

**Migration 0014: Add concurrency and linkage**
```sql
-- Add baseline_updated_at, baseline_version, metadata to proposal_moves
-- Add indexes for assignment linkage
-- Add trigger for immovable events
-- Add index on calendar_events_new
```

**Option 2: Single migration with table creation (If tables don't exist)**
```sql
BEGIN;

-- 1) Create rebalancing_proposals if it doesn't exist
CREATE TABLE IF NOT EXISTS rebalancing_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  -- ... other columns from PRD
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Create proposal_moves if it doesn't exist (WITH baseline fields)
CREATE TABLE IF NOT EXISTS proposal_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES rebalancing_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  -- ... core columns
  baseline_updated_at TIMESTAMPTZ,  -- ✅ Include in CREATE
  baseline_version BIGINT,           -- ✅ Include in CREATE
  metadata JSONB,                    -- ✅ Include in CREATE
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Add columns only if table exists but columns don't (for idempotency)
ALTER TABLE proposal_moves
  ADD COLUMN IF NOT EXISTS baseline_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS baseline_version BIGINT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 4) Continue with indexes and trigger as provided...
```

## Detailed SQL Review

### ✅ Correct Patterns

1. **Conditional index creation:**
   ```sql
   CREATE INDEX IF NOT EXISTS idx_proposal_moves_source
     ON proposal_moves (source_event_id);
   ```
   ✅ Safe even if table doesn't exist (will fail gracefully after table creation)

2. **DO block for conditional function/trigger creation:**
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_move_immovable') THEN
       CREATE FUNCTION prevent_move_immovable() ...
     END IF;
   END$$;
   ```
   ✅ Good idempotency pattern

3. **GIN index for JSONB:**
   ```sql
   CREATE INDEX IF NOT EXISTS idx_proposal_moves_metadata_gin
     ON proposal_moves USING gin (metadata);
   ```
   ✅ Correct syntax for JSONB indexing

### ⚠️ Potential Issues

1. **Function exists check:**
   ```sql
   IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_move_immovable')
   ```
   This checks by name only, not signature. If a function with the same name but different signature exists, this could fail.

   **Better approach:**
   ```sql
   IF NOT EXISTS (
     SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname = 'prevent_move_immovable'
       AND pg_get_function_arguments(p.oid) = ''
   )
   ```

2. **Trigger existence check:**
   ```sql
   IF NOT EXISTS (
     SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_move_immovable'
   )
   ```
   ✅ This is correct, but consider also checking the table:
   ```sql
   AND tgrelid = 'calendar_events_new'::regclass
   ```

## Recommended Changes

### Change 1: Add table existence checks
Wrap all `proposal_moves` operations in a conditional block:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_name = 'proposal_moves') THEN
    -- Add columns, create indexes, etc.
  ELSE
    RAISE NOTICE 'proposal_moves table does not exist. Skipping migration 0014.';
    RAISE NOTICE 'Please create rebalancing base tables first.';
  END IF;
END$$;
```

### Change 2: Ensure calendar_events_new exists
The trigger assumes `calendar_events_new` exists (which it does from migration 0008). This is fine, but add a comment:

```sql
-- NOTE: calendar_events_new table must exist (created in migration 0008)
```

### Change 3: Add rollback instructions
Include manual rollback steps in comments:

```sql
-- Rollback instructions (manual):
-- DROP TRIGGER IF EXISTS trg_prevent_move_immovable ON calendar_events_new;
-- DROP FUNCTION IF EXISTS prevent_move_immovable();
-- DROP INDEX IF EXISTS idx_events_user_assignment;
-- DROP INDEX IF EXISTS idx_moves_assignment;
-- DROP INDEX IF EXISTS idx_proposal_moves_metadata_gin;
-- DROP INDEX IF EXISTS idx_proposal_moves_source;
-- ALTER TABLE proposal_moves DROP COLUMN IF EXISTS baseline_updated_at;
-- ALTER TABLE proposal_moves DROP COLUMN IF EXISTS baseline_version;
-- ALTER TABLE proposal_moves DROP COLUMN IF EXISTS metadata;
```

## Testing Recommendations

1. **Test with missing table:**
   - Run migration without `proposal_moves` table → Should fail gracefully or skip

2. **Test with existing table:**
   - Create minimal `proposal_moves` table first
   - Run migration → Should add columns and indexes

3. **Test trigger:**
   ```sql
   -- Create test event with is_movable = false
   INSERT INTO calendar_events_new (user_id, title, event_type, start_at, end_at, is_movable)
   VALUES ('...', 'Test Class', 'Class', NOW(), NOW() + INTERVAL '1 hour', false);
   
   -- Try to update start_at → Should fail
   UPDATE calendar_events_new 
   SET start_at = start_at + INTERVAL '30 minutes'
   WHERE id = '...';
   -- Expected: ERROR with check_violation
   
   -- Try to update non-time field → Should succeed
   UPDATE calendar_events_new 
   SET title = 'Updated Title'
   WHERE id = '...';
   -- Expected: Success
   ```

4. **Test indexes:**
   ```sql
   -- Verify indexes exist
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE tablename IN ('proposal_moves', 'calendar_events_new')
   AND indexname LIKE 'idx%';
   
   -- Test index usage (should use index)
   EXPLAIN SELECT * FROM proposal_moves 
   WHERE metadata->>'assignment_id' = 'some-uuid';
   ```

## Migration Order Recommendation

If `proposal_moves` doesn't exist, create migrations in this order:

1. **Migration 0013_5** (new): Create base rebalancing tables
   - `rebalancing_proposals`
   - `proposal_moves` (core columns only)
   - Initial indexes

2. **Migration 0014**: Add concurrency and linkage (this migration)
   - Add baseline fields to `proposal_moves`
   - Add assignment linkage indexes
   - Add immovable event trigger

3. **Future migrations:** Add remaining rebalancing tables
   - `rollback_snapshots`
   - `rebalancing_apply_attempts`
   - `churn_ledger`
   - `churn_settings`

## Final Recommendation

**Status:** ⚠️ **NOT READY** - Missing prerequisite tables

**Action Required:**
1. Create `rebalancing_proposals` and `proposal_moves` tables first (in a new migration 0013_5)
2. Update migration 0014 to handle both cases:
   - Table exists: Add columns (current behavior)
   - Table doesn't exist: Gracefully skip or create with all columns
3. Add table existence checks for safety
4. Test trigger with immovable events

**Alternative:** If you want to proceed with 0014 as-is, document that `proposal_moves` must be created manually first, and add a check to skip gracefully if it doesn't exist.




