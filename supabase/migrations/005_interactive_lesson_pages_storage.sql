-- Create storage bucket for interactive lesson page images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('interactive-lesson-pages', 'interactive-lesson-pages', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for interactive-lesson-pages bucket
-- Note: Path structure is document_id/page-X.png
-- We verify ownership through the document -> lesson -> user relationship

CREATE POLICY "Users can upload their lesson page images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'interactive-lesson-pages' AND
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents ild
            JOIN interactive_lessons il ON il.id = ild.interactive_lesson_id
            WHERE ild.id::text = (storage.foldername(storage.objects.name))[1]
            AND il.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view their lesson page images"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'interactive-lesson-pages' AND
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents ild
            JOIN interactive_lessons il ON il.id = ild.interactive_lesson_id
            WHERE ild.id::text = (storage.foldername(storage.objects.name))[1]
            AND il.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their lesson page images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'interactive-lesson-pages' AND
        EXISTS (
            SELECT 1 FROM interactive_lesson_documents ild
            JOIN interactive_lessons il ON il.id = ild.interactive_lesson_id
            WHERE ild.id::text = (storage.foldername(storage.objects.name))[1]
            AND il.user_id = auth.uid()
        )
    );

