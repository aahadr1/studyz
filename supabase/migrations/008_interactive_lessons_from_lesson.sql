-- Interactive Lessons from Existing Lessons
-- Migration: 008_interactive_lessons_from_lesson.sql
-- This allows creating interactive lessons from existing regular lessons

-- Add source lesson reference to interactive_lessons table
ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS source_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_interactive_lessons_source_lesson_id 
ON interactive_lessons(source_lesson_id);

-- Comment for documentation
COMMENT ON COLUMN interactive_lessons.source_lesson_id IS 
'Reference to the original lesson this interactive lesson was created from. NULL if created independently.';

