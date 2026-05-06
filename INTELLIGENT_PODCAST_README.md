# 🎙️ Intelligent Interactive Podcast System

## 🚀 Overview

This is a **complete intelligent podcast generation system** that transforms PDFs and documents into engaging, multi-voice interactive podcasts with real-time Q&A capabilities.

### ✨ Key Features

#### 1. **Intelligent Content Analysis** 🧠
- **Knowledge Graph** - Automatically extracts concepts and relationships
- **Semantic embeddings** - Enables instant concept search
- **Difficulty detection** - Identifies complex vs. simple concepts
- **Auto language detection** - Works in multiple languages

#### 2. **Multi-Voice Generation** 🎤
- **3 distinct speakers**: Host, Expert, Simplifier
- **Natural conversations** - Not robotic reading
- **Smart voice rotation** - Contextual speaker selection
- **Multiple TTS providers**:
  - OpenAI TTS (good quality, fast)
  - ElevenLabs (premium quality)
  - PlayHT (high quality)

#### 3. **Real-Time Interactivity** ⚡
- **OpenAI Realtime API** - Sub-second response latency
- **Voice conversations** - Ask questions naturally
- **Multi-turn dialogue** - Follow-up questions supported
- **Context-aware** - Knows exactly where you are in the podcast

#### 4. **Intelligent Features** 🎯
- **Chapter navigation** - Jump to any topic
- **Question breakpoints** - Natural pause points
- **Predicted Q&A** - Pre-answered common questions
- **Semantic search** - Find concepts instantly
- **Progress tracking** - Resume where you left off
- **Analytics** - Track engagement and learning

---

## 📁 Project Structure

```
/lib/intelligent-podcast/
├── extractor.ts              # Content extraction & Knowledge Graph
├── script-generator.ts       # Intelligent script generation
├── audio-generator.ts        # Multi-voice TTS generation
└── realtime-client.ts        # WebSocket client for Realtime API

/app/api/intelligent-podcast/
├── generate/route.ts         # Main generation endpoint
├── [id]/route.ts            # Get/delete podcast
├── [id]/search/route.ts     # Semantic search
├── [id]/realtime/route.ts   # Realtime API context
└── [id]/session/route.ts    # Session management

/components/intelligent-podcast/
├── PodcastPlayer.tsx         # Main podcast player
└── RealtimeInteraction.tsx   # Voice Q&A interface

/app/intelligent-podcast/
├── page.tsx                  # Podcasts list
├── new/page.tsx             # Creation form
└── [id]/page.tsx            # Player page

/types/
└── intelligent-podcast.ts    # TypeScript definitions

/supabase/migrations/
└── 017_intelligent_podcasts.sql  # Database schema
```

---

## 🎯 How It Works

### **Phase 1: Podcast Generation** (One-time, 2-5 minutes)

```
PDFs/Documents
    ↓
1. EXTRACTION & ANALYSIS
   - Parse documents
   - Build Knowledge Graph
   - Extract concepts & relationships
   - Generate embeddings
    ↓
2. SCRIPT GENERATION
   - Create chapters structure
   - Generate conversational segments
   - Identify question breakpoints
   - Predict common questions
    ↓
3. AUDIO GENERATION
   - Select voices per speaker
   - Generate audio for each segment
   - Pre-generate Q&A audio
    ↓
4. SAVE TO DATABASE
   - Store podcast with metadata
   - Create analytics entry
```

### **Phase 2: Interactive Listening** (Real-time)

```
User plays podcast
    ↓
Synchronized transcript display
Concepts highlighted
Chapter markers visible
    ↓
[User clicks "Ask Question" at breakpoint]
    ↓
1. PAUSE PODCAST
2. CONNECT TO REALTIME API
   - WebSocket established (~500ms)
   - Context loaded (recent segments, concepts)
    ↓
3. VOICE CONVERSATION
   - User speaks (microphone)
   - AI responds vocally (<1s latency)
   - Multi-turn supported
    ↓
4. RESUME PODCAST
   - Conversation saved to database
   - Playback continues
```

---

## 🔧 Setup Instructions

### 1. Install Dependencies

No additional dependencies needed! The project already has:
- `openai` - For GPT-4 and Realtime API
- `replicate` - For TTS (MiniMax)
- All other required packages

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Required
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_OPENAI_API_KEY=sk-...  # For Realtime API in browser

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional (for premium voices)
ELEVENLABS_API_KEY=...
PLAYHT_USER_ID=...
PLAYHT_API_KEY=...
```

### 3. Database Migration

Run the new migration:

```bash
# If using Supabase CLI
supabase migration up

# Or manually execute:
# supabase/migrations/017_intelligent_podcasts.sql
```

### 4. Start Development Server

```bash
npm run dev
```

---

## 🎮 Usage

### Creating a Podcast

1. Go to `/intelligent-podcast/new`
2. Add document IDs (or upload PDFs)
3. Configure:
   - Duration (10-60 minutes)
   - Language (auto-detect or specific)
   - Style (educational, conversational, technical, storytelling)
   - Voice provider (OpenAI, ElevenLabs, PlayHT)
4. Click "Generate Intelligent Podcast"
5. Wait 2-5 minutes for generation

### Listening to a Podcast

1. Go to `/intelligent-podcast/[id]`
2. Use player controls:
   - Play/Pause
   - Skip segments
   - Change playback speed
   - Navigate chapters
   - View synchronized transcript
3. At natural breakpoints (highlighted), click **"Ask Question"**
4. Speak your question
5. Get instant voice response
6. Continue conversation or resume podcast

### Interactive Features

**Semantic Search:**
- Type a concept or question
- Get instant jumps to relevant timestamps

**Predicted Questions:**
- Common questions pre-answered
- Instant audio responses available

**Progress Tracking:**
- Resume where you left off
- See completed chapters
- View your questions history

---

## 📊 Database Schema

### `intelligent_podcasts`
Main podcast data with knowledge graph, chapters, segments, predicted Q&A

### `podcast_sessions`
User playback state, progress, bookmarks

### `podcast_interruptions`
Questions asked via Realtime API with context

### `podcast_analytics`
Engagement metrics and popular segments

---

## 🆚 Comparison with NotebookLM & Podcastfy

| Feature | NotebookLM | Podcastfy | **Our Solution** |
|---------|-----------|-----------|-----------------|
| **Multi-voice** | ✅ (2 voices) | ✅ (2 voices) | ✅ **3+ voices** |
| **Quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Interactive** | ❌ No | ❌ No | ✅ **Voice Q&A** |
| **Latency** | N/A | 5-20s (TTS) | **<1s (Realtime)** |
| **Knowledge Graph** | ❌ No | ❌ No | ✅ **Full graph** |
| **Chapter Navigation** | ❌ Basic | ❌ Basic | ✅ **Advanced** |
| **Semantic Search** | ❌ No | ❌ No | ✅ **Yes** |
| **Predicted Q&A** | ❌ No | ❌ No | ✅ **Yes** |
| **Open Source** | ❌ No | ✅ Yes | ✅ **Yes** |
| **Customizable** | ❌ No | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🚀 Advanced Features

### Voice Profiles

Define custom voice profiles for each speaker:

```typescript
const voiceProfiles: VoiceProfile[] = [
  {
    id: 'host-voice',
    role: 'host',
    name: 'Sophie',
    provider: 'elevenlabs',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    description: 'Curious host who guides conversations',
  },
  // ... more voices
]
```

### Semantic Search

Find any concept instantly:

```typescript
const results = await fetch(`/api/intelligent-podcast/${id}/search`, {
  method: 'POST',
  body: JSON.stringify({ query: 'photosynthesis' })
})
// Returns segments where concept is discussed
```

### Analytics

Track engagement:
- Most paused segments (difficult concepts)
- Most asked questions
- Average completion rate
- Popular chapters

---

## 💡 Tips & Best Practices

### For Best Quality:

1. **Use ElevenLabs** for premium voice quality
2. **Set duration to 30-45 min** for optimal depth
3. **Use "conversational" style** for engagement
4. **Enable all features** (chapters, Q&A, search)

### For Fastest Generation:

1. **Use OpenAI TTS** (faster than ElevenLabs)
2. **Set duration to 15-20 min**
3. **Fewer documents** (1-2 PDFs)

### For Best Learning Experience:

1. **Enable transcript** for visual learners
2. **Use question breakpoints** to consolidate understanding
3. **Try semantic search** to revisit concepts
4. **Review predicted Q&A** before listening

---

## 🐛 Troubleshooting

### "Failed to connect to Realtime API"
- Check `NEXT_PUBLIC_OPENAI_API_KEY` is set
- Ensure browser has microphone permissions
- Check console for WebSocket errors

### "Audio generation failed"
- Check TTS provider API keys
- Verify rate limits not exceeded
- Try different voice provider

### "Knowledge graph empty"
- Check document content is readable
- Ensure sufficient text content (>500 words)
- Verify language is supported

---

## 🎓 Example Use Cases

### Education
- Transform lecture notes into podcasts
- Create study materials from textbooks
- Interactive learning for complex topics

### Content Creation
- Convert blog posts to audio format
- Create podcast series from articles
- Repurpose written content for audio audience

### Research
- Convert research papers to accessible format
- Create audio summaries of studies
- Interactive Q&A for complex findings

### Corporate Training
- Transform training docs into engaging audio
- Interactive onboarding materials
- Continuing education with Q&A support

---

## 🔮 Future Enhancements

- [ ] PDF upload with OCR
- [ ] Multi-document synthesis
- [ ] Background music generation
- [ ] Voice cloning for consistency
- [ ] Mobile app with offline support
- [ ] Social features (comments, sharing)
- [ ] Quiz generation from content
- [ ] Spaced repetition integration

---

## 📄 License

Part of the Studyz project - see main LICENSE file.

---

## 🙏 Credits

Built with:
- OpenAI GPT-4 & Realtime API
- ElevenLabs / PlayHT / OpenAI TTS
- Supabase
- Next.js 14
- TypeScript

Inspired by:
- Google NotebookLM
- Podcastfy (souzatharsis)

---

**Enjoy creating intelligent interactive podcasts! 🎙️✨**
