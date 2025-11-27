# Studyz - Complete Features Documentation

## Overview

Studyz is an AI-powered study assistant that transforms how you learn from documents. Upload your study materials, and interact with an AI that can literally "see" and understand every page of your documents.

## Core Features

### 1. Authentication & User Management

**What it does:**
- Secure user registration and login
- Email-based authentication via Supabase
- Session management across devices
- Protected routes and data isolation

**How to use:**
- Register with email and password
- Log in to access your personalized dashboard
- Your data is private and secured with Row Level Security (RLS)

### 2. Dashboard

**What it does:**
- Overview of your study progress
- Quick statistics (lessons count, documents count)
- Quick actions to navigate to lessons

**Features:**
- Real-time stats
- Clean, modern interface
- Quick navigation

### 3. Lessons Management

**Create Lessons:**
- Organize documents into themed lessons
- Name your lessons (e.g., "Biology Chapter 3", "History Final Review")
- Add multiple documents to each lesson

**View Lessons:**
- Card-based layout for easy browsing
- See document counts at a glance
- View creation dates
- Click to open and manage

**Edit Lessons:**
- Add more documents anytime
- Remove documents
- Update lesson names (future feature)

### 4. Document Upload & Processing

**Supported Formats:**
- ✅ PDF (fully implemented)
- 🚧 PPTX/PPT (placeholder - needs implementation)
- 🚧 DOCX/DOC (placeholder - needs implementation)

**Upload Process:**
1. Click "New Lesson" or "Upload Documents"
2. Select one or multiple files
3. Files are uploaded to secure cloud storage
4. Backend automatically processes documents

**Document Processing:**
- Each page is converted to a high-quality PNG image
- Images are stored separately for AI access
- Original documents are preserved
- Processing happens asynchronously

**Why convert to images?**
- Allows AI to "see" exactly what you see
- Better understanding of diagrams, charts, formulas
- Preserves formatting and visual elements
- Works with GPT-4 Vision API

### 5. Lesson Detail View

**Features:**
- View all documents in a lesson
- Upload additional documents
- Select documents for study session
- Beautiful card layout with metadata

**Document Selection:**
- Click cards to select/deselect
- Visual feedback (highlighted border, checkmark)
- Select multiple documents
- Start study session with selected documents

### 6. Study Session Interface

**Split-Screen Layout:**

**Left Side - Document Viewer:**
- High-quality page display
- Page navigation (previous/next)
- Document navigation (when multiple selected)
- Current page indicator
- Zoom and pan (future feature)

**Right Side - AI Assistant:**
- Toggle between Chat and Voice modes
- Context-aware assistance
- Knows what page you're viewing

### 7. Chat Assistant (Studyz Guy)

**Capabilities:**
- Sees the current page image
- Answers questions about page content
- Explains concepts and formulas
- Provides examples and clarifications
- References specific elements from the page

**How it works:**
1. You type a question
2. AI receives your question + page image
3. GPT-4 Vision analyzes the page
4. Returns contextual, accurate answer

**Example questions:**
- "What is the main concept on this page?"
- "Can you explain this diagram?"
- "What does this formula mean?"
- "Summarize the key points here"
- "How does this relate to the previous page?"

**Features:**
- Conversation history (remembers context)
- Real-time responses
- Beautiful chat interface
- Timestamps for each message
- User-friendly error handling

### 8. Voice Assistant (Studyz Guy - Voice Mode)

**Status:** UI implemented, requires backend setup

**Planned Capabilities:**
- Real-time voice conversation
- Speak your questions naturally
- Get audio responses
- Hands-free studying
- Uses OpenAI Realtime API

**Controls:**
- Mute/unmute microphone
- Mute/unmute speaker
- Start/end session
- Live transcript

**Implementation Requirements:**
- WebSocket server setup
- OpenAI Realtime API integration
- Audio streaming handling
- See SETUP.md for details

## Technical Architecture

### Frontend Stack
- **Framework:** Next.js 14 (React)
- **Styling:** TailwindCSS
- **Icons:** React Icons
- **Language:** TypeScript

### Backend Stack
- **Database:** PostgreSQL (via Supabase)
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage
- **API Routes:** Next.js API Routes
- **AI:** OpenAI GPT-4 Vision

### Database Schema

**lessons table:**
- id, user_id, name, created_at, updated_at
- Stores lesson information

**documents table:**
- id, lesson_id, name, file_path, file_type, page_count, created_at
- Stores document metadata

**document_pages table:**
- id, document_id, page_number, image_path, created_at
- Stores page-by-page image references

### Storage Buckets

**documents bucket:**
- Stores original uploaded files
- Private access with RLS policies

**document-pages bucket:**
- Stores processed page images
- Private access with RLS policies

### Security

**Row Level Security (RLS):**
- Users can only access their own data
- Database-level security
- Prevents unauthorized access

**Authentication:**
- JWT-based sessions
- Secure password hashing
- Email verification (optional)

**API Security:**
- Service role key kept server-side only
- Environment variables for secrets
- Input validation and sanitization

## User Flow

### Complete Study Session Flow

1. **Sign Up / Login**
   → Create account or log in

2. **Dashboard**
   → View your stats and quick actions

3. **Create Lesson**
   → Click "New Lesson"
   → Name it and optionally upload documents

4. **Upload Documents**
   → Add PDFs to your lesson
   → Wait for processing (automatic)

5. **View Lesson**
   → See all documents
   → Select ones to study

6. **Start Study Session**
   → Click "Study Lesson"
   → Split screen view opens

7. **Navigate Pages**
   → Use arrow buttons
   → View page by page

8. **Ask Questions**
   → Switch to Chat mode
   → Type questions about current page
   → Get AI-powered answers

9. **Continue Learning**
   → Move through pages
   → Ask follow-up questions
   → Switch documents as needed

## Best Practices

### For Best Results:

**Document Preparation:**
- Use clear, well-formatted documents
- Ensure text is readable
- Include diagrams and visuals
- Break long documents into chapters

**Asking Questions:**
- Be specific about what you want to know
- Reference elements on the page
- Ask follow-up questions for clarity
- Request examples when needed

**Study Strategy:**
- Review pages systematically
- Use AI to clarify confusing concepts
- Take notes separately
- Review AI explanations multiple times

## Performance Considerations

### Document Processing Time
- **PDF (10 pages):** ~10-30 seconds
- **PDF (50 pages):** ~1-3 minutes
- **PDF (100+ pages):** ~3-6 minutes

### API Costs (Approximate)
- **Chat per message:** ~$0.01-0.05
- **Voice (when implemented):** ~$0.10-0.30/minute

### Storage Limits
- **Supabase Free Tier:** 500 MB
- **PDF file sizes:** Typically 1-20 MB
- **Page images:** ~200-500 KB per page

## Future Enhancements

### Planned Features

1. **Enhanced Document Support**
   - PPTX processing
   - DOCX processing
   - Image files
   - Web pages

2. **Study Tools**
   - Flashcard generation from pages
   - Quiz creation
   - Summary generation
   - Key concepts extraction

3. **Annotations**
   - Highlight text on pages
   - Add notes to specific pages
   - Bookmark important pages
   - Draw on pages

4. **Progress Tracking**
   - Study time tracking
   - Pages viewed
   - Questions asked
   - Learning progress

5. **Collaboration**
   - Share lessons with others
   - Group study sessions
   - Discussion forums
   - Teacher/student mode

6. **Advanced AI Features**
   - Multi-page context
   - Cross-document connections
   - Concept mapping
   - Personalized learning paths

7. **Mobile App**
   - iOS app
   - Android app
   - Offline mode
   - Sync across devices

## Limitations

### Current Limitations

1. **Document Types:**
   - Only PDFs fully supported
   - PPTX/DOCX need additional implementation

2. **Voice Assistant:**
   - UI ready, backend needs setup
   - Requires WebSocket server
   - Needs OpenAI Realtime API access

3. **File Size:**
   - Limited by Supabase free tier (500 MB total)
   - Large PDFs take longer to process
   - Page image generation is memory-intensive

4. **AI Context:**
   - Only sees current page
   - No cross-page analysis yet
   - Limited conversation history

5. **Browser Support:**
   - Best on Chrome/Edge/Safari
   - Some features may not work on older browsers

## Tips & Tricks

### Maximize Your Learning

1. **Organize Well:**
   - Create separate lessons for different subjects
   - Use clear, descriptive names
   - Group related documents together

2. **Ask Better Questions:**
   - "Explain this diagram step by step"
   - "What's the relationship between X and Y?"
   - "Can you give me a real-world example?"
   - "What are the key takeaways?"

3. **Use Progressively:**
   - First read the page yourself
   - Then ask AI for clarification
   - Request deeper explanations as needed
   - Ask for connections to other concepts

4. **Review Actively:**
   - Don't just read AI responses
   - Try to explain concepts back
   - Ask follow-up questions
   - Test your understanding

## Support & Troubleshooting

### Common Issues

**Issue:** Pages not loading
- **Solution:** Wait for document processing to complete
- **Solution:** Refresh the page
- **Solution:** Check browser console for errors

**Issue:** AI not responding
- **Solution:** Check OpenAI API key is set
- **Solution:** Verify you have API credits
- **Solution:** Check network connection

**Issue:** Upload failing
- **Solution:** Check file size and type
- **Solution:** Verify Supabase storage is set up
- **Solution:** Check storage bucket policies

For more help, see `SETUP.md` and `QUICK_START.md`.

