-- Combined Pending Migrations for Railway
-- Run this directly in Railway's PostgreSQL console or via psql
-- These migrations add the description field for Quick Add notes

-- =============================================
-- Migration 0029: Add description to assignments
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'description'
  ) THEN
    ALTER TABLE assignments ADD COLUMN description TEXT;
    RAISE NOTICE 'Added description column to assignments table';
  ELSE
    RAISE NOTICE 'description column already exists in assignments table';
  END IF;
END $$;

-- =============================================
-- Migration 0030: Add description to calendar_events_new
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events_new' AND column_name = 'description'
  ) THEN
    ALTER TABLE calendar_events_new ADD COLUMN description TEXT;
    RAISE NOTICE 'Added description column to calendar_events_new table';
  ELSE
    RAISE NOTICE 'description column already exists in calendar_events_new table';
  END IF;
END $$;

-- =============================================
-- Migration 0031: Add assignment_time_logs table
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'assignment_time_logs'
  ) THEN
    CREATE TABLE assignment_time_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT,
      estimated_minutes INTEGER,
      actual_minutes INTEGER NOT NULL,
      accuracy_ratio NUMERIC(5,2),
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX idx_time_logs_user ON assignment_time_logs(user_id);
    CREATE INDEX idx_time_logs_user_category ON assignment_time_logs(user_id, category);
    CREATE INDEX idx_time_logs_user_course ON assignment_time_logs(user_id, course_id);
    CREATE INDEX idx_time_logs_completed ON assignment_time_logs(completed_at DESC);
    
    RAISE NOTICE 'Created assignment_time_logs table with indexes';
  ELSE
    RAISE NOTICE 'assignment_time_logs table already exists';
  END IF;
END $$;

-- Create the accuracy ratio trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_calculate_accuracy_ratio') THEN
    CREATE OR REPLACE FUNCTION calculate_accuracy_ratio()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF NEW.estimated_minutes IS NOT NULL AND NEW.estimated_minutes > 0 THEN
        NEW.accuracy_ratio := ROUND((NEW.actual_minutes::NUMERIC / NEW.estimated_minutes::NUMERIC), 2);
      ELSE
        NEW.accuracy_ratio := NULL;
      END IF;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_calculate_accuracy_ratio
    BEFORE INSERT OR UPDATE ON assignment_time_logs
    FOR EACH ROW
    EXECUTE FUNCTION calculate_accuracy_ratio();
    
    RAISE NOTICE 'Created accuracy ratio trigger';
  ELSE
    RAISE NOTICE 'Trigger already exists';
  END IF;
END $$;

-- Verify the changes
SELECT 
  'assignments.description' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'description'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'calendar_events_new.description',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events_new' AND column_name = 'description'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 
  'assignment_time_logs table',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'assignment_time_logs'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END;

