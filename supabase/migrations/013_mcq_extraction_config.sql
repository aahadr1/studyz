-- MCQ extraction configuration for better OCR/transcription
-- Stores user-provided constraints/instructions on mcq_sets

ALTER TABLE mcq_sets
  ADD COLUMN IF NOT EXISTS extraction_instructions TEXT;

ALTER TABLE mcq_sets
  ADD COLUMN IF NOT EXISTS expected_total_questions INTEGER;

ALTER TABLE mcq_sets
  ADD COLUMN IF NOT EXISTS expected_options_per_question INTEGER;

ALTER TABLE mcq_sets
  ADD COLUMN IF NOT EXISTS expected_correct_options_per_question INTEGER;

