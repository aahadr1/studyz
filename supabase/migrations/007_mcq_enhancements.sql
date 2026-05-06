-- MCQ Enhancements Migration
-- Adds lesson cards, progress tracking, and session data

-- Add lesson_card JSONB column to mcq_questions for individual lesson cards
ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS lesson_card JSONB;

-- Add correction status to track if question has been auto-corrected
ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN DEFAULT FALSE;

-- Add difficulty rating based on user performance
ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS difficulty_score DECIMAL(3,2) DEFAULT 0.5;

-- Add times_answered and times_correct for spaced repetition
ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS times_answered INTEGER DEFAULT 0;
ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS times_correct INTEGER DEFAULT 0;

-- Create mcq_sessions table to track user practice sessions
CREATE TABLE IF NOT EXISTS mcq_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mcq_set_id UUID REFERENCES mcq_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  mode TEXT DEFAULT 'test', -- 'study', 'test', 'challenge', 'review'
  total_questions INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE
);

-- Create mcq_session_answers to track individual answers in a session
CREATE TABLE IF NOT EXISTS mcq_session_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES mcq_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES mcq_questions(id) ON DELETE CASCADE,
  selected_option TEXT,
  is_correct BOOLEAN,
  time_spent_seconds INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add has_lesson_cards flag to mcq_sets
ALTER TABLE mcq_sets ADD COLUMN IF NOT EXISTS has_lesson_cards BOOLEAN DEFAULT FALSE;

-- Add is_corrected flag to mcq_sets
ALTER TABLE mcq_sets ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN DEFAULT FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mcq_sessions_set_id ON mcq_sessions(mcq_set_id);
CREATE INDEX IF NOT EXISTS idx_mcq_sessions_user_id ON mcq_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mcq_session_answers_session_id ON mcq_session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_mcq_session_answers_question_id ON mcq_session_answers(question_id);

-- Enable RLS on new tables
ALTER TABLE mcq_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_session_answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mcq_sessions
DROP POLICY IF EXISTS "Users can view their own sessions" ON mcq_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON mcq_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON mcq_sessions;

CREATE POLICY "Users can view their own sessions"
  ON mcq_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
  ON mcq_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON mcq_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for mcq_session_answers (based on session ownership)
DROP POLICY IF EXISTS "Users can view their session answers" ON mcq_session_answers;
DROP POLICY IF EXISTS "Users can create session answers" ON mcq_session_answers;

CREATE POLICY "Users can view their session answers"
  ON mcq_session_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM mcq_sessions WHERE mcq_sessions.id = mcq_session_answers.session_id AND mcq_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create session answers"
  ON mcq_session_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM mcq_sessions WHERE mcq_sessions.id = mcq_session_answers.session_id AND mcq_sessions.user_id = auth.uid()
  ));

-- Function to update question difficulty based on user performance
CREATE OR REPLACE FUNCTION update_question_difficulty(q_id UUID, was_correct BOOLEAN)
RETURNS VOID AS $$
BEGIN
  UPDATE mcq_questions
  SET 
    times_answered = times_answered + 1,
    times_correct = CASE WHEN was_correct THEN times_correct + 1 ELSE times_correct END,
    difficulty_score = CASE 
      WHEN times_answered > 0 THEN 
        1.0 - (CAST(times_correct + (CASE WHEN was_correct THEN 1 ELSE 0 END) AS DECIMAL) / 
               CAST(times_answered + 1 AS DECIMAL))
      ELSE 0.5 
    END
  WHERE id = q_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get questions sorted by spaced repetition priority
-- Questions the user got wrong more recently and more often should come first
CREATE OR REPLACE FUNCTION get_spaced_repetition_questions(set_id UUID, user_uuid UUID)
RETURNS TABLE (
  question_id UUID,
  priority_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id as question_id,
    COALESCE(
      -- Higher score = higher priority (should be reviewed more)
      q.difficulty_score * 0.4 + -- Base difficulty
      (1.0 - LEAST(1.0, EXTRACT(EPOCH FROM (NOW() - COALESCE(last_answer.answered_at, '1970-01-01'::timestamptz)) / 86400.0 / 7.0)) * 0.3) + -- Recency (within 7 days)
      (CASE WHEN last_answer.is_correct = false THEN 0.3 ELSE 0.0 END), -- Was last answer wrong?
      0.5 -- Default for unanswered questions
    ) as priority_score
  FROM mcq_questions q
  LEFT JOIN LATERAL (
    SELECT sa.is_correct, sa.answered_at
    FROM mcq_session_answers sa
    JOIN mcq_sessions s ON s.id = sa.session_id
    WHERE sa.question_id = q.id AND s.user_id = user_uuid
    ORDER BY sa.answered_at DESC
    LIMIT 1
  ) last_answer ON true
  WHERE q.mcq_set_id = set_id
  ORDER BY priority_score DESC;
END;
$$ LANGUAGE plpgsql;

