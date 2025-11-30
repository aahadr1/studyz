-- Interactive Lessons v2 - Vision-Based Analysis
-- Migration: 003_interactive_lessons_v2.sql

-- Page images (PDF converted to images)
CREATE TABLE IF NOT EXISTS interactive_lesson_page_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES interactive_lesson_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, page_number)
);

-- Enhanced page transcription (vision AI output)
-- Add new columns to existing table
ALTER TABLE interactive_lesson_page_texts 
ADD COLUMN IF NOT EXISTS transcription_type TEXT DEFAULT 'text' CHECK (transcription_type IN ('text', 'vision')),
ADD COLUMN IF NOT EXISTS elements_description TEXT,
ADD COLUMN IF NOT EXISTS has_visual_content BOOLEAN DEFAULT FALSE;

-- Page element annotations (for highlighted click-to-explain)
CREATE TABLE IF NOT EXISTS interactive_lesson_page_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_text_id UUID NOT NULL REFERENCES interactive_lesson_page_texts(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL CHECK (element_type IN ('term', 'concept', 'formula', 'diagram', 'definition')),
    element_text TEXT NOT NULL,
    explanation TEXT NOT NULL,
    color TEXT DEFAULT 'yellow',
    position_hint TEXT,
    element_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reconstructed lesson (full AI recreation)
CREATE TABLE IF NOT EXISTS interactive_lesson_reconstructions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE UNIQUE,
    full_content TEXT NOT NULL,
    structure_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Checkpoints (topics/subtopics with page ranges)
CREATE TABLE IF NOT EXISTS interactive_lesson_checkpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES interactive_lesson_checkpoints(id) ON DELETE SET NULL,
    checkpoint_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    checkpoint_type TEXT DEFAULT 'topic' CHECK (checkpoint_type IN ('topic', 'subtopic')),
    start_page INTEGER NOT NULL,
    end_page INTEGER NOT NULL,
    summary TEXT,
    content_excerpt TEXT,
    pass_threshold INTEGER DEFAULT 70,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add checkpoint reference to questions table
ALTER TABLE interactive_lesson_questions 
ADD COLUMN IF NOT EXISTS checkpoint_id UUID REFERENCES interactive_lesson_checkpoints(id) ON DELETE CASCADE;

-- Checkpoint progress tracking
CREATE TABLE IF NOT EXISTS interactive_lesson_checkpoint_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    checkpoint_id UUID NOT NULL REFERENCES interactive_lesson_checkpoints(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'current', 'completed')),
    score INTEGER,
    attempts INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, interactive_lesson_id, checkpoint_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_il_page_images_document_id ON interactive_lesson_page_images(document_id);
CREATE INDEX IF NOT EXISTS idx_il_page_elements_page_text_id ON interactive_lesson_page_elements(page_text_id);
CREATE INDEX IF NOT EXISTS idx_il_reconstructions_lesson_id ON interactive_lesson_reconstructions(interactive_lesson_id);
CREATE INDEX IF NOT EXISTS idx_il_checkpoints_lesson_id ON interactive_lesson_checkpoints(interactive_lesson_id);
CREATE INDEX IF NOT EXISTS idx_il_checkpoints_parent_id ON interactive_lesson_checkpoints(parent_id);
CREATE INDEX IF NOT EXISTS idx_il_questions_checkpoint_id ON interactive_lesson_questions(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_il_checkpoint_progress_user_id ON interactive_lesson_checkpoint_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_il_checkpoint_progress_lesson_id ON interactive_lesson_checkpoint_progress(interactive_lesson_id);
CREATE INDEX IF NOT EXISTS idx_il_checkpoint_progress_checkpoint_id ON interactive_lesson_checkpoint_progress(checkpoint_id);

-- Enable Row Level Security
ALTER TABLE interactive_lesson_page_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_page_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_reconstructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_checkpoint_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interactive_lesson_page_images
CREATE POLICY "Users can view page images from their documents"
    ON interactive_lesson_page_images FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_documents.id = interactive_lesson_page_images.document_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create page images in their documents"
    ON interactive_lesson_page_images FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_documents.id = document_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete page images from their documents"
    ON interactive_lesson_page_images FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_documents.id = interactive_lesson_page_images.document_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_page_elements
CREATE POLICY "Users can view page elements from their documents"
    ON interactive_lesson_page_elements FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_page_texts
            JOIN interactive_lesson_documents ON interactive_lesson_documents.id = interactive_lesson_page_texts.document_id
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_page_texts.id = interactive_lesson_page_elements.page_text_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create page elements in their documents"
    ON interactive_lesson_page_elements FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lesson_page_texts
            JOIN interactive_lesson_documents ON interactive_lesson_documents.id = interactive_lesson_page_texts.document_id
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_page_texts.id = page_text_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete page elements from their documents"
    ON interactive_lesson_page_elements FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_page_texts
            JOIN interactive_lesson_documents ON interactive_lesson_documents.id = interactive_lesson_page_texts.document_id
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_page_texts.id = interactive_lesson_page_elements.page_text_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_reconstructions
CREATE POLICY "Users can view their lesson reconstructions"
    ON interactive_lesson_reconstructions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_reconstructions.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create reconstructions for their lessons"
    ON interactive_lesson_reconstructions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their lesson reconstructions"
    ON interactive_lesson_reconstructions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_reconstructions.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their lesson reconstructions"
    ON interactive_lesson_reconstructions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_reconstructions.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_checkpoints
CREATE POLICY "Users can view checkpoints from their lessons"
    ON interactive_lesson_checkpoints FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_checkpoints.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create checkpoints in their lessons"
    ON interactive_lesson_checkpoints FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update checkpoints in their lessons"
    ON interactive_lesson_checkpoints FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_checkpoints.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete checkpoints from their lessons"
    ON interactive_lesson_checkpoints FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_checkpoints.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_checkpoint_progress
CREATE POLICY "Users can view their own checkpoint progress"
    ON interactive_lesson_checkpoint_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own checkpoint progress"
    ON interactive_lesson_checkpoint_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own checkpoint progress"
    ON interactive_lesson_checkpoint_progress FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own checkpoint progress"
    ON interactive_lesson_checkpoint_progress FOR DELETE
    USING (auth.uid() = user_id);

