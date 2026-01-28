-- Migration: Add description field to assignments
-- This stores the user's original quick add input or any notes about the assignment

ALTER TABLE assignments
ADD COLUMN description TEXT;

-- Create index for text search if needed in future
CREATE INDEX idx_assignments_description ON assignments USING gin(to_tsvector('english', description))
WHERE description IS NOT NULL;




