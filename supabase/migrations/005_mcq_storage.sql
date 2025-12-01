-- Create storage buckets for MCQ documents and page images
-- Note: This needs to be run via Supabase Dashboard or API, not direct SQL
-- The following is documentation for the required bucket setup:

-- Bucket: mcq-documents
-- Purpose: Store original PDF files
-- Public: false (private, accessed via signed URLs)

-- Bucket: mcq-pages  
-- Purpose: Store converted page images (PNG)
-- Public: true (for easy image loading and OpenAI access)

-- Storage policies (to be configured in Supabase Dashboard):
-- 1. mcq-documents: Only authenticated users can upload/read their own files
-- 2. mcq-pages: Only authenticated users can upload, public read access

-- SQL to insert storage buckets (run after buckets are created):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('mcq-documents', 'mcq-documents', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('mcq-pages', 'mcq-pages', true);

