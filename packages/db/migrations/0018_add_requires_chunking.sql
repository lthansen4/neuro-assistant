-- Migration 0018: Add requires_chunking to assignments table
-- Purpose: Support automatic chunking of long-form assignments (papers, projects)
-- into multiple Focus blocks spread across days

-- Add requires_chunking column
ALTER TABLE assignments 
ADD COLUMN requires_chunking BOOLEAN DEFAULT FALSE;

-- Add index for efficient queries of chunked assignments
CREATE INDEX idx_assignments_chunking 
ON assignments(user_id, requires_chunking) 
WHERE requires_chunking = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN assignments.requires_chunking IS 
'True if this assignment requires multiple work sessions (auto-chunking). Papers/large projects typically require chunking.';





