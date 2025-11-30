-- Check if lessons table exists and handle accordingly
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons') THEN
        -- Lessons table
        CREATE TABLE lessons (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL,
          name TEXT NOT NULL,
          document_url TEXT,
          total_pages INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lesson_pages') THEN
        -- Page images for each lesson
        CREATE TABLE lesson_pages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
          page_number INTEGER NOT NULL,
          image_url TEXT NOT NULL
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lesson_messages') THEN
        -- Chat messages
        CREATE TABLE lesson_messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
          role TEXT NOT NULL, -- 'user' or 'assistant'
          content TEXT NOT NULL,
          page_context INTEGER, -- which page was visible when sent
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

-- Index for faster queries (safe to run even if they exist)
CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_pages_lesson_id ON lesson_pages(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_messages_lesson_id ON lesson_messages(lesson_id);

-- Enable RLS (safe to run even if already enabled)
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own lessons" ON lessons;
DROP POLICY IF EXISTS "Users can create their own lessons" ON lessons;
DROP POLICY IF EXISTS "Users can update their own lessons" ON lessons;
DROP POLICY IF EXISTS "Users can delete their own lessons" ON lessons;

DROP POLICY IF EXISTS "Users can view pages of their lessons" ON lesson_pages;
DROP POLICY IF EXISTS "Users can create pages for their lessons" ON lesson_pages;
DROP POLICY IF EXISTS "Users can delete pages of their lessons" ON lesson_pages;

DROP POLICY IF EXISTS "Users can view messages of their lessons" ON lesson_messages;
DROP POLICY IF EXISTS "Users can create messages for their lessons" ON lesson_messages;

-- Policies for lessons
CREATE POLICY "Users can view their own lessons"
  ON lessons FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lessons"
  ON lessons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lessons"
  ON lessons FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lessons"
  ON lessons FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for lesson_pages (based on parent lesson ownership)
CREATE POLICY "Users can view pages of their lessons"
  ON lesson_pages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_pages.lesson_id AND lessons.user_id = auth.uid()
  ));

CREATE POLICY "Users can create pages for their lessons"
  ON lesson_pages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_pages.lesson_id AND lessons.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete pages of their lessons"
  ON lesson_pages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_pages.lesson_id AND lessons.user_id = auth.uid()
  ));

-- Policies for lesson_messages (based on parent lesson ownership)
CREATE POLICY "Users can view messages of their lessons"
  ON lesson_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_messages.lesson_id AND lessons.user_id = auth.uid()
  ));

CREATE POLICY "Users can create messages for their lessons"
  ON lesson_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM lessons WHERE lessons.id = lesson_messages.lesson_id AND lessons.user_id = auth.uid()
  ));
