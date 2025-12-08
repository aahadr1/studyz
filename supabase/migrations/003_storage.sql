-- Create storage buckets for lesson documents and page images
-- Note: This needs to be run via Supabase Dashboard or API, not direct SQL
-- The following is documentation for the required bucket setup:

-- Bucket: lesson-documents
-- Purpose: Store original PDF files
-- Public: false (private, accessed via signed URLs)

-- Bucket: lesson-pages  
-- Purpose: Store converted page images (PNG)
-- Public: true (for easy image loading in viewer)

-- Storage policies (to be configured in Supabase Dashboard):
-- 1. lesson-documents: Only authenticated users can upload/read their own files
-- 2. lesson-pages: Only authenticated users can upload, public read access

-- SQL to insert storage policies (run after buckets are created):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-documents', 'lesson-documents', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-pages', 'lesson-pages', true);







