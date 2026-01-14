# Migration 0006: Rebalancing Engine Fields - Conflict Resolution

## Conflicts Detected

### 1. `is_movable` in `calendar_events`
**Status:** ✅ **RESOLVED** - Column already exists
- **Current:** `is_movable boolean default false` (from 0001_unified.sql)
- **Requested:** Add `is_movable boolean DEFAULT true`
- **Resolution:** Column already exists with `default false`. We preserve the existing default. The migration will skip adding it due to `IF NOT EXISTS`.

**Action:** No change needed - existing column is kept as-is.

---

### 2. `estimated_effort_minutes` vs `effort_estimate_minutes` in `assignments`
**Status:** ✅ **RESOLVED** - Different column name detected
- **Current:** `effort_estimate_minutes integer` (from 0001_unified.sql)
- **Requested:** Add `estimated_effort_minutes int` (if not exists)
- **Resolution:** We already have `effort_estimate_minutes`. Adding `estimated_effort_minutes` would create a duplicate column with a different name, which is incorrect.

**Action:** No change needed - existing column `effort_estimate_minutes` is kept.

---

### 3. `user_streaks` table structure conflict
**Status:** ⚠️ **REQUIRES DECISION**

**Current Structure:**
```sql
CREATE TABLE user_streaks (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL,  -- Only one streak per user
  current_streak_days int,
  longest_streak_days int,
  last_active_date date,
  created_at timestamptz
);
```

**Requested Structure:**
```sql
CREATE TABLE user_streaks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  streak_type varchar(32) NOT NULL,  -- Multiple streaks per user
  current_count int,
  longest_count int,
  last_incremented_on date,
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE (user_id, streak_type)  -- Multiple streaks per user
);
```

**Key Differences:**
1. Current: One streak per user (unique on `user_id`)
2. Requested: Multiple streaks per user (unique on `user_id, streak_type`)
3. Field names: `current_streak_days` vs `current_count`, `last_active_date` vs `last_incremented_on`
4. New field: `streak_type` (e.g., 'productivity', 'login')
5. New field: `updated_at`

**Options:**
1. **Option A (Recommended):** Create new table `user_streaks_v2` with new structure, keep old table for backward compatibility
2. **Option B:** Migrate existing table (breaking change - requires data migration script)
3. **Option C:** Keep both structures (old table for single streak, new table for multi-type streaks)

**Current Migration:** Option A is implemented (commented out). Uncomment if you want to create the new table.

---

## Migration Applied

### ✅ Applied Changes:
1. **courses.term** - Added `VARCHAR(32)` (nullable)
2. **courses.year** - Added `INTEGER` (nullable)
3. **calendar_events.is_recurring** - Added `BOOLEAN DEFAULT false`
4. **idx_courses_user** - Added index on `courses(user_id)`

### ⏸️ Skipped (Already Exist):
1. **calendar_events.is_movable** - Already exists with `default false`
2. **assignments.effort_estimate_minutes** - Already exists (different name than requested)

### ⏸️ Deferred (Requires Decision):
1. **user_streaks** - New structure commented out pending decision on migration strategy

---

## Next Steps

1. **Review `user_streaks` migration strategy:**
   - Decide if you want to create `user_streaks_v2` or migrate existing table
   - If migrating, create a separate migration with data transformation script

2. **Apply migration:**
   ```sql
   -- Run in Supabase SQL Editor or via migration tool
   \i packages/db/migrations/0006_rebalancing_engine_fields.sql
   ```

3. **Verify:**
   ```sql
   -- Check that columns were added
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'courses' AND column_name IN ('term', 'year');
   
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'calendar_events' AND column_name = 'is_recurring';
   ```

