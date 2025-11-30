# Interactive Lessons - Simplified Flow

## Overview

The interactive lessons feature allows users to upload a PDF as a lesson and interact with it through an AI assistant that can see exactly what the user is seeing.

## Flow

### 1. Upload Phase

**User Actions:**
- User creates a new interactive lesson
- User uploads a PDF document
- System automatically converts PDF to individual page images

**Technical Steps:**
1. User uploads PDF via `/interactive-lessons/new`
2. PDF is stored in `interactive-lessons` bucket
3. Document record is created in `interactive_lesson_documents` table
4. API endpoint `/api/interactive-lessons/[id]/convert-pdf` is called
5. PDF is converted to PNG images (one per page) using `pdf-to-png-converter`
6. Images are stored in `interactive-lesson-pages` bucket
7. Image records are created in `interactive_lesson_page_images` table
8. User is redirected to the reader page

### 2. Reader Phase

**User Experience:**
- Left side: PDF pages displayed as images (navigable with prev/next)
- Right side: AI chat assistant
- User can ask questions about the current page
- AI sees the exact same page image the user is viewing

**Technical Details:**

#### Page Navigation
- Component: `InteractiveLessonReader`
- Images are fetched via `/api/interactive-lessons/[id]/page-image/[pageNum]`
- Returns signed URL for the page image
- Image is also converted to base64 for AI context

#### AI Chat
- Endpoint: `/api/interactive-lessons/[id]/chat`
- Accepts: `{ message, pageNumber, pageImageBase64 }`
- Uses OpenAI GPT-4 Vision API
- AI receives the page image in its context
- AI can reference specific elements visible on the page

## Database Schema

### Key Tables

**interactive_lessons**
- Main lesson entity
- Fields: id, user_id, name, subject, level, language, status

**interactive_lesson_documents**
- Uploaded PDF documents
- Fields: id, interactive_lesson_id, file_path, file_type, page_count, category

**interactive_lesson_page_images**
- Individual page images extracted from PDFs
- Fields: id, document_id, page_number, image_path, width, height

### Storage Buckets

**interactive-lessons**
- Original PDF files
- Path structure: `{user_id}/{lesson_id}/lesson/{timestamp}-{filename}`

**interactive-lesson-pages**
- Extracted page images
- Path structure: `{document_id}/page-{pageNumber}.png`

## API Endpoints

### PDF Conversion
`POST /api/interactive-lessons/[id]/convert-pdf`
- Converts uploaded PDF to individual page images
- Stores images in storage bucket
- Creates page image records in database

### Page Image
`GET /api/interactive-lessons/[id]/page-image/[pageNum]`
- Returns signed URL for a specific page image
- Validates user ownership of the lesson

### Chat
`POST /api/interactive-lessons/[id]/chat`
- Sends message + page image to OpenAI GPT-4 Vision
- Returns AI response based on page content
- AI has full context of what user is viewing

## Components

### InteractiveLessonReader
Main reader component with:
- PDF page viewer with navigation
- AI chat sidebar
- Real-time page image loading
- Message history

### Page Routes
- `/interactive-lessons/new` - Create new lesson & upload PDF
- `/interactive-lessons/[id]` - Lesson details page
- `/interactive-lessons/[id]/reader` - Main reader interface

## Key Features

1. **Page-by-Page Navigation**
   - Users can navigate through PDF pages one at a time
   - Each page is displayed as a high-quality image

2. **Context-Aware AI**
   - AI sees the exact page the user is viewing
   - Can answer questions about specific elements on the page
   - Responses are based on visual content

3. **Simple Upload Flow**
   - Upload PDF → Automatic conversion → Start reading
   - No complex processing or waiting times

4. **Clean UI**
   - Split view: Document on left, AI on right
   - Minimal distractions
   - Focus on learning

## Future Enhancements

Potential improvements:
- [ ] Support for highlighting text on pages
- [ ] Bookmark favorite pages
- [ ] Save chat history per page
- [ ] Support for annotations
- [ ] Multi-document lessons
- [ ] Progress tracking

