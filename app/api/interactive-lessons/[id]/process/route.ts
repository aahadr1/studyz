import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for processing

// Timeout wrapper for operations that might hang
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => {
      console.log(`Operation timed out after ${timeoutMs}ms, using fallback`)
      resolve(fallback)
    }, timeoutMs))
  ])
}

// Flag to track if MuPDF works on this environment
let mupdfWorks: boolean | null = null

// Lazy initialization of admin client
let _supabaseAdmin: any = null
function getSupabaseAdmin(): any {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// Processing steps for progress tracking
const PROCESSING_STEPS = {
  INITIALIZING: 'initializing',
  CONVERTING_PAGES: 'converting_pages',
  TRANSCRIBING: 'transcribing',
  RECONSTRUCTING: 'reconstructing',
  CHECKPOINTING: 'checkpointing',
  GENERATING_MCQ: 'generating_mcq',
  ANALYZING_ELEMENTS: 'analyzing_elements',
  FINALIZING: 'finalizing'
}

// Update processing progress
async function updateProgress(
  lessonId: string, 
  step: string, 
  progress: number, 
  total: number, 
  message: string
) {
  await getSupabaseAdmin()
    .from('interactive_lessons')
    .update({
      processing_step: step,
      processing_progress: progress,
      processing_total: total,
      processing_message: message
    })
    .eq('id', lessonId)
}

// Lazy initialization of OpenAI client
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return _openai
}

// Helper to create authenticated Supabase client
async function createAuthClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}

interface PageTranscription {
  text: string
  elements: Array<{
    type: 'term' | 'concept' | 'formula' | 'diagram' | 'definition'
    description: string
    position?: string
  }>
  hasVisualContent: boolean
}

interface Checkpoint {
  title: string
  type: 'topic' | 'subtopic'
  start_page: number
  end_page: number
  summary: string
  parent_index?: number
}

interface Question {
  question: string
  choices: string[]
  correct_index: number
  explanation: string
}

interface PageElement {
  element_text: string
  element_type: 'term' | 'concept' | 'formula' | 'diagram' | 'definition'
  explanation: string
  position_hint?: string
}

// Convert Node.js Buffer to Uint8Array for MuPDF
function bufferToUint8Array(buffer: Buffer): Uint8Array {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Uint8Array(arrayBuffer)
}

// Convert PDF page to image using MuPDF (with timeout)
async function convertPdfPageToImage(pdfBuffer: Buffer, pageNumber: number): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  // If MuPDF already failed, don't try again
  if (mupdfWorks === false) {
    console.log(`Skipping MuPDF for page ${pageNumber} (previously failed)`)
    return null
  }

  const convertWithMupdf = async (): Promise<{ buffer: Buffer; width: number; height: number } | null> => {
    try {
      console.log(`Converting page ${pageNumber} with MuPDF...`)
      
      // Dynamic import for mupdf
      const mupdf = await import('mupdf')
      
      // Convert to Uint8Array for MuPDF
      const uint8Array = bufferToUint8Array(pdfBuffer)
      
      // Open the PDF document
      const doc = mupdf.Document.openDocument(uint8Array, 'application/pdf')
      
      // Get the page (0-indexed in mupdf)
      const page = doc.loadPage(pageNumber - 1)
      
      // Get page bounds
      const bounds = page.getBounds()
      const width = Math.round(bounds[2] - bounds[0])
      const height = Math.round(bounds[3] - bounds[1])
      
      // Create a pixmap at 1.5x resolution (lower than before for speed)
      const scale = 1.5
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false, // no alpha
        true   // annots
      )
      
      // Convert to PNG buffer
      const pngBuffer = pixmap.asPNG()
      
      mupdfWorks = true
      console.log(`Page ${pageNumber} converted successfully`)
      
      return {
        buffer: Buffer.from(pngBuffer),
        width: Math.round(width * scale),
        height: Math.round(height * scale)
      }
    } catch (error) {
      console.error(`MuPDF error for page ${pageNumber}:`, error)
      mupdfWorks = false
      return null
    }
  }

  // Timeout after 30 seconds per page
  return withTimeout(convertWithMupdf(), 30000, null)
}

// Get page count from PDF - robust multi-method approach
async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  // Method 1: Try MuPDF
  try {
    const mupdf = await import('mupdf')
    const uint8Array = bufferToUint8Array(pdfBuffer)
    const doc = mupdf.Document.openDocument(uint8Array, 'application/pdf')
    const count = doc.countPages()
    if (count > 0) {
      console.log(`MuPDF: ${count} pages`)
      return count
    }
  } catch (error) {
    console.error('MuPDF page count failed:', error)
  }

  // Method 2: Try pdf-parse
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(pdfBuffer)
    const count = data.numpages || 0
    if (count > 0) {
      console.log(`pdf-parse: ${count} pages`)
      return count
    }
  } catch (error) {
    console.error('pdf-parse page count failed:', error)
  }

  // Method 3: Manual PDF parsing
  try {
    const text = pdfBuffer.toString('binary')
    const countMatch = text.match(/\/Count\s+(\d+)/g)
    if (countMatch) {
      const counts = countMatch.map(m => parseInt(m.replace('/Count', '').trim()))
      const maxCount = Math.max(...counts)
      if (maxCount > 0) {
        console.log(`Manual parse: ${maxCount} pages`)
        return maxCount
      }
    }
  } catch (error) {
    console.error('Manual parse failed:', error)
  }

  console.error('All page count methods failed')
  return 1 // Fallback to 1 so processing can continue
}

// Transcribe a page image using GPT-4o vision
async function transcribePageWithVision(imageBase64: string, pageNumber: number, language: string): Promise<PageTranscription> {
  const prompt = `You are analyzing page ${pageNumber} of a lesson document. The document is in ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}.

Transcribe and analyze this page completely:

1. **Text Content**: Extract ALL text exactly as it appears, maintaining structure (headings, paragraphs, lists, etc.)

2. **Visual Elements**: For any diagrams, figures, tables, charts, or images:
   - Describe what they show in detail
   - Explain the educational content they convey
   - Note any labels, arrows, or annotations

3. **Key Elements**: Identify important educational elements:
   - Technical terms and their context
   - Key concepts being taught
   - Formulas or equations
   - Definitions

Output as JSON only (no markdown):
{
  "text": "Complete transcription of all text content...",
  "elements": [
    {"type": "diagram", "description": "Description of visual element", "position": "center of page"},
    {"type": "term", "description": "Important term found", "position": "paragraph 2"},
    {"type": "formula", "description": "Mathematical formula", "position": "bottom"}
  ],
  "hasVisualContent": true
}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.2,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      return JSON.parse(cleaned)
    } catch {
      // If JSON parsing fails, return basic structure
      return {
        text: content,
        elements: [],
        hasVisualContent: false
      }
    }
  } catch (error) {
    console.error(`Error transcribing page ${pageNumber}:`, error)
    return {
      text: `(Page ${pageNumber} transcription failed)`,
      elements: [],
      hasVisualContent: false
    }
  }
}

// Reconstruct full lesson from page transcriptions
async function reconstructLesson(pageTexts: string[], language: string): Promise<{ fullContent: string; structure: any }> {
  const combinedPages = pageTexts
    .map((text, i) => `=== PAGE ${i + 1} ===\n${text}`)
    .join('\n\n')

  // Truncate if too long
  const maxChars = 100000
  const truncated = combinedPages.length > maxChars 
    ? combinedPages.slice(0, maxChars) + '\n... [content truncated]'
    : combinedPages

  const prompt = `You are reconstructing a complete lesson from page-by-page transcriptions.
Language: ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}

Page transcriptions:
${truncated}

Your task:
1. Combine all pages into a coherent, flowing lesson
2. Keep the ORIGINAL wording and structure as much as possible
3. Where visual elements (diagrams, tables) were described, include those descriptions naturally
4. Maintain educational flow and logical progression
5. Note which pages contain which content

Output as JSON only:
{
  "fullContent": "The complete reconstructed lesson text...",
  "structure": {
    "overview": "Brief overview of the lesson",
    "pageMapping": [
      {"page": 1, "content": "brief description of page 1 content"},
      {"page": 2, "content": "brief description of page 2 content"}
    ]
  }
}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      return JSON.parse(cleaned)
    } catch {
      return {
        fullContent: pageTexts.join('\n\n'),
        structure: { overview: 'Lesson content', pageMapping: [] }
      }
    }
  } catch (error) {
    console.error('Error reconstructing lesson:', error)
    return {
      fullContent: pageTexts.join('\n\n'),
      structure: { overview: 'Lesson content', pageMapping: [] }
    }
  }
}

// Create checkpoints from lesson content
async function createCheckpoints(fullContent: string, totalPages: number, language: string): Promise<Checkpoint[]> {
  const prompt = `You are a teacher creating study checkpoints for a lesson.
Language: ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}
Total pages: ${totalPages}

Lesson content:
${fullContent.slice(0, 50000)}

Create checkpoints that divide this lesson into logical study units:

1. **Topics**: Main subject areas (3-6 typically)
2. **Subtopics**: Smaller concepts within topics (optional, only if topic is large)
3. Each checkpoint should:
   - Cover a coherent concept students should master before moving on
   - Map to specific page ranges
   - Be granular enough for effective quiz testing (not too broad)

Output as JSON array only:
[
  {
    "title": "Checkpoint title",
    "type": "topic",
    "start_page": 1,
    "end_page": 3,
    "summary": "Brief summary of what this checkpoint covers"
  },
  {
    "title": "Subtopic within previous topic",
    "type": "subtopic", 
    "start_page": 2,
    "end_page": 3,
    "summary": "Brief summary...",
    "parent_index": 0
  }
]`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '[]'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      const checkpoints = JSON.parse(cleaned)
      // Validate page ranges
      return checkpoints.map((cp: any) => ({
        ...cp,
        start_page: Math.max(1, Math.min(cp.start_page, totalPages)),
        end_page: Math.max(1, Math.min(cp.end_page, totalPages))
      }))
    } catch {
      // Fallback: create a single checkpoint for entire document
      return [{
        title: 'Complete Lesson',
        type: 'topic' as const,
        start_page: 1,
        end_page: totalPages,
        summary: 'Full lesson content'
      }]
    }
  } catch (error) {
    console.error('Error creating checkpoints:', error)
    return [{
      title: 'Complete Lesson',
      type: 'topic' as const,
      start_page: 1,
      end_page: totalPages,
      summary: 'Full lesson content'
    }]
  }
}

// Generate MCQ questions for a checkpoint
async function generateCheckpointQuestions(
  checkpointTitle: string,
  checkpointSummary: string,
  relevantContent: string,
  language: string,
  questionCount: number = 10
): Promise<Question[]> {
  const prompt = `You are creating quiz questions for a study checkpoint.

Checkpoint: ${checkpointTitle}
Summary: ${checkpointSummary}
Language: ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}

Content to test:
${relevantContent.slice(0, 15000)}

Create ${questionCount} multiple-choice questions that:
1. Test understanding, not just memorization
2. Cover the key concepts of this checkpoint
3. Have exactly 4 choices each
4. Include plausible distractors (wrong but believable answers)
5. Have clear explanations

Output as JSON array only:
[
  {
    "question": "Question text?",
    "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
    "correct_index": 0,
    "explanation": "Why Choice A is correct..."
  }
]`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.5,
    })

    const content = response.choices[0]?.message?.content || '[]'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      return JSON.parse(cleaned)
    } catch {
      return []
    }
  } catch (error) {
    console.error('Error generating questions:', error)
    return []
  }
}

// Analyze page for highlightable elements
async function analyzePageElements(pageText: string, pageNumber: number, language: string): Promise<PageElement[]> {
  const prompt = `Analyze this lesson page and identify key elements a student should understand.
Page ${pageNumber}
Language: ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}

Page content:
${pageText.slice(0, 8000)}

Identify 5-15 key elements:
- **Terms**: Important vocabulary words
- **Concepts**: Key ideas being taught
- **Formulas**: Mathematical or scientific formulas
- **Definitions**: Formal definitions
- **Diagrams**: References to visual elements

For each, provide a brief student-friendly explanation.

Output as JSON array only:
[
  {
    "element_text": "The exact term/phrase as it appears",
    "element_type": "term",
    "explanation": "Brief, clear explanation for students",
    "position_hint": "Optional: where on page"
  }
]`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '[]'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      return JSON.parse(cleaned)
    } catch {
      return []
    }
  } catch (error) {
    console.error(`Error analyzing page ${pageNumber} elements:`, error)
    return []
  }
}

// Parse MCQ from uploaded document
async function parseMcqFromText(text: string): Promise<Question[]> {
  const prompt = `Extract multiple choice questions from this text.

Text:
${text.slice(0, 20000)}

For each question found, extract:
- The question text
- All choices (should be 4 if possible)
- The correct answer index (0-based)
- An explanation if provided, or generate one

Respond with a JSON array only:
[
  {
    "question": "Question text",
    "choices": ["A", "B", "C", "D"],
    "correct_index": 0,
    "explanation": "Why this is correct"
  }
]

If no valid MCQs are found, return an empty array [].`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '[]'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      return JSON.parse(cleaned)
    } catch {
      return []
    }
  } catch (error) {
    console.error('Error parsing MCQ:', error)
    return []
  }
}

// Match uploaded questions to checkpoints
async function matchQuestionsToCheckpoints(
  questions: Question[],
  checkpoints: Array<{ id: string; title: string; summary: string }>,
  language: string
): Promise<Map<string, Question[]>> {
  const result = new Map<string, Question[]>()
  checkpoints.forEach(cp => result.set(cp.id, []))

  if (questions.length === 0 || checkpoints.length === 0) {
    return result
  }

  const checkpointsInfo = checkpoints.map(cp => `ID: ${cp.id}\nTitle: ${cp.title}\nSummary: ${cp.summary}`).join('\n\n')
  const questionsInfo = questions.map((q, i) => `${i}: ${q.question}`).join('\n')

  const prompt = `Match each question to the most relevant checkpoint.

Checkpoints:
${checkpointsInfo}

Questions:
${questionsInfo}

Respond with a JSON object mapping question index to checkpoint ID:
{"0": "checkpoint-id-1", "1": "checkpoint-id-2", ...}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.2,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    try {
      const mapping = JSON.parse(cleaned)
      
      Object.entries(mapping).forEach(([qIndex, checkpointId]) => {
        const idx = parseInt(qIndex)
        if (idx >= 0 && idx < questions.length && result.has(checkpointId as string)) {
          result.get(checkpointId as string)!.push(questions[idx])
        }
      })
    } catch {
      // If matching fails, distribute questions evenly
      questions.forEach((q, i) => {
        const cpIndex = i % checkpoints.length
        const cpId = checkpoints[cpIndex].id
        result.get(cpId)!.push(q)
      })
    }
  } catch {
    // Distribute evenly on error
    questions.forEach((q, i) => {
      const cpIndex = i % checkpoints.length
      const cpId = checkpoints[cpIndex].id
      result.get(cpId)!.push(q)
    })
  }

  return result
}

// Main processing function
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get lesson and verify ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('*, interactive_lesson_documents(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Interactive lesson not found' }, { status: 404 })
    }

    if (lesson.status === 'processing') {
      return NextResponse.json({ error: 'Lesson is already being processed' }, { status: 400 })
    }

    if (lesson.status === 'ready') {
      return NextResponse.json({ error: 'Lesson has already been processed' }, { status: 400 })
    }

    const documents = lesson.interactive_lesson_documents || []
    const lessonDocs = documents.filter((d: any) => d.category === 'lesson')
    const mcqDocs = documents.filter((d: any) => d.category === 'mcq')

    // Determine mode
    const mode = lessonDocs.length > 0 ? 'document_based' : 'mcq_only'

    if (mode === 'mcq_only' && mcqDocs.length === 0) {
      return NextResponse.json(
        { error: 'No documents uploaded. Please upload lesson documents or MCQ files.' },
        { status: 400 }
      )
    }

    // Update status to processing
    await getSupabaseAdmin()
      .from('interactive_lessons')
      .update({ 
        status: 'processing', 
        mode,
        processing_step: PROCESSING_STEPS.INITIALIZING,
        processing_progress: 0,
        processing_total: 100,
        processing_message: 'Initialisation...'
      })
      .eq('id', id)

    try {
      // ===== DOCUMENT-BASED MODE =====
      if (mode === 'document_based') {
        const allPageTexts: string[] = []
        let totalPageCount = 0
        let processedPages = 0

        // Process each lesson document - download first to get accurate page counts
        const documentBuffers: Map<string, { buffer: Buffer; pageCount: number }> = new Map()
        
        await updateProgress(id, PROCESSING_STEPS.CONVERTING_PAGES, 0, lessonDocs.length, 'Analyse des documents...')

        for (let docIdx = 0; docIdx < lessonDocs.length; docIdx++) {
          const doc = lessonDocs[docIdx]
          console.log(`Downloading document: ${doc.name}`)
          
          await updateProgress(
            id, 
            PROCESSING_STEPS.CONVERTING_PAGES, 
            docIdx, 
            lessonDocs.length, 
            `Téléchargement de ${doc.name}...`
          )
          
          // Download file
          const { data: fileData, error: downloadError } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(doc.file_path)

          if (downloadError || !fileData) {
            console.error('Error downloading file:', downloadError)
            continue
          }

          const buffer = Buffer.from(await fileData.arrayBuffer())
          
          // Get page count - this is the crucial step
          const pageCount = await getPdfPageCount(buffer)
          console.log(`Document ${doc.name} has ${pageCount} pages`)
          
          if (pageCount === 0) {
            console.error(`WARNING: Could not detect pages in ${doc.name}`)
          }
          
          // Store buffer and page count for later processing
          documentBuffers.set(doc.id, { buffer, pageCount })
          totalPageCount += pageCount
          
          // Update document page count in DB
          await getSupabaseAdmin()
            .from('interactive_lesson_documents')
            .update({ page_count: pageCount })
            .eq('id', doc.id)
        }

        console.log(`Total pages across all documents: ${totalPageCount}`)

        // If no pages detected at all, throw an error
        if (totalPageCount === 0) {
          throw new Error('Impossible de détecter les pages dans les documents PDF. Veuillez vérifier que les fichiers sont des PDFs valides.')
        }

        // Now process each page
        for (const doc of lessonDocs) {
          const docData = documentBuffers.get(doc.id)
          if (!docData) continue

          const { buffer, pageCount } = docData
          console.log(`Processing document: ${doc.name} (${pageCount} pages)`)

          // First try to extract text using pdf-parse as fallback
          let pdfTextPages: string[] = []
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse')
            const pdfData = await pdfParse(buffer)
            // Split text roughly by page count
            const fullText = pdfData.text || ''
            const avgCharsPerPage = Math.ceil(fullText.length / pageCount)
            for (let i = 0; i < pageCount; i++) {
              const start = i * avgCharsPerPage
              const end = Math.min((i + 1) * avgCharsPerPage, fullText.length)
              pdfTextPages.push(fullText.slice(start, end).trim() || `Page ${i + 1}`)
            }
            console.log(`Extracted text fallback for ${pageCount} pages`)
          } catch (err) {
            console.error('pdf-parse fallback failed:', err)
          }

          // STEP 1: Convert each page to image and transcribe
          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            console.log(`Processing page ${pageNum}/${pageCount}`)
            
            await updateProgress(
              id, 
              PROCESSING_STEPS.TRANSCRIBING, 
              processedPages + pageNum, 
              totalPageCount, 
              `Transcription de la page ${pageNum}/${pageCount}...`
            )
            
            // Try to convert to image (with timeout)
            const imageResult = await convertPdfPageToImage(buffer, pageNum)
            
            let transcription: PageTranscription
            
            if (imageResult) {
              // Upload image to storage
              const imagePath = `${user.id}/${id}/pages/${doc.id}_page_${pageNum}.png`
              
              try {
                const { error: uploadError } = await getSupabaseAdmin().storage
                  .from('interactive-lessons')
                  .upload(imagePath, imageResult.buffer, {
                    contentType: 'image/png',
                    upsert: true
                  })

                if (!uploadError) {
                  // Store image reference
                  await getSupabaseAdmin()
                    .from('interactive_lesson_page_images')
                    .upsert({
                      document_id: doc.id,
                      page_number: pageNum,
                      image_path: imagePath,
                      width: imageResult.width,
                      height: imageResult.height
                    }, { onConflict: 'document_id,page_number' })
                }
              } catch (err) {
                console.error(`Failed to upload image for page ${pageNum}:`, err)
              }

              // STEP 2: Transcribe with vision (with timeout)
              const imageBase64 = imageResult.buffer.toString('base64')
              transcription = await withTimeout(
                transcribePageWithVision(imageBase64, pageNum, lesson.language),
                60000, // 60 second timeout per page
                { 
                  text: pdfTextPages[pageNum - 1] || `Page ${pageNum}`, 
                  elements: [], 
                  hasVisualContent: false 
                }
              )
            } else {
              // Fallback: use text extraction only
              console.log(`Using text fallback for page ${pageNum}`)
              transcription = {
                text: pdfTextPages[pageNum - 1] || `Page ${pageNum} (text extraction failed)`,
                elements: [],
                hasVisualContent: false
              }
            }
              
            // Store transcription (works for both vision and fallback)
            const { data: pageTextData } = await getSupabaseAdmin()
              .from('interactive_lesson_page_texts')
              .upsert({
                document_id: doc.id,
                page_number: pageNum,
                text_content: transcription.text,
                transcription_type: imageResult ? 'vision' : 'text',
                elements_description: JSON.stringify(transcription.elements),
                has_visual_content: transcription.hasVisualContent
              }, { onConflict: 'document_id,page_number' })
              .select()
              .single()

            allPageTexts.push(transcription.text)

            // Analyze elements for highlights (skip if text fallback to save time)
            if (pageTextData && imageResult) {
              try {
                const elements = await withTimeout(
                  analyzePageElements(transcription.text, pageNum, lesson.language),
                  30000, // 30 second timeout
                  []
                )
                
                for (let i = 0; i < elements.length; i++) {
                  const elem = elements[i]
                  await getSupabaseAdmin()
                    .from('interactive_lesson_page_elements')
                    .insert({
                      page_text_id: pageTextData.id,
                      element_type: elem.element_type,
                      element_text: elem.element_text,
                      explanation: elem.explanation,
                      position_hint: elem.position_hint,
                      element_order: i
                    })
                }
              } catch (err) {
                console.error(`Element analysis failed for page ${pageNum}:`, err)
              }
            }
          }
          
          processedPages += pageCount
        }

        // STEP 3: Reconstruct full lesson
        console.log('Reconstructing lesson...')
        await updateProgress(id, PROCESSING_STEPS.RECONSTRUCTING, 0, 1, 'Reconstruction de la leçon complète...')
        const reconstruction = await reconstructLesson(allPageTexts, lesson.language)
        
        await getSupabaseAdmin()
          .from('interactive_lesson_reconstructions')
          .upsert({
            interactive_lesson_id: id,
            full_content: reconstruction.fullContent,
            structure_json: reconstruction.structure
          }, { onConflict: 'interactive_lesson_id' })

        // STEP 4: Create checkpoints
        console.log('Creating checkpoints...')
        await updateProgress(id, PROCESSING_STEPS.CHECKPOINTING, 0, 1, 'Création des checkpoints...')
        const checkpointData = await createCheckpoints(
          reconstruction.fullContent,
          totalPageCount,
          lesson.language
        )

        // Store checkpoints and get their IDs
        const createdCheckpoints: Array<{ id: string; title: string; summary: string; start_page: number; end_page: number }> = []
        const checkpointIdMap = new Map<number, string>() // index -> id

        for (let i = 0; i < checkpointData.length; i++) {
          const cp = checkpointData[i]
          
          // Resolve parent_id if it's a subtopic
          let parentId = null
          if (cp.parent_index !== undefined && checkpointIdMap.has(cp.parent_index)) {
            parentId = checkpointIdMap.get(cp.parent_index)
          }

          const { data: created, error: cpError } = await getSupabaseAdmin()
            .from('interactive_lesson_checkpoints')
            .insert({
              interactive_lesson_id: id,
              parent_id: parentId,
              checkpoint_order: i + 1,
              title: cp.title,
              checkpoint_type: cp.type,
              start_page: cp.start_page,
              end_page: cp.end_page,
              summary: cp.summary,
              pass_threshold: 70
            })
            .select()
            .single()

          if (!cpError && created) {
            checkpointIdMap.set(i, created.id)
            createdCheckpoints.push({
              id: created.id,
              title: cp.title,
              summary: cp.summary,
              start_page: cp.start_page,
              end_page: cp.end_page
            })
          }
        }

        // STEP 5: Handle MCQ
        await updateProgress(id, PROCESSING_STEPS.GENERATING_MCQ, 0, createdCheckpoints.length, 'Préparation des questions...')
        let uploadedQuestions: Question[] = []

        // Parse MCQ from uploaded documents if any
        for (const mcqDoc of mcqDocs) {
          const { data: fileData } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(mcqDoc.file_path)

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer())
            let text = ''
            
            // For PDF MCQs, we need to extract text
            if (mcqDoc.file_type === 'pdf') {
              const pageCount = await getPdfPageCount(buffer)
              for (let p = 1; p <= pageCount; p++) {
                const img = await convertPdfPageToImage(buffer, p)
                if (img) {
                  const trans = await transcribePageWithVision(img.buffer.toString('base64'), p, lesson.language)
                  text += trans.text + '\n'
                }
              }
            } else {
              text = buffer.toString('utf-8')
            }

            const parsedQuestions = await parseMcqFromText(text)
            uploadedQuestions.push(...parsedQuestions)
          }
        }

        // Assign questions to checkpoints
        if (uploadedQuestions.length > 0) {
          console.log(`Using ${uploadedQuestions.length} uploaded questions`)
          
          const questionsByCheckpoint = await matchQuestionsToCheckpoints(
            uploadedQuestions,
            createdCheckpoints,
            lesson.language
          )

          // Store matched questions
          for (const cp of createdCheckpoints) {
            const cpQuestions = questionsByCheckpoint.get(cp.id) || []
            
            for (let i = 0; i < cpQuestions.length; i++) {
              const q = cpQuestions[i]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  checkpoint_id: cp.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correct_index,
                  explanation: q.explanation,
                  question_order: i + 1
                })
            }
          }
        } else {
          // Generate questions for each checkpoint
          console.log('Generating questions for each checkpoint...')
          
          for (let cpIdx = 0; cpIdx < createdCheckpoints.length; cpIdx++) {
            const cp = createdCheckpoints[cpIdx]
            await updateProgress(
              id, 
              PROCESSING_STEPS.GENERATING_MCQ, 
              cpIdx + 1, 
              createdCheckpoints.length, 
              `Génération des questions pour "${cp.title}"...`
            )
            
            // Get relevant page content for this checkpoint
            const relevantContent = allPageTexts
              .slice(cp.start_page - 1, cp.end_page)
              .join('\n\n')

            const questions = await generateCheckpointQuestions(
              cp.title,
              cp.summary,
              relevantContent,
              lesson.language,
              10
            )

            for (let i = 0; i < questions.length; i++) {
              const q = questions[i]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  checkpoint_id: cp.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correct_index,
                  explanation: q.explanation,
                  question_order: i + 1
                })
            }
          }
        }

        // Also create legacy sections for backwards compatibility
        for (const cp of createdCheckpoints) {
          if (cp.title) { // Only top-level checkpoints as sections
            await getSupabaseAdmin()
              .from('interactive_lesson_sections')
              .insert({
                interactive_lesson_id: id,
                document_id: lessonDocs[0]?.id,
                section_order: createdCheckpoints.indexOf(cp) + 1,
                title: cp.title,
                start_page: cp.start_page,
                end_page: cp.end_page,
                summary: cp.summary,
                key_points: [],
                pass_threshold: 70
              })
          }
        }
      }
      // ===== MCQ-ONLY MODE =====
      else {
        // Parse all MCQ documents
        let allQuestions: Question[] = []
        
        for (const mcqDoc of mcqDocs) {
          const { data: fileData } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(mcqDoc.file_path)

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer())
            let text = ''
            
            if (mcqDoc.file_type === 'pdf') {
              const pageCount = await getPdfPageCount(buffer)
              for (let p = 1; p <= pageCount; p++) {
                const img = await convertPdfPageToImage(buffer, p)
                if (img) {
                  const trans = await transcribePageWithVision(img.buffer.toString('base64'), p, lesson.language)
                  text += trans.text + '\n'
                }
              }
            } else {
              text = buffer.toString('utf-8')
            }

            const parsedQuestions = await parseMcqFromText(text)
            allQuestions.push(...parsedQuestions)
          }
        }

        if (allQuestions.length === 0) {
          throw new Error('No valid MCQ questions found in uploaded documents')
        }

        // Group questions into checkpoints (5-10 questions per checkpoint)
        const questionsPerCheckpoint = 10
        const checkpointCount = Math.ceil(allQuestions.length / questionsPerCheckpoint)

        for (let i = 0; i < checkpointCount; i++) {
          const cpQuestions = allQuestions.slice(
            i * questionsPerCheckpoint,
            (i + 1) * questionsPerCheckpoint
          )

          const cpTitle = `Section ${i + 1}`

          // Create checkpoint
          const { data: checkpoint } = await getSupabaseAdmin()
            .from('interactive_lesson_checkpoints')
            .insert({
              interactive_lesson_id: id,
              checkpoint_order: i + 1,
              title: cpTitle,
              checkpoint_type: 'topic',
              start_page: 1,
              end_page: 1,
              summary: `This section covers ${cpQuestions.length} questions.`,
              pass_threshold: 70
            })
            .select()
            .single()

          if (checkpoint) {
            // Store questions
            for (let j = 0; j < cpQuestions.length; j++) {
              const q = cpQuestions[j]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  checkpoint_id: checkpoint.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correct_index,
                  explanation: q.explanation,
                  question_order: j + 1
                })
            }
          }

          // Also create legacy section
          await getSupabaseAdmin()
            .from('interactive_lesson_sections')
            .insert({
              interactive_lesson_id: id,
              section_order: i + 1,
              title: cpTitle,
              start_page: 1,
              end_page: 1,
              summary: `This section covers ${cpQuestions.length} questions.`,
              key_points: cpQuestions.slice(0, 3).map(q => q.question.slice(0, 50) + '...'),
              pass_threshold: 70
            })
        }
      }

      // Finalize
      await updateProgress(id, PROCESSING_STEPS.FINALIZING, 1, 1, 'Finalisation...')

      // Update status to ready
      await getSupabaseAdmin()
        .from('interactive_lessons')
        .update({ 
          status: 'ready', 
          error_message: null,
          processing_step: 'complete',
          processing_progress: 100,
          processing_total: 100,
          processing_message: 'Terminé !'
        })
        .eq('id', id)

      return NextResponse.json({ 
        success: true,
        message: 'Processing completed successfully'
      })

    } catch (processingError: any) {
      console.error('Processing error:', processingError)
      
      // Update status to error
      await getSupabaseAdmin()
        .from('interactive_lessons')
        .update({ 
          status: 'error',
          error_message: processingError.message || 'Processing failed'
        })
        .eq('id', id)

      return NextResponse.json(
        { error: processingError.message || 'Processing failed' },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/process:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
