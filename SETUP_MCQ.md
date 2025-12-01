# MCQ Feature Setup Guide

You're seeing a 500 error because the database tables and storage buckets haven't been set up yet. Follow these steps:

## Step 1: Run Database Migration

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the contents of `supabase/migrations/004_mcq.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)

You should see: "Success. No rows returned"

## Step 2: Create Storage Buckets

### Option A: Via Supabase Dashboard (Recommended)

1. In Supabase Dashboard, go to **Storage** (left sidebar)
2. Click **Create a new bucket**
3. Create bucket: `mcq-pages`
   - Name: `mcq-pages`
   - Public: **Yes** (check the box)
   - Click **Create bucket**

### Option B: Via SQL (Alternative)

Go to SQL Editor and run:

```sql
-- Create the buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('mcq-pages', 'mcq-pages', true)
ON CONFLICT (id) DO NOTHING;

-- Set up policies for mcq-pages bucket
CREATE POLICY "Authenticated users can upload to mcq-pages"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mcq-pages');

CREATE POLICY "Public can read mcq-pages"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'mcq-pages');

CREATE POLICY "Users can update their own mcq-pages"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'mcq-pages');

CREATE POLICY "Users can delete their own mcq-pages"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mcq-pages');
```

## Step 3: Verify Setup

Run this SQL query to check if everything is set up:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('mcq_sets', 'mcq_pages', 'mcq_questions');

-- Check if storage bucket exists
SELECT * FROM storage.buckets WHERE name = 'mcq-pages';
```

You should see:
- 3 tables: `mcq_sets`, `mcq_pages`, `mcq_questions`
- 1 bucket: `mcq-pages`

## Step 4: Test the Feature

1. Go to your app: https://studyz.app/mcq/new
2. Upload a PDF with MCQ questions
3. Wait for processing
4. See your interactive quiz!

## Troubleshooting

### Error: "relation mcq_sets does not exist"
- **Solution**: Run the migration from Step 1

### Error: "Bucket not found"
- **Solution**: Create the storage bucket from Step 2

### Error: "row-level security policy violation"
- **Solution**: The migration creates RLS policies automatically. If this persists, check that you're logged in

### Still getting 500 errors?
- Check Vercel logs: https://vercel.com/dashboard → Your Project → Logs
- Look for detailed error messages
- Check that all environment variables are set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`

## Quick SQL Test

Run this to test if everything works:

```sql
-- Test insert (replace USER_ID with your actual user ID)
INSERT INTO mcq_sets (user_id, name, source_pdf_name, total_pages, total_questions)
VALUES ('YOUR_USER_ID_HERE', 'Test Set', 'test.pdf', 1, 0)
RETURNING *;

-- If successful, clean up
DELETE FROM mcq_sets WHERE name = 'Test Set';
```

If the insert works, your database is ready! 🎉

