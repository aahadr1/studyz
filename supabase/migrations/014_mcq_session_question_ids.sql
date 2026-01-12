-- Add question_ids to mcq_sessions to support "study selected questions" sessions

ALTER TABLE mcq_sessions
ADD COLUMN IF NOT EXISTS question_ids JSONB DEFAULT '[]'::jsonb;

