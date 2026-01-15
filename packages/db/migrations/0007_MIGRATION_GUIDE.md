# Migration 0007: User Streaks Migration Guide

## ✅ Migration Status: COMPLETED

This migration successfully transformed the `user_streaks` table from a single-streak-per-user model to a multi-type streak model.

## What Changed

### Database Schema
- **Old:** One streak per user (unique on `user_id`)
- **New:** Multiple streaks per user (unique on `user_id, streak_type`)

### Field Changes
| Old Field | New Field | Status |
|-----------|-----------|--------|
| `current_streak_days` | `current_count` | ✅ Migrated, old column kept for safety |
| `longest_streak_days` | `longest_count` | ✅ Migrated, old column kept for safety |
| `last_active_date` | `last_incremented_on` | ✅ Migrated, old column kept for safety |
| - | `streak_type` | ✅ **NEW** - Required field (defaults to 'productivity') |
| - | `updated_at` | ✅ **NEW** - Timestamp for updates |

### Code Changes Completed
1. ✅ **TypeScript Schema** (`packages/db/src/schema.ts`)
   - Updated `userStreaks` table definition
   - Changed field names to match new structure
   - Added `streakType` field and unique constraint

2. ✅ **API Endpoint** (`apps/api/src/routes/dashboard.ts`)
   - Updated query to filter by `streak_type = 'productivity'`
   - Uses `and()` to combine userId and streakType filters

3. ✅ **UI Component** (`apps/web/components/StreakBadge.tsx`)
   - Updated interface to use new field names
   - `currentStreakDays` → `currentCount`
   - `longestStreakDays` → `longestCount`
   - `lastActiveDate` → `lastIncrementedOn`

## Verification Results

✅ **Schema Query:** Works correctly  
✅ **Filter by streak_type:** Functional  
✅ **Table Structure:** All new columns exist with correct types  
✅ **Constraints:** New unique constraint exists, old one removed  
✅ **TypeScript Compilation:** No errors  

## Next Steps (Optional Cleanup)

After confirming everything works in production, you can optionally remove the old columns:

```sql
ALTER TABLE user_streaks
  DROP COLUMN IF EXISTS current_streak_days,
  DROP COLUMN IF EXISTS longest_streak_days,
  DROP COLUMN IF EXISTS last_active_date;
```

**Note:** These columns are kept for safety. They can be safely removed after you've verified the application works correctly with the new structure.

## How to Test

1. **Start the API server:**
   ```bash
   npm run dev -w @neuro/api
   ```

2. **Test the dashboard endpoint:**
   ```bash
   curl http://localhost:8787/api/dashboard/summary?range=week \
     -H "x-user-id: YOUR_USER_ID"
   ```

3. **Start the web server:**
   ```bash
   npm run dev -w @neuro/web
   ```

4. **Navigate to dashboard** and verify the streak badge displays correctly (should show 0 if no streaks exist yet, which is expected)

## Benefits Achieved

1. ✅ **Flexibility:** Support multiple streak types (productivity, login, etc.)
2. ✅ **Future-Proof:** Aligns with Rebalancing Engine requirements
3. ✅ **Scalability:** Can track different metrics separately
4. ✅ **Clean Architecture:** Single table for all streak types

## Rollback Plan (If Needed)

If you need to rollback, run:

```sql
-- Restore old structure (requires old columns to still exist)
ALTER TABLE user_streaks
  DROP CONSTRAINT IF EXISTS user_streaks_user_id_streak_type_key,
  ADD CONSTRAINT user_streaks_user_id_key UNIQUE (user_id);

-- Restore old column values
UPDATE user_streaks
SET
  current_streak_days = current_count,
  longest_streak_days = longest_count,
  last_active_date = last_incremented_on
WHERE streak_type = 'productivity';
```

Then revert the code changes in:
- `packages/db/src/schema.ts`
- `apps/api/src/routes/dashboard.ts`
- `apps/web/components/StreakBadge.tsx`

## Migration Scripts

- **Run migration:** `npx tsx scripts/run-migration-0007.ts`
- **Verify migration:** `npx tsx scripts/verify-streaks-migration.ts`

---

**Migration Date:** $(date)  
**Status:** ✅ Completed and Verified



