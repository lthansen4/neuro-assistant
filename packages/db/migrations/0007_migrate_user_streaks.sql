-- Migration 0007: Migrate user_streaks to multi-type structure
-- This migration transforms the existing single-streak table to support multiple streak types
-- All existing data is preserved and migrated to 'productivity' streak type

-- Step 1: Add new columns (nullable initially)
ALTER TABLE user_streaks
  ADD COLUMN IF NOT EXISTS streak_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS current_count INTEGER,
  ADD COLUMN IF NOT EXISTS longest_count INTEGER,
  ADD COLUMN IF NOT EXISTS last_incremented_on DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step 2: Migrate existing data to new structure
-- Assume all existing streaks are 'productivity' type
UPDATE user_streaks
SET
  streak_type = 'productivity',
  current_count = COALESCE(current_streak_days, 0),
  longest_count = COALESCE(longest_streak_days, 0),
  last_incremented_on = last_active_date,
  updated_at = created_at
WHERE streak_type IS NULL;

-- Step 3: Set NOT NULL constraints after data migration
ALTER TABLE user_streaks
  ALTER COLUMN streak_type SET NOT NULL,
  ALTER COLUMN current_count SET NOT NULL,
  ALTER COLUMN current_count SET DEFAULT 0,
  ALTER COLUMN longest_count SET NOT NULL,
  ALTER COLUMN longest_count SET DEFAULT 0;

-- Step 4: Drop old unique constraint on user_id
ALTER TABLE user_streaks
  DROP CONSTRAINT IF EXISTS user_streaks_user_id_key;

-- Step 5: Add new unique constraint on (user_id, streak_type)
ALTER TABLE user_streaks
  ADD CONSTRAINT user_streaks_user_id_streak_type_key UNIQUE (user_id, streak_type);

-- Step 6: Drop old columns (after migration is verified)
-- Commented out for safety - uncomment after verifying migration worked
/*
ALTER TABLE user_streaks
  DROP COLUMN IF EXISTS current_streak_days,
  DROP COLUMN IF EXISTS longest_streak_days,
  DROP COLUMN IF EXISTS last_active_date;
*/

-- Step 7: Add index for performance
CREATE INDEX IF NOT EXISTS idx_streaks_user ON user_streaks(user_id);

