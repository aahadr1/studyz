-- Intelligent Podcast: source documents + per-page transcriptions (resumable pipeline)

-- Stores uploaded PDF source documents for an intelligent podcast
CREATE TABLE IF NOT EXISTS intelligent_podcast_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES intelligent_podcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(podcast_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_intelligent_podcast_documents_podcast_id
  ON intelligent_podcast_documents(podcast_id);
CREATE INDEX IF NOT EXISTS idx_intelligent_podcast_documents_user_id
  ON intelligent_podcast_documents(user_id);

ALTER TABLE intelligent_podcast_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own intelligent podcast documents" ON intelligent_podcast_documents;
DROP POLICY IF EXISTS "Users can create their own intelligent podcast documents" ON intelligent_podcast_documents;
DROP POLICY IF EXISTS "Users can update their own intelligent podcast documents" ON intelligent_podcast_documents;
DROP POLICY IF EXISTS "Users can delete their own intelligent podcast documents" ON intelligent_podcast_documents;

CREATE POLICY "Users can view their own intelligent podcast documents"
  ON intelligent_podcast_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own intelligent podcast documents"
  ON intelligent_podcast_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own intelligent podcast documents"
  ON intelligent_podcast_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own intelligent podcast documents"
  ON intelligent_podcast_documents FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_intelligent_podcast_documents_updated_at ON intelligent_podcast_documents;
CREATE TRIGGER update_intelligent_podcast_documents_updated_at
  BEFORE UPDATE ON intelligent_podcast_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Stores per-page vision transcriptions (so processing can resume)
CREATE TABLE IF NOT EXISTS intelligent_podcast_page_transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES intelligent_podcasts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES intelligent_podcast_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  page_number INTEGER NOT NULL CHECK (page_number > 0),
  transcription TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(document_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_intelligent_podcast_page_transcriptions_podcast_id
  ON intelligent_podcast_page_transcriptions(podcast_id);
CREATE INDEX IF NOT EXISTS idx_intelligent_podcast_page_transcriptions_document_id
  ON intelligent_podcast_page_transcriptions(document_id);

ALTER TABLE intelligent_podcast_page_transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own intelligent podcast page transcriptions" ON intelligent_podcast_page_transcriptions;
DROP POLICY IF EXISTS "Users can create their own intelligent podcast page transcriptions" ON intelligent_podcast_page_transcriptions;
DROP POLICY IF EXISTS "Users can update their own intelligent podcast page transcriptions" ON intelligent_podcast_page_transcriptions;
DROP POLICY IF EXISTS "Users can delete their own intelligent podcast page transcriptions" ON intelligent_podcast_page_transcriptions;

CREATE POLICY "Users can view their own intelligent podcast page transcriptions"
  ON intelligent_podcast_page_transcriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own intelligent podcast page transcriptions"
  ON intelligent_podcast_page_transcriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own intelligent podcast page transcriptions"
  ON intelligent_podcast_page_transcriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own intelligent podcast page transcriptions"
  ON intelligent_podcast_page_transcriptions FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_intelligent_podcast_page_transcriptions_updated_at ON intelligent_podcast_page_transcriptions;
CREATE TRIGGER update_intelligent_podcast_page_transcriptions_updated_at
  BEFORE UPDATE ON intelligent_podcast_page_transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

