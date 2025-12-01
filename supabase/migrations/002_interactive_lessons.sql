-- Interactive Lessons Feature
-- Migration: 002_interactive_lessons.sql

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- interactive_lessons: main entity
CREATE TABLE interactive_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    level TEXT,
    language TEXT DEFAULT 'fr',
    mode TEXT NOT NULL CHECK (mode IN ('document_based', 'mcq_only')),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- interactive_lesson_documents: uploaded files with category
CREATE TABLE interactive_lesson_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('lesson', 'mcq')),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    page_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- interactive_lesson_page_texts: extracted text per page (for AI context)
CREATE TABLE interactive_lesson_page_texts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES interactive_lesson_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text_content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, page_number)
);

-- interactive_lesson_sections: AI-generated sections with page ranges
CREATE TABLE interactive_lesson_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    document_id UUID REFERENCES interactive_lesson_documents(id) ON DELETE SET NULL,
    section_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_page INTEGER NOT NULL,
    end_page INTEGER NOT NULL,
    summary TEXT,
    key_points JSONB DEFAULT '[]',
    pass_threshold INTEGER DEFAULT 70,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- interactive_lesson_questions: QCM per section
CREATE TABLE interactive_lesson_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES interactive_lesson_sections(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    choices JSONB NOT NULL, -- ["choice1", "choice2", ...]
    correct_index INTEGER NOT NULL,
    explanation TEXT,
    question_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- interactive_lesson_progress: student progress tracking
CREATE TABLE interactive_lesson_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES interactive_lesson_sections(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'current', 'completed')),
    score INTEGER,
    attempts INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, interactive_lesson_id, section_id)
);

-- mcq_only mode: AI-generated course content
CREATE TABLE interactive_lesson_generated_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES interactive_lesson_sections(id) ON DELETE CASCADE,
    content_html TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_interactive_lessons_user_id ON interactive_lessons(user_id);
CREATE INDEX idx_interactive_lessons_status ON interactive_lessons(status);
CREATE INDEX idx_il_documents_lesson_id ON interactive_lesson_documents(interactive_lesson_id);
CREATE INDEX idx_il_documents_category ON interactive_lesson_documents(category);
CREATE INDEX idx_il_page_texts_document_id ON interactive_lesson_page_texts(document_id);
CREATE INDEX idx_il_sections_lesson_id ON interactive_lesson_sections(interactive_lesson_id);
CREATE INDEX idx_il_sections_document_id ON interactive_lesson_sections(document_id);
CREATE INDEX idx_il_questions_section_id ON interactive_lesson_questions(section_id);
CREATE INDEX idx_il_progress_user_id ON interactive_lesson_progress(user_id);
CREATE INDEX idx_il_progress_lesson_id ON interactive_lesson_progress(interactive_lesson_id);
CREATE INDEX idx_il_progress_section_id ON interactive_lesson_progress(section_id);
CREATE INDEX idx_il_generated_content_section_id ON interactive_lesson_generated_content(section_id);

-- Enable Row Level Security
ALTER TABLE interactive_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_page_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactive_lesson_generated_content ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interactive_lessons
CREATE POLICY "Users can view their own interactive lessons"
    ON interactive_lessons FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own interactive lessons"
    ON interactive_lessons FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interactive lessons"
    ON interactive_lessons FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own interactive lessons"
    ON interactive_lessons FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for interactive_lesson_documents
CREATE POLICY "Users can view documents from their interactive lessons"
    ON interactive_lesson_documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create documents in their interactive lessons"
    ON interactive_lesson_documents FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update documents in their interactive lessons"
    ON interactive_lesson_documents FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete documents from their interactive lessons"
    ON interactive_lesson_documents FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_page_texts
CREATE POLICY "Users can view page texts from their documents"
    ON interactive_lesson_page_texts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_documents.id = interactive_lesson_page_texts.document_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create page texts in their documents"
    ON interactive_lesson_page_texts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_documents.interactive_lesson_id
            WHERE interactive_lesson_documents.id = document_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_sections
CREATE POLICY "Users can view sections from their interactive lessons"
    ON interactive_lesson_sections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create sections in their interactive lessons"
    ON interactive_lesson_sections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update sections in their interactive lessons"
    ON interactive_lesson_sections FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete sections from their interactive lessons"
    ON interactive_lesson_sections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lessons
            WHERE interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_questions
CREATE POLICY "Users can view questions from their sections"
    ON interactive_lesson_questions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_sections
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            WHERE interactive_lesson_sections.id = interactive_lesson_questions.section_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create questions in their sections"
    ON interactive_lesson_questions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lesson_sections
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            WHERE interactive_lesson_sections.id = section_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update questions in their sections"
    ON interactive_lesson_questions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_sections
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            WHERE interactive_lesson_sections.id = interactive_lesson_questions.section_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete questions from their sections"
    ON interactive_lesson_questions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_sections
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            WHERE interactive_lesson_sections.id = interactive_lesson_questions.section_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- RLS Policies for interactive_lesson_progress
CREATE POLICY "Users can view their own progress"
    ON interactive_lesson_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own progress"
    ON interactive_lesson_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
    ON interactive_lesson_progress FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own progress"
    ON interactive_lesson_progress FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for interactive_lesson_generated_content
CREATE POLICY "Users can view generated content from their sections"
    ON interactive_lesson_generated_content FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interactive_lesson_sections
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            WHERE interactive_lesson_sections.id = interactive_lesson_generated_content.section_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create generated content in their sections"
    ON interactive_lesson_generated_content FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM interactive_lesson_sections
            JOIN interactive_lessons ON interactive_lessons.id = interactive_lesson_sections.interactive_lesson_id
            WHERE interactive_lesson_sections.id = section_id
            AND interactive_lessons.user_id = auth.uid()
        )
    );

-- Create storage bucket for interactive lesson documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('interactive-lessons', 'interactive-lessons', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for interactive-lessons bucket
CREATE POLICY "Users can upload interactive lesson documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'interactive-lessons' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their interactive lesson documents"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'interactive-lessons' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their interactive lesson documents"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'interactive-lessons' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );


