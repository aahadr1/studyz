-- Lesson Sections with Audio for Interactive Lessons
-- Migration: 010_lesson_sections_audio.sql

-- Page transcriptions table (vision AI output for each page)
CREATE TABLE IF NOT EXISTS interactive_lesson_page_transcriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    transcription TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interactive_lesson_id, page_number)
);

-- Page sections table (generated lesson content, one section per page)
CREATE TABLE IF NOT EXISTS interactive_lesson_page_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    section_title TEXT NOT NULL,
    section_content TEXT NOT NULL,
    audio_path TEXT,  -- Path to pre-generated audio in storage
    audio_duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interactive_lesson_id, page_number)
);

-- Add lesson generation status columns to interactive_lessons
ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS lesson_status TEXT DEFAULT 'none' 
    CHECK (lesson_status IN ('none', 'processing', 'ready', 'error'));

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS lesson_generation_step TEXT;

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS lesson_generation_progress INTEGER DEFAULT 0;

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS lesson_generation_total INTEGER DEFAULT 0;

ALTER TABLE interactive_lessons
ADD COLUMN IF NOT EXISTS lesson_error_message TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_il_transcriptions_lesson_id 
    ON interactive_lesson_page_transcriptions(interactive_lesson_id);
CREATE INDEX IF NOT EXISTS idx_il_transcriptions_page 
    ON interactive_lesson_page_transcriptions(interactive_lesson_id, page_number);
CREATE INDEX IF NOT EXISTS idx_il_sections_lesson_id 
    ON interactive_lesson_page_sections(interactive_lesson_id);
CREATE INDEX IF NOT EXISTS idx_il_sections_page 
    ON interactive_lesson_page_sections(interactive_lesson_id, page_number);

-- Enable Row Level Security
ALTER TABLE interactive_lesson_page_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_page_sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interactive_lesson_page_transcriptions
DROP POLICY IF EXISTS "Users can view their own transcriptions" ON interactive_lesson_page_transcriptions;
CREATE POLICY "Users can view their own transcriptions"
    ON interactive_lesson_page_transcriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_transcriptions.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create their own transcriptions" ON interactive_lesson_page_transcriptions;
CREATE POLICY "Users can create their own transcriptions"
    ON interactive_lesson_page_transcriptions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their own transcriptions" ON interactive_lesson_page_transcriptions;
CREATE POLICY "Users can update their own transcriptions"
    ON interactive_lesson_page_transcriptions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_transcriptions.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete their own transcriptions" ON interactive_lesson_page_transcriptions;
CREATE POLICY "Users can delete their own transcriptions"
    ON interactive_lesson_page_transcriptions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_transcriptions.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_page_sections
DROP POLICY IF EXISTS "Users can view their own sections" ON interactive_lesson_page_sections;
CREATE POLICY "Users can view their own sections"
    ON interactive_lesson_page_sections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_sections.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create their own sections" ON interactive_lesson_page_sections;
CREATE POLICY "Users can create their own sections"
    ON interactive_lesson_page_sections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their own sections" ON interactive_lesson_page_sections;
CREATE POLICY "Users can update their own sections"
    ON interactive_lesson_page_sections FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_sections.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete their own sections" ON interactive_lesson_page_sections;
CREATE POLICY "Users can delete their own sections"
    ON interactive_lesson_page_sections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_page_sections.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

