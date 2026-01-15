BEGIN;

-- 1. MATERIALIZED VIEW for "Heavy" Aggregates (Streaks, Chill Bank, Grades)
-- Refreshed asynchronously (e.g., via cron or after specific triggers)
CREATE MATERIALIZED VIEW IF NOT EXISTS dashboard_stats_mv AS
SELECT
    u.id AS user_id,
    COALESCE(s.current_count, 0) AS current_streak,
    -- Chill Bank: Sum of earned_chill_minutes minus used chill_minutes from all weekly productivity
    COALESCE(
        (SELECT 
            SUM(earned_chill_minutes - chill_minutes)
         FROM user_weekly_productivity
         WHERE user_id = u.id
        ),
        0
    ) AS chill_bank_balance,
    -- Grade Forecast aggregation: Average current_score from course_grade_forecasts
    COALESCE(
        (SELECT AVG(current_score)
         FROM course_grade_forecasts
         WHERE user_id = u.id
           AND current_score IS NOT NULL
        ),
        0
    ) AS gpa_trend,
    NOW() AS last_refreshed_at
FROM users u
LEFT JOIN user_streaks s ON s.user_id = u.id AND s.streak_type = 'productivity';

-- Unique index on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_stats_user ON dashboard_stats_mv (user_id);

-- 2. COVERING INDEX for "Real-Time" Schedule (The "Today" View)
-- Allows fetching today's schedule + status without hitting the heap for these columns.
-- Note: calendar_events_new doesn't have priority_score or status - those are on assignments
-- Only create if calendar_events_new table exists (from migration 0008)
-- This will be skipped gracefully if the table doesn't exist yet
DO $idx$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events_new'
  ) THEN
    -- Table exists, create the index using EXECUTE (required in DO blocks)
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_dashboard_fetch ON calendar_events_new (user_id, start_at) INCLUDE (title, event_type, is_movable)';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table calendar_events_new does not exist, skipping index creation';
  WHEN others THEN
    RAISE NOTICE 'Could not create covering index: %', SQLERRM;
END $idx$;

-- 3. FUNCTION to refresh specific user stats (can be called by Rebalancing Engine)
-- Note: CONCURRENTLY requires a unique index (which we have above)
CREATE OR REPLACE FUNCTION refresh_dashboard_stats_concurrently()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats_mv;
END;
$$ LANGUAGE plpgsql;

COMMENT ON MATERIALIZED VIEW dashboard_stats_mv IS
  'Precomputed dashboard statistics for fast loading. Refresh via refresh_dashboard_stats_concurrently().';

-- Comment on index (only if it exists - skip if table doesn't exist)
DO $comment$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'calendar_events_new'
      AND indexname = 'idx_events_dashboard_fetch'
  ) THEN
    EXECUTE 'COMMENT ON INDEX idx_events_dashboard_fetch IS ''Covering index for dashboard schedule queries. Includes commonly-fetched columns to avoid heap lookups.''';
  END IF;
END $comment$;

COMMENT ON FUNCTION refresh_dashboard_stats_concurrently() IS
  'Refreshes dashboard_stats_mv concurrently (non-blocking). Requires unique index on user_id.';

COMMIT;



