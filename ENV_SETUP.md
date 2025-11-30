# Environment Variables Setup Guide

## Required Environment Variables

You need **4 environment variables** to run Studyz:

1. `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key
3. `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
4. `OPENAI_API_KEY` - OpenAI API key for the AI chat assistant

## Setup

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Create a new project

### 2. Get Your Supabase Credentials

In Supabase dashboard → Settings → API:
- Copy the Project URL
- Copy the anon/public key
- Copy the service_role key (click "Reveal")

### 3. Set Up Supabase Storage Buckets

In Supabase dashboard → Storage:

1. Create bucket `lesson-documents` (Private)
   - Used for storing original PDF files

2. Create bucket `lesson-pages` (Public)
   - Used for storing converted page images
   - Enable public access for image viewing

### 4. Run Database Migrations

Apply the migrations in `supabase/migrations/` folder:
- `001_initial_schema.sql`
- `002_lessons.sql`

You can run these via Supabase dashboard → SQL Editor, or use the Supabase CLI.

### 5. Get OpenAI API Key

1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key

### 6. Create .env.local

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-api-key
```

### 7. Run the app

```bash
npm run dev
```

## Security

- Never commit `.env.local` to git
- Never expose the service_role key in client code
- Never expose the OpenAI API key in client code
