-- Create assignment_checklists table to store interactive checklists for stuck assignments
CREATE TABLE IF NOT EXISTS assignment_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  event_id UUID REFERENCES calendar_events_new(id) ON DELETE CASCADE,
  items JSONB NOT NULL, -- [{label: string, duration_minutes: number, completed: boolean}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(assignment_id)
);

-- Create index for faster lookups
CREATE INDEX idx_assignment_checklists_assignment ON assignment_checklists(assignment_id);
CREATE INDEX idx_assignment_checklists_event ON assignment_checklists(event_id);





