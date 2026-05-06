-- Add lesson content to mcq_sets
ALTER TABLE mcq_sets ADD COLUMN IF NOT EXISTS lesson_content JSONB;

-- Add section_id to mcq_questions to link questions to lesson sections
ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS section_id TEXT;

-- Create index for section lookups
CREATE INDEX IF NOT EXISTS idx_mcq_questions_section_id ON mcq_questions(section_id);

