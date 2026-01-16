# Migration Order: Rebalancing Engine Base Tables → Concurrency & Linkage

## Overview
The Rebalancing Engine requires two migrations to be applied in order:
1. **Migration 0013_5**: Creates base tables (`rebalancing_proposals`, `proposal_moves`)
2. **Migration 0014**: Adds baseline fields, indexes, and triggers to existing tables

## Migration Sequence

### Step 1: Migration 0013_5 - Base Tables

**File:** `packages/db/migrations/0013_5_rebalancing_base_tables.sql`

**What it creates:**
- ✅ `rebalancing_proposals` table (proposal metadata and status)
- ✅ `proposal_moves` table (individual diff operations - core columns only)
- ✅ Indexes on both tables (core indexes only)
- ✅ CHECK constraints for enums (`move_type`, `status`)

**Prerequisites:**
- ✅ `users` table (from migration 0001)
- ✅ `calendar_events_new` table (from migration 0008)

**Note:** `snapshot_id` column in `rebalancing_proposals` is a UUID without FK constraint (will be added when `rollback_snapshots` table is created later)

### Step 2: Migration 0014 - Concurrency & Linkage

**File:** `packages/db/migrations/0014_rebalancing_concurrency_assignment_linkage.sql`

**What it adds:**
- ✅ `baseline_updated_at`, `baseline_version`, `metadata` columns to `proposal_moves`
- ✅ Additional indexes for assignment linkage:
  - `idx_proposal_moves_source` (on `source_event_id`)
  - `idx_proposal_moves_metadata_gin` (GIN index on `metadata`)
  - `idx_moves_assignment` (expression index on `metadata->>'assignment_id'`)
- ✅ Index on `calendar_events_new` for assignment linkage:
  - `idx_events_user_assignment` (on `user_id, (metadata->>'assignment_id')`)
- ✅ Defense-in-depth trigger:
  - `prevent_move_immovable()` function
  - `trg_prevent_move_immovable` trigger on `calendar_events_new`

**Prerequisites:**
- ✅ `proposal_moves` table (from migration 0013_5)
- ✅ `calendar_events_new` table (from migration 0008)

**Note:** Migration 0014 gracefully handles missing `proposal_moves` table (skips those operations with warnings, but still creates trigger on `calendar_events_new`)

## Running the Migrations

### Option 1: Run individually

```bash
# Step 1: Create base tables
npm run tsx scripts/run-migration-0013_5.ts

# Step 2: Add concurrency and linkage
npm run tsx scripts/run-migration-0014.ts
```

### Option 2: Run via Drizzle Kit (if configured)

```bash
# Apply both migrations
npx drizzle-kit push
```

### Verification

After running both migrations, verify:

1. **Tables exist:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
     AND table_name IN ('rebalancing_proposals', 'proposal_moves');
   ```

2. **proposal_moves has baseline fields:**
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'proposal_moves' 
     AND column_name IN ('baseline_updated_at', 'baseline_version', 'metadata');
   ```

3. **Trigger exists:**
   ```sql
   SELECT tgname 
   FROM pg_trigger 
   WHERE tgname = 'trg_prevent_move_immovable';
   ```

## Migration Dependencies

```
Migration 0001 (users table)
    ↓
Migration 0008 (calendar_events_new table)
    ↓
Migration 0013_5 (rebalancing_proposals, proposal_moves) ← NEW
    ↓
Migration 0014 (baseline fields, indexes, triggers) ← EXISTS
```

## Future Migrations

After 0014, you may want to create:

- **Migration 0015**: `rollback_snapshots` table (adds FK constraint to `rebalancing_proposals.snapshot_id`)
- **Migration 0016**: `rebalancing_apply_attempts` table (audit trail)
- **Migration 0017**: `churn_ledger` and `churn_settings` tables (churn tracking)
- **Migration 0018**: `rebalancing_reason_codes` catalog table (optional)

## Rollback Strategy

If you need to rollback:

1. **Rollback 0014 first:**
   ```sql
   -- Remove trigger and function
   DROP TRIGGER IF EXISTS trg_prevent_move_immovable ON calendar_events_new;
   DROP FUNCTION IF EXISTS prevent_move_immovable();
   
   -- Remove indexes
   DROP INDEX IF EXISTS idx_events_user_assignment;
   DROP INDEX IF EXISTS idx_moves_assignment;
   DROP INDEX IF EXISTS idx_proposal_moves_metadata_gin;
   DROP INDEX IF EXISTS idx_proposal_moves_source;
   
   -- Remove columns from proposal_moves
   ALTER TABLE proposal_moves 
     DROP COLUMN IF EXISTS baseline_updated_at,
     DROP COLUMN IF EXISTS baseline_version,
     DROP COLUMN IF EXISTS metadata;
   ```

2. **Then rollback 0013_5:**
   ```sql
   DROP TABLE IF EXISTS proposal_moves CASCADE;
   DROP TABLE IF EXISTS rebalancing_proposals CASCADE;
   ```

**Warning:** Dropping `proposal_moves` will CASCADE and drop all related indexes and constraints. Make sure you have backups.

## Testing Recommendations

### Test Migration 0013_5

```sql
-- 1. Verify tables created
SELECT COUNT(*) FROM rebalancing_proposals; -- Should return 0 (empty)
SELECT COUNT(*) FROM proposal_moves; -- Should return 0 (empty)

-- 2. Test FK relationships
INSERT INTO rebalancing_proposals (user_id, trigger, status)
VALUES ('<test-user-id>', 'manual', 'proposed')
RETURNING id;

-- 3. Test proposal_moves FK
INSERT INTO proposal_moves (proposal_id, user_id, move_type)
VALUES ('<proposal-id>', '<test-user-id>', 'insert')
RETURNING id;
```

### Test Migration 0014

```sql
-- 1. Verify baseline columns exist
SELECT 
  baseline_updated_at, 
  baseline_version, 
  metadata 
FROM proposal_moves 
LIMIT 1;

-- 2. Test trigger (prevent moving immovable events)
-- Create test event with is_movable = false
INSERT INTO calendar_events_new (user_id, title, event_type, start_at, end_at, is_movable)
VALUES ('<test-user-id>', 'Test Class', 'Class', NOW(), NOW() + INTERVAL '1 hour', false)
RETURNING id;

-- Try to update start_at → Should FAIL
UPDATE calendar_events_new 
SET start_at = start_at + INTERVAL '30 minutes'
WHERE id = '<test-event-id>';
-- Expected: ERROR: Cannot move or resize an immovable event

-- Try to update title → Should SUCCEED
UPDATE calendar_events_new 
SET title = 'Updated Title'
WHERE id = '<test-event-id>';
-- Expected: Success
```

## Success Criteria

- ✅ Both migrations run without errors
- ✅ All tables created with correct structure
- ✅ All indexes created and functional
- ✅ Trigger prevents moving immovable events
- ✅ Baseline fields available for stale-checking
- ✅ Assignment linkage indexes support query performance





