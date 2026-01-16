-- Migration: Add new event types for comprehensive calendar color coding
-- Adds: Studying, Test, Quiz, Midterm, Final, Homework, DueDate

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'Studying';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'Test';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'Quiz';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'Midterm';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'Final';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'Homework';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'DueDate';

COMMENT ON TYPE event_type IS 'Calendar event types: Class, Work, OfficeHours, Focus, Chill, Studying (test prep), Test, Quiz, Midterm, Final, Homework, DueDate, Other';





