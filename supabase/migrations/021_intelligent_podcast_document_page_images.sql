-- Intelligent Podcast: store page image URLs per document (client-side PDF->images flow)

ALTER TABLE intelligent_podcast_documents
ADD COLUMN IF NOT EXISTS page_images JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN intelligent_podcast_documents.page_images IS 'Array of { page_number, url } objects for page images (public URLs or data URLs).';

