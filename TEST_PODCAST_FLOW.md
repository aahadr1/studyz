# 🧪 TEST WORKFLOW - Intelligent Podcast

## ✅ PRE-FLIGHT CHECKLIST

Avant de tester, vérifiez :

### 1. Environment Variables (.env.local)
```bash
OPENAI_API_KEY=sk-...           # ✅ Required
NEXT_PUBLIC_SUPABASE_URL=...    # ✅ Required
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # ✅ Required
```

### 2. Supabase Setup
- [ ] Migration 017_intelligent_podcasts.sql executed
- [ ] Storage bucket `podcast-documents` created
- [ ] Storage policies added (INSERT, SELECT for authenticated users)

### 3. Database Tables Check
Run in Supabase SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%podcast%';
```

Should return:
- intelligent_podcasts
- podcast_sessions
- podcast_interruptions
- podcast_analytics

---

## 🚀 FULL WORKFLOW TEST

### STEP 1: Upload PDFs
1. Go to `/intelligent-podcast/new`
2. Drag & drop a PDF (or click to browse)
3. **Expected**: File appears with 📄 icon, status "pending"
4. Click "Upload Files to Storage"
5. **Expected**: Status changes to ⏳ uploading → ✅ uploaded
6. **Check**: `url` field should be populated (visible in console.log)

**If fails**: Check storage bucket exists and policies are correct

### STEP 2: Configure Podcast
1. Set Duration (e.g., 15 min for testing)
2. Language: Auto-detect or French
3. Style: Conversational
4. Voice: OpenAI (fastest for testing)

### STEP 3: Generate Podcast
1. Click "🎙️ Generate Intelligent Podcast"
2. **Expected**: Loading spinner shows
3. **Backend process** (check server logs):
   ```
   [Podcast] Starting generation for X documents
   [PDF Extractor] Processing filename.pdf...
   [PDF Extractor] Converted to Y images
   [PDF Extractor] Extracting page 1/Y
   ...
   [Script] Starting intelligent script generation...
   [Audio] Starting audio generation for Z segments
   ...
   [Podcast] Generation completed successfully: <uuid>
   ```

**Estimated time**: 2-5 minutes depending on PDF size

**If fails at PDF extraction**: 
- Check OPENAI_API_KEY is valid
- Check PDF is valid and not corrupted
- Check GPT-4o is available in your account

**If fails at audio generation**:
- OpenAI TTS should work with any OpenAI key
- Check rate limits

### STEP 4: Listen to Podcast
1. **Expected**: Redirect to `/intelligent-podcast/<id>`
2. Player should show:
   - Podcast title
   - Chapters list (right sidebar)
   - Transcript with segments
   - Play/Pause controls
   - Playback speed selector

3. Click Play
4. **Expected**: Audio plays, transcript scrolls

### STEP 5: Interactive Q&A (REALTIME API)
1. Wait for a segment with 💡 "Good moment to ask a question"
2. Click "🎤 Ask Question" button
3. **Expected**: 
   - Podcast pauses
   - Modal opens
   - Microphone activates
   - "Listening..." appears

4. Speak a question (e.g., "Can you explain this concept?")
5. **Expected**:
   - Your speech transcribed in real-time
   - AI responds with voice (<1s latency)
   - Response transcript appears

6. Click "↩ Resume Podcast"
7. **Expected**: Podcast continues from where it paused

**If fails**:
- Check NEXT_PUBLIC_OPENAI_API_KEY is set (for browser)
- Check microphone permissions granted
- Check WebSocket connection (console logs)

---

## 🔍 DEBUG CHECKLIST

### If "Unauthorized" error:
- [ ] User is logged in (`/login`)
- [ ] Session exists in cookies
- [ ] createServerClient reads cookies correctly

### If "At least one document is required":
- [ ] documentUrls array not empty
- [ ] Each item has { url, name }
- [ ] URLs are valid and accessible

### If "Failed to extract content":
- [ ] PDF URL is accessible (try opening in browser)
- [ ] PDF is valid (not corrupted)
- [ ] OPENAI_API_KEY has GPT-4o access

### If "Failed to generate audio":
- [ ] OpenAI TTS is enabled in your account
- [ ] No rate limit errors
- [ ] Segments have valid text content

---

## 📊 SUCCESS CRITERIA

✅ PDF uploads to storage
✅ Extraction completes without errors
✅ Knowledge graph generated
✅ Script generated with chapters
✅ Audio generated for all segments
✅ Podcast saved to database
✅ Player loads and plays audio
✅ Realtime Q&A works with voice

---

## 🐛 KNOWN ISSUES TO FIX

1. **PDF Extraction timeout** - Large PDFs (>50 pages) may timeout
   - Solution: Process in chunks or increase maxDuration

2. **Audio generation slow** - Many segments takes time
   - Solution: Parallel generation or use faster TTS

3. **Realtime API requires browser API key** - Security concern
   - Solution: Proxy WebSocket through backend

4. **Storage bucket needs manual setup** - Can't create via SQL
   - Solution: Document clearly in STORAGE_SETUP.md

---

## 🎯 NEXT STEPS AFTER SUCCESSFUL TEST

1. [ ] Optimize PDF extraction (parallel pages)
2. [ ] Add progress updates during generation
3. [ ] Implement audio streaming instead of full generation
4. [ ] Add error recovery (resume failed generation)
5. [ ] Add podcast list page functionality
6. [ ] Implement semantic search
7. [ ] Add analytics tracking
