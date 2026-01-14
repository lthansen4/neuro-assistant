-- Migration: Add linked_assignment_id to calendar_events_new for deferral tracking
-- Date: 2026-01-13

ALTER TABLE calendar_events_new 
ADD COLUMN IF NOT EXISTS linked_assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_linked_assignment 
ON calendar_events_new(linked_assignment_id) 
WHERE linked_assignment_id IS NOT NULL;

