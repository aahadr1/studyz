# Studyz Setup Guide

This guide will walk you through setting up the Studyz application from scratch.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works)
- An OpenAI API account with access to GPT-4 Vision

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be provisioned

### Run Database Migration

1. In your Supabase dashboard, go to the SQL Editor
2. Open the file `supabase/migrations/001_initial_schema.sql`
3. Copy the entire contents and paste it into the SQL Editor
4. Click "Run" to execute the migration

This will create:
- Tables: `lessons`, `documents`, `document_pages`
- Storage buckets: `documents`, `document-pages`
- Row Level Security policies
- Indexes for performance

### Get Your Supabase Credentials

1. In your Supabase dashboard, go to Settings > API
2. Copy the following:
   - Project URL (under "Project URL")
   - Anon/Public key (under "Project API keys" > "anon public")
   - Service Role key (under "Project API keys" > "service_role") - Keep this secret!

## Step 3: Set Up OpenAI

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Make sure you have access to GPT-4 Vision API

## Step 4: Configure Environment Variables

1. Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` and fill in your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# OpenAI Configuration
OPENAI_API_KEY=sk-your_openai_key_here
```

## Step 5: Configure Storage Buckets

In your Supabase dashboard:

1. Go to Storage
2. You should see two buckets: `documents` and `document-pages`
3. For both buckets, make sure they are set to **private** (not public)
4. The RLS policies we created will handle access control

## Step 6: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 7: Create Your First Account

1. Navigate to the register page
2. Create an account with your email and password
3. Check your email for the verification link (if email confirmation is enabled in Supabase)
4. Log in with your credentials

## Features Overview

### 1. Dashboard
- View statistics about your lessons and documents
- Quick access to all features

### 2. Lessons
- Create new lessons with a name
- Upload multiple documents (PDF, PPTX, DOCX)
- View all your lessons in a card layout

### 3. Lesson Detail
- View all documents in a lesson
- Upload additional documents
- Select documents for studying
- Click "Study Lesson" to start

### 4. Study Session
- View documents page by page
- Navigate between pages and documents
- AI Assistant sidebar with two modes:
  - **Chat Mode**: Text-based Q&A about the current page
  - **Voice Mode**: Real-time conversational AI (requires additional setup)

### 5. AI Assistant
The AI assistant can see the current page you're viewing and answer questions about it using OpenAI's GPT-4 Vision API.

## Document Processing

When you upload a document:

1. The file is uploaded to Supabase Storage
2. A document record is created in the database
3. The backend API (`/api/process-document`) is triggered
4. For PDFs, each page is converted to a PNG image
5. Images are stored in the `document-pages` bucket
6. Each page image is linked to the document in the `document_pages` table

This allows the AI to "see" each page as an image for better understanding.

## Known Limitations

### Voice Assistant
The voice assistant is a UI placeholder. To fully implement it, you need to:

1. Set up a WebSocket server that connects to OpenAI's Realtime API
2. Handle audio streaming and transcription
3. Update the `VoiceAssistant.tsx` component to connect to your WebSocket server

### Document Processing
Currently, only PDF processing is fully implemented. PPTX and DOCX processing require additional libraries or services like:
- LibreOffice for server-side conversion
- Cloud services like CloudConvert or similar

## Troubleshooting

### "Page not found or not yet processed"
- Documents take a few seconds to process after upload
- Check the browser console for errors
- Verify the `/api/process-document` endpoint is working

### Authentication Issues
- Make sure your Supabase URL and keys are correct
- Check if email confirmation is required in Supabase Auth settings
- Verify RLS policies are enabled

### Storage Issues
- Ensure storage buckets are created with the correct names
- Verify storage policies are set up correctly
- Check file size limits in Supabase

## Production Deployment

### Recommended Platforms
- **Vercel** (easiest for Next.js)
- **Netlify**
- Any Node.js hosting platform

### Environment Variables
Make sure to set all environment variables in your hosting platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

### Important Security Notes
- Never commit `.env.local` to version control
- Keep your `SUPABASE_SERVICE_ROLE_KEY` secret
- Keep your `OPENAI_API_KEY` secret
- Use environment variables for all sensitive data

## Future Enhancements

Possible improvements to consider:
- Add support for more document types (images, videos, etc.)
- Implement study progress tracking
- Add flashcards and quizzes generation from documents
- Implement collaborative study sessions
- Add note-taking functionality
- Implement spaced repetition for better learning
- Add document annotations and highlights

## Support

For issues or questions:
1. Check the console for error messages
2. Verify all setup steps were completed
3. Check Supabase logs for backend errors
4. Review OpenAI API usage and quotas

## License

This project is for educational purposes.

