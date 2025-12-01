# MCQ Feature Documentation

## Overview
The MCQ (Multiple Choice Questions) feature allows users to upload PDF documents containing MCQ questions. The system automatically:
1. Converts each PDF page to an image
2. Sends each image sequentially to GPT-4o-mini for analysis
3. Extracts MCQs with options, correct answers, and explanations
4. Stores everything in Supabase
5. Displays an interactive quiz interface

## Architecture

### Database Schema

#### mcq_sets
Stores metadata about each MCQ set:
- `id`: UUID primary key
- `user_id`: UUID foreign key to auth.users
- `name`: Optional name for the set
- `source_pdf_name`: Original PDF filename
- `document_url`: Signed URL to stored PDF
- `total_pages`: Number of pages processed
- `total_questions`: Total MCQs extracted
- `created_at`: Timestamp

#### mcq_pages
Tracks each page processed:
- `id`: UUID primary key
- `mcq_set_id`: Foreign key to mcq_sets
- `page_number`: Page number (1-indexed)
- `image_url`: Public URL to page image
- `extracted_question_count`: Number of questions found on this page

#### mcq_questions
Stores individual MCQ questions:
- `id`: UUID primary key
- `mcq_set_id`: Foreign key to mcq_sets
- `page_number`: Source page number
- `question`: Question text
- `options`: JSONB array of `{label: string, text: string}`
- `correct_option`: Correct answer label (e.g., "A", "B")
- `explanation`: Optional explanation text

### Storage Buckets

#### mcq-documents (Private)
- Stores original PDF files
- Access via signed URLs only
- Path: `{userId}/{setId}/document.pdf`

#### mcq-pages (Public)
- Stores page images (PNG format)
- Public read access for OpenAI and app
- Path: `{userId}/{setId}/page-{pageNumber}.png`

### API Endpoints

#### POST /api/mcq
Creates a new MCQ set from uploaded PDF.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Headers: `Authorization: Bearer {token}`
- Body:
  - `file`: PDF file (required)
  - `name`: Set name (optional)

**Response:**
```json
{
  "set": {
    "id": "uuid",
    "name": "Set Name",
    "total_pages": 5,
    "total_questions": 25
  },
  "questions": [...],
  "message": "Successfully extracted 25 questions from 5 pages"
}
```

**Limits:**
- Max file size: 50MB
- Max pages: 40
- Timeout: 300 seconds

**Processing Flow:**
1. Validate auth and file
2. Convert PDF to images (1.5x scale)
3. Create mcq_sets record
4. Upload PDF to storage
5. For each page sequentially:
   - Upload page image to storage
   - Get public URL
   - Create mcq_pages record
   - Call GPT-4o-mini to extract MCQs
   - Insert questions into mcq_questions
6. Update total_questions count
7. Return results

#### GET /api/mcq/[id]
Retrieves an existing MCQ set with all questions.

**Request:**
- Method: `GET`
- Headers: `Authorization: Bearer {token}`

**Response:**
```json
{
  "set": {...},
  "pages": [...],
  "questions": [...]
}
```

### OpenAI Integration

The `extractMcqsFromImage()` function in `lib/openai.ts`:
- Uses GPT-4o-mini model with vision capability
- Sends high-detail image analysis request
- Uses JSON mode for structured output
- Temperature: 0.3 (more deterministic)
- Max tokens: 4096

**Prompt Strategy:**
- Clear instructions to extract ALL MCQs
- Explicit JSON schema with examples
- Handles cases with no questions gracefully

### UI Components

#### /mcq/new (Upload Page)
- File upload with drag-and-drop
- Optional name input (auto-fills from filename)
- Processing status with spinner
- Immediate display of results via MCQViewer

#### /mcq/[id] (Persisted View)
- Loads existing MCQ set from API
- Shows set metadata in header
- Renders MCQViewer with stored questions

#### MCQViewer Component
Interactive quiz interface with:
- Progress bar showing completion
- One question at a time
- Multiple choice options (A, B, C, D, etc.)
- "Check Answer" button
- Visual feedback (green for correct, red for incorrect)
- Optional explanation display
- "Next Question" button
- "Previous Question" navigation
- Quiz completion indicator

#### Dashboard Integration
- Sidebar link: "New MCQ" with checkbox icon
- Quick action card: "New MCQ Set" with purple styling
- Positioned between lesson creation and view all lessons

## Security

### Row Level Security (RLS)
All tables have policies ensuring:
- Users can only access their own MCQ sets
- Child records (pages, questions) inherit parent ownership
- Policies match the lessons pattern

### Authentication
- All API routes require Bearer token authentication
- User verification via Supabase auth
- Service role client used server-side for bypassing client RLS

## Performance Considerations

### Image Processing
- PDF conversion at 1.5x scale (balance quality/size)
- Estimated ~500KB per page
- Sequential processing to manage memory

### OpenAI Rate Limits
- Sequential API calls (one page at a time)
- Prevents parallel request overload
- Better error handling per page

### Timeouts
- API route: 300 seconds (5 minutes)
- Suitable for 10-30 page documents
- Can be adjusted via `maxDuration` export

## Usage Examples

### Creating an MCQ Set
```typescript
const formData = new FormData()
formData.append('file', pdfFile)
formData.append('name', 'Biology Quiz')

const response = await fetch('/api/mcq', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
})

const data = await response.json()
// data.set.id, data.questions
```

### Loading an MCQ Set
```typescript
const response = await fetch(`/api/mcq/${setId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

const { set, pages, questions } = await response.json()
```

## Future Enhancements

Potential improvements:
1. Server-Sent Events (SSE) for page-by-page progress updates
2. PDF preview before processing
3. Edit extracted questions
4. Score tracking and statistics
5. Export to various formats
6. Batch processing multiple PDFs
7. Custom extraction rules/templates
8. Integration with spaced repetition systems

## Troubleshooting

### PDF Conversion Fails
- Ensure PDF is valid and not corrupted
- Check if PDF has proper fonts embedded
- Try reducing file size or page count

### No Questions Extracted
- Verify PDF contains actual MCQ questions
- Check if questions follow standard format (A, B, C, D)
- Review page images to ensure they're readable

### Timeout Errors
- Reduce page count (stay under 40 pages)
- Check network connectivity to OpenAI
- Monitor API rate limits

### Storage Errors
- Verify Supabase storage buckets exist:
  - `mcq-documents` (private)
  - `mcq-pages` (public)
- Check bucket policies allow uploads
- Verify storage quota not exceeded

## Database Setup

To set up the MCQ feature in your Supabase instance:

1. Run migration `004_mcq.sql` to create tables and RLS policies
2. Create storage buckets (via Supabase Dashboard):
   - Bucket: `mcq-documents`, Public: false
   - Bucket: `mcq-pages`, Public: true
3. Configure storage policies to allow authenticated uploads

## Environment Variables

No additional environment variables needed. Uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

