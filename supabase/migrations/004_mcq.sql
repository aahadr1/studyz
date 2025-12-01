-- MCQ Sets table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mcq_sets') THEN
        CREATE TABLE mcq_sets (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL,
          name TEXT,
          source_pdf_name TEXT,
          document_url TEXT,
          total_pages INTEGER DEFAULT 0,
          total_questions INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

-- MCQ Pages table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mcq_pages') THEN
        CREATE TABLE mcq_pages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          mcq_set_id UUID REFERENCES mcq_sets(id) ON DELETE CASCADE,
          page_number INTEGER NOT NULL,
          image_url TEXT NOT NULL,
          extracted_question_count INTEGER DEFAULT 0
        );
    END IF;
END $$;

-- MCQ Questions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mcq_questions') THEN
        CREATE TABLE mcq_questions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          mcq_set_id UUID REFERENCES mcq_sets(id) ON DELETE CASCADE,
          page_number INTEGER NOT NULL,
          question TEXT NOT NULL,
          options JSONB NOT NULL,
          correct_option TEXT NOT NULL,
          explanation TEXT
        );
    END IF;
END $$;

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_mcq_sets_user_id ON mcq_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_mcq_pages_set_id ON mcq_pages(mcq_set_id);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_set_id ON mcq_questions(mcq_set_id);

-- Enable RLS
ALTER TABLE mcq_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_questions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own mcq sets" ON mcq_sets;
DROP POLICY IF EXISTS "Users can create their own mcq sets" ON mcq_sets;
DROP POLICY IF EXISTS "Users can update their own mcq sets" ON mcq_sets;
DROP POLICY IF EXISTS "Users can delete their own mcq sets" ON mcq_sets;

DROP POLICY IF EXISTS "Users can view pages of their mcq sets" ON mcq_pages;
DROP POLICY IF EXISTS "Users can create pages for their mcq sets" ON mcq_pages;
DROP POLICY IF EXISTS "Users can delete pages of their mcq sets" ON mcq_pages;

DROP POLICY IF EXISTS "Users can view questions of their mcq sets" ON mcq_questions;
DROP POLICY IF EXISTS "Users can create questions for their mcq sets" ON mcq_questions;
DROP POLICY IF EXISTS "Users can delete questions of their mcq sets" ON mcq_questions;

-- Policies for mcq_sets
CREATE POLICY "Users can view their own mcq sets"
  ON mcq_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mcq sets"
  ON mcq_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mcq sets"
  ON mcq_sets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mcq sets"
  ON mcq_sets FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for mcq_pages (based on parent mcq_set ownership)
CREATE POLICY "Users can view pages of their mcq sets"
  ON mcq_pages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM mcq_sets WHERE mcq_sets.id = mcq_pages.mcq_set_id AND mcq_sets.user_id = auth.uid()
  ));

CREATE POLICY "Users can create pages for their mcq sets"
  ON mcq_pages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM mcq_sets WHERE mcq_sets.id = mcq_pages.mcq_set_id AND mcq_sets.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete pages of their mcq sets"
  ON mcq_pages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM mcq_sets WHERE mcq_sets.id = mcq_pages.mcq_set_id AND mcq_sets.user_id = auth.uid()
  ));

-- Policies for mcq_questions (based on parent mcq_set ownership)
CREATE POLICY "Users can view questions of their mcq sets"
  ON mcq_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM mcq_sets WHERE mcq_sets.id = mcq_questions.mcq_set_id AND mcq_sets.user_id = auth.uid()
  ));

CREATE POLICY "Users can create questions for their mcq sets"
  ON mcq_questions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM mcq_sets WHERE mcq_sets.id = mcq_questions.mcq_set_id AND mcq_sets.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete questions of their mcq sets"
  ON mcq_questions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM mcq_sets WHERE mcq_sets.id = mcq_questions.mcq_set_id AND mcq_sets.user_id = auth.uid()
  ));

