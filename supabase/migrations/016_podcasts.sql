-- Create podcasts table
CREATE TABLE IF NOT EXISTS podcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL, -- Total duration in seconds
  segments JSONB NOT NULL, -- Array of PodcastSegment objects
  document_ids TEXT[] NOT NULL, -- Array of document IDs used to generate the podcast
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster user queries
CREATE INDEX idx_podcasts_user_id ON podcasts(user_id);
CREATE INDEX idx_podcasts_created_at ON podcasts(created_at DESC);

-- Create podcast_interruptions table for tracking user questions
CREATE TABLE IF NOT EXISTS podcast_interruptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL, -- Timestamp in seconds when the interruption occurred
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  audio_url TEXT, -- Optional audio URL for the answer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for interruptions
CREATE INDEX idx_podcast_interruptions_podcast_id ON podcast_interruptions(podcast_id);
CREATE INDEX idx_podcast_interruptions_user_id ON podcast_interruptions(user_id);
CREATE INDEX idx_podcast_interruptions_created_at ON podcast_interruptions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_interruptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for podcasts table
CREATE POLICY "Users can view their own podcasts"
  ON podcasts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own podcasts"
  ON podcasts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own podcasts"
  ON podcasts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own podcasts"
  ON podcasts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for podcast_interruptions table
CREATE POLICY "Users can view their own interruptions"
  ON podcast_interruptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own interruptions"
  ON podcast_interruptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger for podcasts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_podcasts_updated_at
  BEFORE UPDATE ON podcasts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE podcasts IS 'Stores generated interactive podcasts from user documents';
COMMENT ON TABLE podcast_interruptions IS 'Stores user questions and answers during podcast playback';
COMMENT ON COLUMN podcasts.segments IS 'JSONB array of podcast segments with speaker, text, audioUrl, duration, and timestamp';
COMMENT ON COLUMN podcasts.document_ids IS 'Array of document IDs used to generate this podcast';
