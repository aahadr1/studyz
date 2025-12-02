import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

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

// Admin client for bypassing RLS
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// OpenAI client
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

const TRANSCRIPTION_PROMPT = `You are an expert at transcribing educational documents.

Analyze this lesson page and provide a complete, accurate transcription of ALL text content visible on the page.

Include:
- All headings and subheadings (preserve hierarchy)
- All paragraphs and body text
- Bullet points and numbered lists
- Captions and labels
- Mathematical formulas (use LaTeX notation)
- Tables (describe structure and content)
- Any text in diagrams or figures

Important:
- Preserve the original structure and organization
- Don't add commentary or explanations
- Don't skip any visible text
- If text is partially visible or unclear, indicate with [unclear]

Output the transcription as plain text, maintaining the logical flow and structure of the original document.`

// POST: Process a single page (transcribe it)
// This endpoint is called repeatedly from the frontend for each page
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const supabaseAdmin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, name, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action, page_number, total_pages } = body

    // Handle different actions
    if (action === 'transcribe') {
      return await transcribePage(supabaseAdmin, id, page_number, total_pages)
    } else if (action === 'generate_lesson') {
      return await generateLessonSections(supabaseAdmin, id, total_pages)
    } else if (action === 'status') {
      return await getProcessingStatus(supabaseAdmin, id)
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/process:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// Transcribe a single page using GPT-4o vision
async function transcribePage(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  lessonId: string,
  pageNumber: number,
  totalPages: number
) {
  const openai = getOpenAI()

  // Update status
  await supabaseAdmin
    .from('interactive_lessons')
    .update({
      lesson_status: 'processing',
      lesson_generation_step: 'transcribing',
      lesson_generation_progress: pageNumber,
      lesson_generation_total: totalPages
    })
    .eq('id', lessonId)

  // Get the page image
  const { data: documents } = await supabaseAdmin
    .from('interactive_lesson_documents')
    .select('id')
    .eq('interactive_lesson_id', lessonId)
    .eq('category', 'lesson')

  if (!documents || documents.length === 0) {
    throw new Error('No lesson documents found')
  }

  const docIds = documents.map(d => d.id)
  const { data: pageImage } = await supabaseAdmin
    .from('interactive_lesson_page_images')
    .select('id, image_path')
    .in('document_id', docIds)
    .eq('page_number', pageNumber)
    .single()

  if (!pageImage) {
    throw new Error(`Page ${pageNumber} not found`)
  }

  // Download image and convert to base64 for reliable transmission to OpenAI
  let imageBase64: string
  let mimeType = 'image/jpeg'
  
  try {
    if (pageImage.image_path.startsWith('http://') || pageImage.image_path.startsWith('https://')) {
      // It's already a URL, download it
      const imageResponse = await fetch(pageImage.image_path)
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`)
      }
      const arrayBuffer = await imageResponse.arrayBuffer()
      imageBase64 = Buffer.from(arrayBuffer).toString('base64')
      mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'
    } else {
      // It's a storage path, download from Supabase
      const { data: imageData, error: downloadError } = await supabaseAdmin.storage
        .from('interactive-lessons')
        .download(pageImage.image_path)
      
      if (downloadError || !imageData) {
        throw new Error(`Failed to download image from storage: ${downloadError?.message}`)
      }
      
      const arrayBuffer = await imageData.arrayBuffer()
      imageBase64 = Buffer.from(arrayBuffer).toString('base64')
      mimeType = pageImage.image_path.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }
  } catch (downloadErr: any) {
    console.error(`Error downloading image for page ${pageNumber}:`, downloadErr)
    throw new Error(`Failed to download image for page ${pageNumber}: ${downloadErr.message}`)
  }

  // Transcribe with GPT-4o using base64 data URL
  const dataUrl = `data:${mimeType};base64,${imageBase64}`
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TRANSCRIPTION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Transcribe page ${pageNumber} of this lesson document.` },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      }
    ],
    max_tokens: 4000,
    temperature: 0.1
  })

  const transcription = response.choices[0]?.message?.content || ''

  // Save transcription (upsert)
  const { error: insertError } = await supabaseAdmin
    .from('interactive_lesson_page_transcriptions')
    .upsert({
      interactive_lesson_id: lessonId,
      page_number: pageNumber,
      transcription
    }, { onConflict: 'interactive_lesson_id,page_number' })

  if (insertError) {
    console.error('Error saving transcription:', insertError)
    throw new Error('Failed to save transcription')
  }

  return NextResponse.json({
    success: true,
    page_number: pageNumber,
    transcription_length: transcription.length
  })
}

// Generate lesson sections from all transcriptions
async function generateLessonSections(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  lessonId: string,
  totalPages: number
) {
  const openai = getOpenAI()

  // Update status
  await supabaseAdmin
    .from('interactive_lessons')
    .update({
      lesson_status: 'processing',
      lesson_generation_step: 'generating',
      lesson_generation_progress: 0,
      lesson_generation_total: 1
    })
    .eq('id', lessonId)

  // Get all transcriptions
  const { data: transcriptions } = await supabaseAdmin
    .from('interactive_lesson_page_transcriptions')
    .select('page_number, transcription')
    .eq('interactive_lesson_id', lessonId)
    .order('page_number', { ascending: true })

  if (!transcriptions || transcriptions.length === 0) {
    throw new Error('No transcriptions found')
  }

  // Build the prompt with all transcriptions
  const transcriptionsText = transcriptions
    .map(t => `=== PAGE ${t.page_number} ===\n${t.transcription}`)
    .join('\n\n')

  const LESSON_SYSTEM_PROMPT = `You are a world-class educator and master teacher with decades of experience making complex topics accessible and engaging. Your role is to transform raw document content into rich, interconnected educational lessons that truly teach—not merely summarize.

## Your Teaching Philosophy

1. **EXPLAIN, DON'T JUST DESCRIBE**
   - Never simply restate what's written. Always add pedagogical value.
   - Ask yourself: "What does the student need to understand that ISN'T explicitly on the page?"
   - Explain the WHY behind every concept, not just the WHAT.

2. **BUILD BRIDGES BETWEEN IDEAS**
   - Connect concepts across different pages. Page 5 should reference relevant ideas from pages 1-4.
   - Show how individual pieces fit into the bigger picture.
   - Use phrases like "Building on what we learned earlier about X...", "This connects directly to...", "Remember when we discussed..."

3. **MAKE THE IMPLICIT EXPLICIT**
   - Identify assumptions the document makes about prior knowledge.
   - Fill in gaps: if the document jumps from A to C, explain B.
   - Anticipate confusion points and address them proactively.

4. **USE PEDAGOGICAL TECHNIQUES**
   - Employ analogies and real-world examples to ground abstract concepts.
   - Use the Feynman technique: explain as if teaching someone with no background.
   - Include brief "why this matters" moments to maintain motivation.
   - Summarize key takeaways at natural break points.

5. **STRUCTURE FOR AUDIO DELIVERY**
   - Write in a natural, conversational tone suitable for being read aloud.
   - Use clear transitions between ideas.
   - Avoid bullet points and lists—convert them to flowing prose.
   - Include brief pauses for reflection (e.g., "Let's pause to consider...")

6. **CREATE PROGRESSIVE UNDERSTANDING**
   - Each section builds on previous ones.
   - Start with foundational concepts, then layer complexity.
   - Circle back to reinforce earlier concepts with new context.

## What NOT To Do
- Don't just paraphrase the transcription
- Don't use overly academic or robotic language
- Don't leave concepts unexplained or undefined
- Don't ignore visual elements described in the transcription (charts, diagrams, etc.)
- Don't create disconnected, isolated sections

## Output Format
Return valid JSON with exactly one section per page. Each section should be 3-5 substantial paragraphs that would take 1-2 minutes to read aloud.`

  const LESSON_USER_PROMPT = `Transform these document transcriptions into a cohesive, educational lesson.

TRANSCRIPTIONS:
${transcriptionsText}

REQUIREMENTS:
- Create exactly ${totalPages} sections, one for each page
- Each section must TEACH the content, not just summarize it
- Build connections between sections
- Explain underlying concepts and their importance
- Use clear, engaging language suitable for audio narration

Return a JSON object:
{
  "sections": [
    {
      "page_number": 1,
      "title": "Engaging title that captures the essence",
      "content": "Rich, educational content that teaches the material..."
    }
  ]
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: LESSON_SYSTEM_PROMPT },
      { role: 'user', content: LESSON_USER_PROMPT }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 16000,
    temperature: 0.7
  })

  const result = JSON.parse(response.choices[0]?.message?.content || '{"sections":[]}')
  const sections = result.sections || []

  if (sections.length === 0) {
    throw new Error('No sections generated')
  }

  // Save all sections
  for (const section of sections) {
    const { error: insertError } = await supabaseAdmin
      .from('interactive_lesson_page_sections')
      .upsert({
        interactive_lesson_id: lessonId,
        page_number: section.page_number,
        section_title: section.title,
        section_content: section.content
      }, { onConflict: 'interactive_lesson_id,page_number' })

    if (insertError) {
      console.error('Error saving section:', insertError)
    }
  }

  // Update status
  await supabaseAdmin
    .from('interactive_lessons')
    .update({
      lesson_generation_step: 'generating',
      lesson_generation_progress: 1,
      lesson_generation_total: 1
    })
    .eq('id', lessonId)

  return NextResponse.json({
    success: true,
    sections_generated: sections.length
  })
}

// Get current processing status
async function getProcessingStatus(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  lessonId: string
) {
  const { data: lesson } = await supabaseAdmin
    .from('interactive_lessons')
    .select('lesson_status, lesson_generation_step, lesson_generation_progress, lesson_generation_total, lesson_error_message')
    .eq('id', lessonId)
    .single()

  return NextResponse.json({
    status: lesson?.lesson_status || 'none',
    step: lesson?.lesson_generation_step || null,
    progress: lesson?.lesson_generation_progress || 0,
    total: lesson?.lesson_generation_total || 0,
    error: lesson?.lesson_error_message || null
  })
}

