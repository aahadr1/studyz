-- ============================================
-- COMPREHENSIVE PODCAST SYSTEM MIGRATION
-- Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Create intelligent podcasts system tables
-- ============================================

-- Main podcasts table
CREATE TABLE IF NOT EXISTS intelligent_podcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL, -- Total duration in seconds
  language TEXT NOT NULL, -- en, fr, es, de, etc.
  
  -- Source documents
  document_ids TEXT[] NOT NULL,
  
  -- Intelligence components (stored as JSONB)
  knowledge_graph JSONB NOT NULL, -- KnowledgeGraph type
  chapters JSONB NOT NULL, -- PodcastChapter[] type
  segments JSONB NOT NULL, -- PodcastSegment[] type
  predicted_questions JSONB NOT NULL, -- PredictedQuestion[] type
  
  -- Audio
  audio_url TEXT, -- URL to merged audio file (optional)
  transcript_url TEXT, -- URL to full transcript (optional)
  
  -- Status
  status TEXT NOT NULL DEFAULT 'generating', -- generating, ready, error
  generation_progress INTEGER DEFAULT 0, -- 0-100
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Podcast sessions (user playback state)
CREATE TABLE IF NOT EXISTS podcast_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES intelligent_podcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Playback state
  current_position REAL NOT NULL DEFAULT 0, -- Current playback position in seconds
  playback_rate REAL NOT NULL DEFAULT 1.0,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  
  -- Progress tracking
  completed_segments TEXT[] NOT NULL DEFAULT '{}',
  completed_chapters TEXT[] NOT NULL DEFAULT '{}',
  progress_percentage REAL NOT NULL DEFAULT 0,
  
  -- Interactions
  interruptions TEXT[] NOT NULL DEFAULT '{}', -- Array of interruption IDs
  bookmarks JSONB NOT NULL DEFAULT '[]', -- Array of bookmark objects
  
  -- Analytics
  pause_count INTEGER NOT NULL DEFAULT 0,
  rewind_count INTEGER NOT NULL DEFAULT 0,
  difficult_segments TEXT[] NOT NULL DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one session per user per podcast
  UNIQUE(podcast_id, user_id)
);

-- Podcast interruptions (questions asked during playback)
CREATE TABLE IF NOT EXISTS podcast_interruptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES intelligent_podcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES podcast_sessions(id) ON DELETE CASCADE,
  
  -- Context
  timestamp REAL NOT NULL, -- When the interruption occurred (seconds)
  segment_id TEXT NOT NULL,
  
  -- Question (from voice or text)
  question_audio TEXT, -- Base64 or URL
  question_text TEXT NOT NULL,
  
  -- Response
  response_text TEXT NOT NULL,
  response_audio TEXT, -- Base64 or URL
  
  -- Multi-turn conversation
  conversation_turns JSONB NOT NULL DEFAULT '[]', -- Array of conversation turn objects
  
  -- Context at time of interruption
  concepts_discussed TEXT[] NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Analytics table for podcasts
CREATE TABLE IF NOT EXISTS podcast_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES intelligent_podcasts(id) ON DELETE CASCADE,
  
  -- Usage stats
  total_listens INTEGER NOT NULL DEFAULT 0,
  unique_listeners INTEGER NOT NULL DEFAULT 0,
  average_completion_rate REAL NOT NULL DEFAULT 0,
  
  -- Engagement
  most_paused_segments JSONB NOT NULL DEFAULT '[]',
  most_asked_questions JSONB NOT NULL DEFAULT '[]',
  average_interruptions_per_session REAL NOT NULL DEFAULT 0,
  popular_chapters JSONB NOT NULL DEFAULT '[]',
  
  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Create indexes for better performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_intelligent_podcasts_user_id ON intelligent_podcasts(user_id);
CREATE INDEX IF NOT EXISTS idx_intelligent_podcasts_status ON intelligent_podcasts(status);
CREATE INDEX IF NOT EXISTS idx_intelligent_podcasts_created_at ON intelligent_podcasts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_podcast_sessions_podcast_id ON podcast_sessions(podcast_id);
CREATE INDEX IF NOT EXISTS idx_podcast_sessions_user_id ON podcast_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_podcast_sessions_last_accessed ON podcast_sessions(last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_podcast_interruptions_podcast_id ON podcast_interruptions(podcast_id);
CREATE INDEX IF NOT EXISTS idx_podcast_interruptions_user_id ON podcast_interruptions(user_id);
CREATE INDEX IF NOT EXISTS idx_podcast_interruptions_session_id ON podcast_interruptions(session_id);
CREATE INDEX IF NOT EXISTS idx_podcast_interruptions_created_at ON podcast_interruptions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_podcast_analytics_podcast_id ON podcast_analytics(podcast_id);

-- Step 3: Enable Row Level Security (RLS)
-- ============================================

ALTER TABLE intelligent_podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_interruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_analytics ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies (if any) to avoid conflicts
-- ============================================

DROP POLICY IF EXISTS "Users can view their own podcasts" ON intelligent_podcasts;
DROP POLICY IF EXISTS "Users can create their own podcasts" ON intelligent_podcasts;
DROP POLICY IF EXISTS "Users can update their own podcasts" ON intelligent_podcasts;
DROP POLICY IF EXISTS "Users can delete their own podcasts" ON intelligent_podcasts;

DROP POLICY IF EXISTS "Users can view their own sessions" ON podcast_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON podcast_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON podcast_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON podcast_sessions;

DROP POLICY IF EXISTS "Users can view their own interruptions" ON podcast_interruptions;
DROP POLICY IF EXISTS "Users can create their own interruptions" ON podcast_interruptions;

DROP POLICY IF EXISTS "Users can view analytics for their podcasts" ON podcast_analytics;

-- Step 5: Create RLS Policies
-- ============================================

-- RLS Policies for intelligent_podcasts
CREATE POLICY "Users can view their own podcasts"
  ON intelligent_podcasts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own podcasts"
  ON intelligent_podcasts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own podcasts"
  ON intelligent_podcasts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own podcasts"
  ON intelligent_podcasts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for podcast_sessions
CREATE POLICY "Users can view their own sessions"
  ON podcast_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
  ON podcast_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON podcast_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
  ON podcast_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for podcast_interruptions
CREATE POLICY "Users can view their own interruptions"
  ON podcast_interruptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own interruptions"
  ON podcast_interruptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for podcast_analytics (read-only for owners)
CREATE POLICY "Users can view analytics for their podcasts"
  ON podcast_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM intelligent_podcasts 
      WHERE intelligent_podcasts.id = podcast_analytics.podcast_id 
      AND intelligent_podcasts.user_id = auth.uid()
    )
  );

-- Step 6: Create triggers
-- ============================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_intelligent_podcasts_updated_at ON intelligent_podcasts;
DROP TRIGGER IF EXISTS update_podcast_sessions_updated_at ON podcast_sessions;
DROP TRIGGER IF EXISTS trigger_create_podcast_analytics ON intelligent_podcasts;

-- Create triggers
CREATE TRIGGER update_intelligent_podcasts_updated_at
  BEFORE UPDATE ON intelligent_podcasts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_podcast_sessions_updated_at
  BEFORE UPDATE ON podcast_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create analytics entry when podcast is created
CREATE OR REPLACE FUNCTION create_podcast_analytics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO podcast_analytics (podcast_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_create_podcast_analytics
  AFTER INSERT ON intelligent_podcasts
  FOR EACH ROW
  EXECUTE FUNCTION create_podcast_analytics();

-- Step 7: Create storage buckets
-- ============================================

-- Create storage bucket for podcast documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('podcast-documents', 'podcast-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Also ensure the 'documents' bucket exists with proper policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 8: Drop existing storage policies (to avoid conflicts)
-- ============================================

DROP POLICY IF EXISTS "Allow authenticated users to upload podcast documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read podcast documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their podcast documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their podcast documents" ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated users to upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their documents" ON storage.objects;

-- Step 9: Create storage policies
-- ============================================

-- Policy: Allow authenticated users to upload to podcast-documents bucket
CREATE POLICY "Allow authenticated users to upload podcast documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'podcast-documents'
);

-- Policy: Allow authenticated users to read podcast documents (public bucket)
CREATE POLICY "Allow users to read podcast documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'podcast-documents'
);

-- Policy: Allow authenticated users to update their own uploads
CREATE POLICY "Allow users to update their podcast documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'podcast-documents'
);

-- Policy: Allow authenticated users to delete their own uploads
CREATE POLICY "Allow users to delete their podcast documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'podcast-documents'
);

-- Policy: Allow authenticated users to upload to documents bucket
CREATE POLICY "Allow authenticated users to upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
);

-- Policy: Allow users to read documents
CREATE POLICY "Allow users to read documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
);

-- Policy: Allow users to update their documents
CREATE POLICY "Allow users to update their documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
);

-- Policy: Allow users to delete their documents
CREATE POLICY "Allow users to delete their documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
);

-- Step 10: Add comments for documentation
-- ============================================

COMMENT ON TABLE intelligent_podcasts IS 'Stores intelligent interactive podcasts with knowledge graphs';
COMMENT ON TABLE podcast_sessions IS 'Tracks user playback sessions and progress';
COMMENT ON TABLE podcast_interruptions IS 'Stores questions asked during podcast playback via Realtime API';
COMMENT ON TABLE podcast_analytics IS 'Aggregated analytics for each podcast';
COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';

COMMENT ON COLUMN intelligent_podcasts.knowledge_graph IS 'JSONB containing concepts, relationships, and embeddings';
COMMENT ON COLUMN intelligent_podcasts.segments IS 'JSONB array of podcast segments with audio URLs and timestamps';
COMMENT ON COLUMN intelligent_podcasts.predicted_questions IS 'JSONB array of pre-generated Q&A for common questions';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- You can now use the intelligent podcast system!
