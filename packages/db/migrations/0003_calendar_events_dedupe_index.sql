-- Index for calendar events deduplication in syllabus commit
-- Speeds up checks for (userId, courseId, type, startTime, endTime) uniqueness
CREATE INDEX IF NOT EXISTS idx_events_user_course_type_start 
ON calendar_events(user_id, course_id, type, start_time);



