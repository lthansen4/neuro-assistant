-- Migration: Add time tracking for personalized predictions
-- Tracks estimated vs actual time to improve future estimates

CREATE TABLE assignment_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  
  -- What was done
  title TEXT NOT NULL,
  category TEXT,
  
  -- Time comparison
  estimated_minutes INTEGER, -- What they thought it would take
  actual_minutes INTEGER NOT NULL, -- What it actually took
  accuracy_ratio NUMERIC(5,2), -- actual / estimated (e.g., 1.5 = took 50% longer)
  
  -- Context
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_time_logs_user ON assignment_time_logs(user_id);
CREATE INDEX idx_time_logs_user_category ON assignment_time_logs(user_id, category);
CREATE INDEX idx_time_logs_user_course ON assignment_time_logs(user_id, course_id);
CREATE INDEX idx_time_logs_completed ON assignment_time_logs(completed_at DESC);

-- Automatically calculate accuracy ratio on insert/update
CREATE OR REPLACE FUNCTION calculate_accuracy_ratio()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estimated_minutes IS NOT NULL AND NEW.estimated_minutes > 0 THEN
    NEW.accuracy_ratio := ROUND((NEW.actual_minutes::NUMERIC / NEW.estimated_minutes::NUMERIC), 2);
  ELSE
    NEW.accuracy_ratio := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_accuracy_ratio
BEFORE INSERT OR UPDATE ON assignment_time_logs
FOR EACH ROW
EXECUTE FUNCTION calculate_accuracy_ratio();


