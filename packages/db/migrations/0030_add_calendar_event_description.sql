-- Migration: Add description field to calendar_events_new
-- This stores the assignment description or event notes

ALTER TABLE calendar_events_new
ADD COLUMN description TEXT;

-- Create index for text search if needed in future
CREATE INDEX idx_calendar_events_new_description ON calendar_events_new USING gin(to_tsvector('english', description))
WHERE description IS NOT NULL;


