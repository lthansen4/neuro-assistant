-- Migration 0008: Calendar Split (CORRECTED)
-- Creates templates for recurring events and new instances table
-- Preserves backward compatibility with existing course_office_hours table

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Utility function for updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Recurring templates table
-- NOTE: Uses existing event_type enum (TitleCase: 'Class', 'OfficeHours', etc.)
CREATE TABLE IF NOT EXISTS calendar_event_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),  -- Added: needed for queries and view
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,  -- ✅ Use existing enum type
  rrule text,  -- Optional RRULE string for complex recurrence
  day_of_week smallint,  -- 0=Sun, 1=Mon, ..., 6=Sat
  start_time_local time NOT NULL,  -- Local time (no timezone)
  end_time_local time NOT NULL,    -- Local time (no timezone)
  start_date date,  -- Optional: when template starts being active
  end_date date,    -- Optional: when template expires
  location text,
  color varchar(32),
  is_movable boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT templates_dow_chk CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6))
  -- ✅ Removed event_type CHECK - using enum type instead
);

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_calendar_event_templates') THEN
    CREATE TRIGGER set_updated_at_calendar_event_templates
    BEFORE UPDATE ON calendar_event_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- 2) Event instances table (new structure)
CREATE TABLE IF NOT EXISTS calendar_events_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  template_id uuid REFERENCES calendar_event_templates(id) ON DELETE SET NULL,  -- Link to template
  title text NOT NULL,
  event_type event_type NOT NULL,  -- ✅ Use existing enum type
  start_at timestamptz NOT NULL,   -- ✅ Changed from start_time to start_at for clarity
  end_at timestamptz NOT NULL,     -- ✅ Changed from end_time to end_at for clarity
  is_movable boolean NOT NULL DEFAULT true,
  -- ✅ Removed: priority_score, effort_minutes, due_at (these belong on assignments, not events)
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT events_time_chk CHECK (end_at > start_at)
  -- ✅ Removed event_type CHECK - using enum type instead
);

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_calendar_events_new') THEN
    CREATE TRIGGER set_updated_at_calendar_events_new
    BEFORE UPDATE ON calendar_events_new
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- 3) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_new_user_time ON calendar_events_new(user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_new_course_time ON calendar_events_new(course_id, start_at) WHERE course_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_new_template ON calendar_events_new(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_new_movable ON calendar_events_new(is_movable) WHERE is_movable = false;
CREATE INDEX IF NOT EXISTS idx_calendar_events_new_assignment ON calendar_events_new(assignment_id) WHERE assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_event_templates_user_course ON calendar_event_templates(user_id, course_id) WHERE course_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_event_templates_type ON calendar_event_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_event_templates_course_day ON calendar_event_templates(course_id, day_of_week) WHERE course_id IS NOT NULL AND day_of_week IS NOT NULL;

-- 4) Migrate existing course_office_hours data to templates
-- This preserves existing office hours data in the new structure
INSERT INTO calendar_event_templates (
  user_id,
  course_id,
  event_type,
  day_of_week,
  start_time_local,
  end_time_local,
  location
)
SELECT DISTINCT
  c.user_id,           -- ✅ Get user_id from courses table
  coh.course_id,
  'OfficeHours'::event_type,  -- ✅ Use existing enum value
  coh.day_of_week,
  coh.start_time,
  coh.end_time,
  coh.location
FROM course_office_hours coh
JOIN courses c ON c.id = coh.course_id
WHERE NOT EXISTS (
  -- Avoid duplicates if running migration multiple times
  SELECT 1 FROM calendar_event_templates cet
  WHERE cet.course_id = coh.course_id
    AND cet.day_of_week = coh.day_of_week
    AND cet.start_time_local = coh.start_time
    AND cet.end_time_local = coh.end_time
    AND cet.event_type = 'OfficeHours'::event_type
);

-- 5) Rename old table for safety (keep for rollback)
-- ✅ Changed: Rename instead of drop, preserve for backward compatibility
ALTER TABLE IF EXISTS course_office_hours RENAME TO course_office_hours_old;

-- 6) Create compatibility view that matches old table structure
-- This allows existing code to continue working during transition
CREATE OR REPLACE VIEW course_office_hours AS
SELECT
  id,
  course_id,  -- ✅ Old table didn't have user_id directly
  day_of_week,
  start_time_local as start_time,  -- ✅ Map new name to old name
  end_time_local as end_time,      -- ✅ Map new name to old name
  location
FROM calendar_event_templates
WHERE event_type = 'OfficeHours'::event_type;  -- ✅ Use existing enum value

-- 7) Create INSTEAD OF triggers for writeable view (if needed)
-- This allows INSERT/UPDATE/DELETE to work through the view
CREATE OR REPLACE FUNCTION course_office_hours_insert()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get user_id from course
  SELECT user_id INTO v_user_id
  FROM courses
  WHERE id = NEW.course_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Course not found: %', NEW.course_id;
  END IF;
  
  -- Insert into templates table
  INSERT INTO calendar_event_templates (
    user_id,
    course_id,
    event_type,
    day_of_week,
    start_time_local,
    end_time_local,
    location
  ) VALUES (
    v_user_id,
    NEW.course_id,
    'OfficeHours'::event_type,
    NEW.day_of_week,
    NEW.start_time,
    NEW.end_time,
    NEW.location
  )
  RETURNING id INTO NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION course_office_hours_update()
RETURNS trigger AS $$
BEGIN
  UPDATE calendar_event_templates
  SET
    day_of_week = NEW.day_of_week,
    start_time_local = NEW.start_time,
    end_time_local = NEW.end_time,
    location = NEW.location,
    updated_at = NOW()
  WHERE id = OLD.id AND event_type = 'OfficeHours'::event_type;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION course_office_hours_delete()
RETURNS trigger AS $$
BEGIN
  DELETE FROM calendar_event_templates
  WHERE id = OLD.id AND event_type = 'OfficeHours'::event_type;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for writeable view
DROP TRIGGER IF EXISTS course_office_hours_insert_trigger ON course_office_hours;
CREATE TRIGGER course_office_hours_insert_trigger
  INSTEAD OF INSERT ON course_office_hours
  FOR EACH ROW EXECUTE FUNCTION course_office_hours_insert();

DROP TRIGGER IF EXISTS course_office_hours_update_trigger ON course_office_hours;
CREATE TRIGGER course_office_hours_update_trigger
  INSTEAD OF UPDATE ON course_office_hours
  FOR EACH ROW EXECUTE FUNCTION course_office_hours_update();

DROP TRIGGER IF EXISTS course_office_hours_delete_trigger ON course_office_hours;
CREATE TRIGGER course_office_hours_delete_trigger
  INSTEAD OF DELETE ON course_office_hours
  FOR EACH ROW EXECUTE FUNCTION course_office_hours_delete();

COMMIT;

-- Verification queries (run after migration)
-- SELECT COUNT(*) FROM calendar_event_templates WHERE event_type = 'OfficeHours';
-- SELECT COUNT(*) FROM course_office_hours_old;  -- Should match above
-- SELECT * FROM course_office_hours LIMIT 5;  -- View should work




