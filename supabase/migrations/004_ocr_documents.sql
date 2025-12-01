-- Migration: OCR Documents Pipeline
-- Adds OCR-related columns to existing documents table and creates document_pages table
-- This migration is idempotent (safe to run multiple times)

-- Add OCR columns to existing documents table if they don't exist
DO $$ 
BEGIN
  -- Add original_file_path column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'original_file_path') THEN
    ALTER TABLE documents ADD COLUMN original_file_path TEXT;
  END IF;
  
  -- Add full_text column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'documents' AND column_name = 'full_text') THEN
    ALTER TABLE documents ADD COLUMN full_text TEXT;
  END IF;
END $$;

-- Table: document_pages
-- Stores individual pages extracted from documents with their OCR text
CREATE TABLE IF NOT EXISTS document_pages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  image_path TEXT NOT NULL,
  ocr_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster queries on document_id
CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);

-- Index for ordering pages
CREATE INDEX IF NOT EXISTS idx_document_pages_page_number ON document_pages(document_id, page_number);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_document_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on document_pages
DROP TRIGGER IF EXISTS trigger_document_pages_updated_at ON document_pages;
CREATE TRIGGER trigger_document_pages_updated_at
  BEFORE UPDATE ON document_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_document_pages_updated_at();

-- RLS for document_pages
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for backend operations)
DROP POLICY IF EXISTS "Service role full access to document_pages" ON document_pages;
CREATE POLICY "Service role full access to document_pages" ON document_pages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage buckets (run these separately in Supabase Dashboard if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('document-pages', 'document-pages', true) ON CONFLICT DO NOTHING;

