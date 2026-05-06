-- Create storage bucket for podcast documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('podcast-documents', 'podcast-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to upload podcast documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read podcast documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their podcast documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their podcast documents" ON storage.objects;

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

-- Also ensure the 'documents' bucket exists with proper policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing document policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their documents" ON storage.objects;

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

COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';
