# Quick Start Guide - Studyz

Get up and running in 5 minutes!

## 1. Install Dependencies (1 min)

```bash
npm install
```

## 2. Set Up Supabase (2 min)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (choose a name, password, and region)
3. Wait 1-2 minutes for provisioning

### Run the SQL Migration

1. In Supabase dashboard → SQL Editor
2. Copy ALL contents from `supabase/migrations/001_initial_schema.sql`
3. Paste and click "Run"
4. You should see "Success. No rows returned"

### Get Your Keys

1. Settings → API
2. Copy "Project URL" and both API keys

## 3. Configure Environment (1 min)

Create `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
OPENAI_API_KEY=sk-your_openai_key_here
```

## 4. Run the App (1 min)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 5. Use the App!

1. **Register** - Create an account
2. **Create a Lesson** - Click "New Lesson"
3. **Upload Documents** - Add PDF files (PDFs work, PPTX/DOCX are placeholders)
4. **Select Documents** - Check the ones you want to study
5. **Study** - Click "Study Lesson"
6. **Chat with AI** - Ask questions about the current page!

## Features

✅ **Working Now:**
- Authentication (login/register)
- Lesson management
- PDF upload and processing
- Page-by-page document viewer
- AI chat assistant with vision (sees the current page)
- Document selection

🚧 **Requires Additional Setup:**
- Voice assistant (needs WebSocket server + OpenAI Realtime API)
- PPTX/DOCX processing (needs LibreOffice or cloud service)

## Troubleshooting

**"Page not found or not yet processed"**
- Wait a few seconds after upload for processing
- Check browser console for errors

**Authentication errors**
- Double-check your Supabase keys in `.env.local`
- Make sure you ran the SQL migration

**Document processing fails**
- Only PDFs are fully supported currently
- Check file size (Supabase free tier has limits)

## What's Next?

See `SETUP.md` for detailed documentation and production deployment guide.

## Architecture Overview

```
Frontend (Next.js 14)
├── Authentication (Supabase Auth)
├── Database (PostgreSQL via Supabase)
├── Storage (Supabase Storage)
└── AI (OpenAI GPT-4 Vision)

Document Flow:
1. User uploads PDF → Supabase Storage
2. API processes PDF → Converts pages to images
3. Images stored → Supabase Storage (document-pages)
4. Study session → AI sees page images via vision API
```

## Important Notes

- Keep your `.env.local` file secret (it's in .gitignore)
- PDF processing happens server-side and may take a few seconds
- The AI can literally "see" the page images using GPT-4 Vision
- Voice assistant UI is ready but needs backend implementation

Enjoy studying! 🎓

