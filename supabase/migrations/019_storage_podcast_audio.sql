-- Storage bucket for generated podcast audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('podcast-audio', 'podcast-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (safe if already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to upload podcast audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read podcast audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update podcast audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete podcast audio" ON storage.objects;

-- Allow authenticated users to upload to podcast-audio bucket
CREATE POLICY "Allow authenticated users to upload podcast audio"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'podcast-audio');

-- Allow authenticated users to read podcast-audio files
CREATE POLICY "Allow users to read podcast audio"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'podcast-audio');

-- Allow authenticated users to update podcast-audio files
CREATE POLICY "Allow users to update podcast audio"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'podcast-audio');

-- Allow authenticated users to delete podcast-audio files
CREATE POLICY "Allow users to delete podcast audio"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'podcast-audio');

