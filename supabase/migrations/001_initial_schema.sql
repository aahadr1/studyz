-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create lessons table
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    page_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create document_pages table (stores image references for each page)
CREATE TABLE document_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(document_id, page_number)
);

-- Create indexes
CREATE INDEX idx_lessons_user_id ON lessons(user_id);
CREATE INDEX idx_documents_lesson_id ON documents(lesson_id);
CREATE INDEX idx_document_pages_document_id ON document_pages(document_id);

-- Enable Row Level Security
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

-- Create policies for lessons
CREATE POLICY "Users can view their own lessons"
    ON lessons FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lessons"
    ON lessons FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lessons"
    ON lessons FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lessons"
    ON lessons FOR DELETE
    USING (auth.uid() = user_id);

-- Create policies for documents
CREATE POLICY "Users can view documents from their lessons"
    ON documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = documents.lesson_id
            AND lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create documents in their lessons"
    ON documents FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = lesson_id
            AND lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update documents in their lessons"
    ON documents FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = documents.lesson_id
            AND lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete documents from their lessons"
    ON documents FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = documents.lesson_id
            AND lessons.user_id = auth.uid()
        )
    );

-- Create policies for document_pages
CREATE POLICY "Users can view pages from their documents"
    ON document_pages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM documents
            JOIN lessons ON lessons.id = documents.lesson_id
            WHERE documents.id = document_pages.document_id
            AND lessons.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create pages in their documents"
    ON document_pages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents
            JOIN lessons ON lessons.id = documents.lesson_id
            WHERE documents.id = document_id
            AND lessons.user_id = auth.uid()
        )
    );

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('document-pages', 'document-pages', false);

-- Create storage policies
CREATE POLICY "Users can upload documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'documents' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their documents"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'documents' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can upload document pages"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'document-pages' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their document pages"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'document-pages' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

