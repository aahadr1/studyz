-- Migration: OCR Documents Pipeline
-- Creates tables for storing scanned documents and their OCR results

-- Table: documents
-- Stores original uploaded PDF documents and their OCR status
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_ocr',
  full_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Trigger to auto-update updated_at on documents
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;
CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- Trigger to auto-update updated_at on document_pages
DROP TRIGGER IF EXISTS trigger_document_pages_updated_at ON document_pages;
CREATE TRIGGER trigger_document_pages_updated_at
  BEFORE UPDATE ON document_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- RLS Policies (if needed - adjust based on your auth setup)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for backend operations)
DROP POLICY IF EXISTS "Service role full access to documents" ON documents;
CREATE POLICY "Service role full access to documents" ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to document_pages" ON document_pages;
CREATE POLICY "Service role full access to document_pages" ON document_pages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage buckets (run these in Supabase Dashboard SQL editor if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('document-pages', 'document-pages', true) ON CONFLICT DO NOTHING;

