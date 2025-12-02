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

  // Get image URL
  let imageUrl = pageImage.image_path
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    const { data: signedUrl } = await supabaseAdmin.storage
      .from('interactive-lessons')
      .createSignedUrl(pageImage.image_path, 3600)
    imageUrl = signedUrl?.signedUrl || ''
  }

  if (!imageUrl) {
    throw new Error(`No image URL for page ${pageNumber}`)
  }

  // Transcribe with GPT-4o
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TRANSCRIPTION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Transcribe page ${pageNumber} of this lesson document.` },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
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

  const LESSON_GENERATION_PROMPT = `You are creating an educational lesson from document transcriptions.
Each section must correspond to exactly one page of the document.

Requirements:
- Create a cohesive narrative that flows naturally across all sections
- Each section should explain and expand on concepts from that specific page
- Use clear, educational language appropriate for studying
- Sections should feel connected (reference previous concepts, build upon them)
- Each section should be 2-4 paragraphs, suitable for reading aloud (will be converted to audio)
- Write in a conversational but educational tone
- Section titles should be descriptive and engaging

Document transcriptions:
${transcriptionsText}

Return a JSON object with this exact structure:
{
  "sections": [
    {
      "page_number": 1,
      "title": "Introduction to...",
      "content": "In this section, we explore..."
    }
  ]
}

Ensure you create exactly one section for each page (${totalPages} pages total).`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert educational content creator. Always respond with valid JSON.' },
      { role: 'user', content: LESSON_GENERATION_PROMPT }
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

