-- Migration: Add reading tracking fields to assignments
-- Supports tracking page progress and capturing questions for class

ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS total_pages INTEGER,
ADD COLUMN IF NOT EXISTS pages_completed INTEGER,
ADD COLUMN IF NOT EXISTS reading_questions JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN assignments.total_pages IS 'Total number of pages in the reading assignment';
COMMENT ON COLUMN assignments.pages_completed IS 'Number of pages student has finished';
COMMENT ON COLUMN assignments.reading_questions IS 'Array of [{text: string, createdAt: string}] questions for the professor';



