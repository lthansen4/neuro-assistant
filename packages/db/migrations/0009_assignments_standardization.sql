-- Migration 0009: Assignments Standardization
-- Adds CHECK constraint on status and optimized indexes for dashboard queries
-- NOTE: This is additive - no breaking changes. Keeps existing indexes for backward compatibility.

BEGIN;

-- 1) Add/ensure a CHECK constraint on status
-- Note: The enum already enforces these values, but CHECK constraint provides:
-- - Extra validation layer (defense in depth)
-- - Potential query optimization hints
-- - Explicit documentation of allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignments_status_chk'
  ) THEN
    ALTER TABLE assignments
    ADD CONSTRAINT assignments_status_chk
    CHECK (status IN ('Inbox', 'Scheduled', 'Locked_In', 'Completed'));
  END IF;
END$$;

-- 2) High-value composite index for dashboard queries
-- This index optimizes queries like:
--   - "Get all assignments for user X with status Y ordered by due_date"
--   - "Get upcoming assignments (status Inbox/Scheduled) for user X"
--   - "Get completed assignments for user X"
--   - "Get Inbox items (including those without due dates yet)"
--
-- The order (user_id, status, due_date) is optimal because:
--   - user_id is the most selective (narrows down to one user's data)
--   - status is the next filter (typically filters to 1-2 status values)
--   - due_date is used for sorting/ordering within those results
--
-- IMPORTANT: This is a FULL index (not partial) because:
--   - Inbox assignments often don't have due dates yet (triaging stage)
--   - We want to efficiently query all status values, including Inbox items
--   - NULL values are indexed and sortable (NULLS LAST by default)
--
-- PostgreSQL can also use this index for queries filtering only on (user_id, due_date)
-- because the index prefix (user_id) is maintained.
CREATE INDEX IF NOT EXISTS idx_assignments_user_status_due_date 
  ON assignments(user_id, status, due_date);

-- 3) Keep existing index for course-based queries
-- Note: We keep the existing index name (idx_assignments_course_due) for consistency.
-- The new index above handles user-based queries, this one handles course-based queries.
-- Both can coexist - PostgreSQL will choose the best one for each query.
--
-- Optional: If you want to add status to course queries too, uncomment:
-- CREATE INDEX IF NOT EXISTS idx_assignments_course_status_due_date
--   ON assignments(course_id, status, due_date)
--   WHERE course_id IS NOT NULL AND due_date IS NOT NULL;

-- 4) Note on existing indexes:
-- We keep the existing indexes:
--   - idx_assignments_user_due (user_id, due_date)
--   - idx_assignments_course_due (course_id, due_date)
--
-- The new index (idx_assignments_user_status_due_date) can serve queries that used
-- idx_assignments_user_due, so PostgreSQL may use it instead. However, keeping both
-- indexes is fine - they have minimal storage overhead and PostgreSQL will choose
-- the most efficient one for each query.
--
-- If you want to drop the old index after verifying the new one works well:
--   DROP INDEX IF EXISTS idx_assignments_user_due;
--
-- We're NOT doing this automatically to avoid any risk during migration.

COMMIT;

-- Verification queries (run after migration):
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'assignments' ORDER BY indexname;
-- EXPLAIN ANALYZE SELECT * FROM assignments WHERE user_id = '...' AND status = 'Inbox' ORDER BY due_date;
-- EXPLAIN ANALYZE SELECT * FROM assignments WHERE course_id = '...' ORDER BY due_date;

