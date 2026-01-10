-- MCQ Multi-correct / SCQ support
-- Adds question_type + correct_options to mcq_questions
-- Adds selected_options to mcq_session_answers

-- mcq_questions: support single-choice (SCQ) and multiple-choice (MCQ)
ALTER TABLE mcq_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'scq';

ALTER TABLE mcq_questions
  ADD COLUMN IF NOT EXISTS correct_options JSONB DEFAULT '[]'::jsonb;

-- Backfill existing rows: correct_options = [correct_option]
UPDATE mcq_questions
SET correct_options = jsonb_build_array(correct_option)
WHERE (correct_options IS NULL OR correct_options = '[]'::jsonb)
  AND correct_option IS NOT NULL;

-- Ensure question_type is valid
ALTER TABLE mcq_questions
  DROP CONSTRAINT IF EXISTS mcq_questions_question_type_check;

ALTER TABLE mcq_questions
  ADD CONSTRAINT mcq_questions_question_type_check
  CHECK (question_type IN ('scq', 'mcq'));

-- mcq_session_answers: support multi-select answers
ALTER TABLE mcq_session_answers
  ADD COLUMN IF NOT EXISTS selected_options JSONB DEFAULT '[]'::jsonb;

-- Backfill existing session answers: selected_options = [selected_option]
UPDATE mcq_session_answers
SET selected_options = jsonb_build_array(selected_option)
WHERE (selected_options IS NULL OR selected_options = '[]'::jsonb)
  AND selected_option IS NOT NULL;


