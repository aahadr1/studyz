-- Interactive Lesson Chat Messages Table
-- Stores conversation history for the AI assistant in interactive lessons

CREATE TABLE IF NOT EXISTS interactive_lesson_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interactive_lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    page_context INTEGER,
    audio_url TEXT, -- For explain page audio attachments
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_interactive_lesson_messages_lesson_id 
ON interactive_lesson_messages(interactive_lesson_id);

CREATE INDEX IF NOT EXISTS idx_interactive_lesson_messages_created_at 
ON interactive_lesson_messages(created_at);

-- Enable RLS
ALTER TABLE interactive_lesson_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view messages of their interactive lessons" ON interactive_lesson_messages;
DROP POLICY IF EXISTS "Users can create messages for their interactive lessons" ON interactive_lesson_messages;
DROP POLICY IF EXISTS "Users can delete messages of their interactive lessons" ON interactive_lesson_messages;

-- RLS Policies (based on parent interactive lesson ownership)
CREATE POLICY "Users can view messages of their interactive lessons"
    ON interactive_lesson_messages FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM interactive_lessons 
        WHERE interactive_lessons.id = interactive_lesson_messages.interactive_lesson_id 
        AND interactive_lessons.user_id = auth.uid()
    ));

CREATE POLICY "Users can create messages for their interactive lessons"
    ON interactive_lesson_messages FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM interactive_lessons 
        WHERE interactive_lessons.id = interactive_lesson_messages.interactive_lesson_id 
        AND interactive_lessons.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete messages of their interactive lessons"
    ON interactive_lesson_messages FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM interactive_lessons 
        WHERE interactive_lessons.id = interactive_lesson_messages.interactive_lesson_id 
        AND interactive_lessons.user_id = auth.uid()
    ));

-- Comment
COMMENT ON TABLE interactive_lesson_messages IS 'Stores chat conversation history between users and the AI assistant for interactive lessons';

