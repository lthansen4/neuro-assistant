BEGIN;

-- 1) Add confidence_score column (0.000–1.000 range recommended)
ALTER TABLE syllabus_staging_items
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3);

COMMENT ON COLUMN syllabus_staging_items.confidence_score IS
  'Parser confidence in this staged item (0.000–1.000). Used for bulk selection defaults in preview UI.';

-- 2) Safety check: keep NULLs allowed; enforce range only when present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staging_confidence_range_chk'
  ) THEN
    ALTER TABLE syllabus_staging_items
      ADD CONSTRAINT staging_confidence_range_chk
      CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));
  END IF;
END$$;

-- 3) Performance index for preview screen (group + order by confidence)
--    Note: DESC NULLS LAST makes high-confidence items sort first; grouped by parse_run_id.
CREATE INDEX IF NOT EXISTS idx_staging_confidence
  ON syllabus_staging_items (parse_run_id, confidence_score DESC NULLS LAST);

COMMIT;





