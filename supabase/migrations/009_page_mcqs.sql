-- Page-based MCQs for Interactive Lessons
-- Migration: 009_page_mcqs.sql

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Page-based MCQs table
CREATE TABLE IF NOT EXISTS interactive_lesson_page_mcqs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    question TEXT NOT NULL,
    choices JSONB NOT NULL, -- ["A. ...", "B. ...", "C. ...", "D. ..."]
    correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
    explanation TEXT,
    source_type TEXT NOT NULL CHECK (source_type IN ('uploaded_doc', 'uploaded_text', 'ai_generated')),
    question_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User's MCQ progress tracking
CREATE TABLE IF NOT EXISTS interactive_lesson_mcq_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mcq_id UUID NOT NULL REFERENCES interactive_lesson_page_mcqs(id) ON DELETE CASCADE,
    is_correct BOOLEAN NOT NULL,
    selected_index INTEGER NOT NULL,
    answered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, mcq_id)
);

-- MCQ generation status tracking on interactive_lessons
ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS mcq_status TEXT DEFAULT 'none' 
    CHECK (mcq_status IN ('none', 'generating', 'ready', 'error'));

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS mcq_generation_progress INTEGER DEFAULT 0;

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS mcq_total_count INTEGER DEFAULT 0;

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS mcq_error_message TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_page_mcqs_lesson_id ON interactive_lesson_page_mcqs(interactive_lesson_id);
CREATE INDEX IF NOT EXISTS idx_page_mcqs_page_number ON interactive_lesson_page_mcqs(page_number);
CREATE INDEX IF NOT EXISTS idx_page_mcqs_lesson_page ON interactive_lesson_page_mcqs(interactive_lesson_id, page_number);
CREATE INDEX IF NOT EXISTS idx_mcq_progress_user_id ON interactive_lesson_mcq_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_mcq_progress_mcq_id ON interactive_lesson_mcq_progress(mcq_id);
CREATE INDEX IF NOT EXISTS idx_mcq_progress_user_mcq ON interactive_lesson_mcq_progress(user_id, mcq_id);

-- Enable Row Level Security
ALTER TABLE interactive_lesson_page_mcqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_mcq_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interactive_lesson_page_mcqs
DROP POLICY IF EXISTS "Users can view MCQs from their interactive lessons" ON interactive_lesson_page_mcqs;
CREATE POLICY "Users can view MCQs from their interactive lessons"
    ON interactive_lesson_page_mcqs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_mcqs.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create MCQs in their interactive lessons" ON interactive_lesson_page_mcqs;
CREATE POLICY "Users can create MCQs in their interactive lessons"
    ON interactive_lesson_page_mcqs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update MCQs in their interactive lessons" ON interactive_lesson_page_mcqs;
CREATE POLICY "Users can update MCQs in their interactive lessons"
    ON interactive_lesson_page_mcqs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_mcqs.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete MCQs from their interactive lessons" ON interactive_lesson_page_mcqs;
CREATE POLICY "Users can delete MCQs from their interactive lessons"
    ON interactive_lesson_page_mcqs FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_mcqs.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_mcq_progress
DROP POLICY IF EXISTS "Users can view their own MCQ progress" ON interactive_lesson_mcq_progress;
CREATE POLICY "Users can view their own MCQ progress"
    ON interactive_lesson_mcq_progress FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own MCQ progress" ON interactive_lesson_mcq_progress;
CREATE POLICY "Users can create their own MCQ progress"
    ON interactive_lesson_mcq_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own MCQ progress" ON interactive_lesson_mcq_progress;
CREATE POLICY "Users can update their own MCQ progress"
    ON interactive_lesson_mcq_progress FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own MCQ progress" ON interactive_lesson_mcq_progress;
CREATE POLICY "Users can delete their own MCQ progress"
    ON interactive_lesson_mcq_progress FOR DELETE
    USING (auth.uid() = user_id);

