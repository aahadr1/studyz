import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for processing

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

// Lazy initialization of OpenAI client
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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

const MCQ_EXTRACTION_PROMPT = `You are an EXPERT MCQ extraction specialist with advanced OCR and vision capabilities. Your task is to extract EVERY SINGLE multiple choice question with MAXIMUM accuracy.

## CRITICAL: MIXED CONTENT HANDLING

Documents may contain a MIX of different content types - extract from ALL:
1. **Clean typed/printed MCQs** - Standard formatted questions
2. **Handwritten MCQs** - Questions written by hand
3. **EMBEDDED PHOTOS OF MCQ TESTS** - Photos of actual exam papers WITHIN the document
4. **Low quality or blurry images** - Make EXTRA effort to decipher these

## YOUR TASK

Extract ABSOLUTELY EVERY MCQ you can find, including:
- Questions in the main document text
- Questions in any embedded photos/images of tests
- Questions that are blurry or low quality (make best effort)
- Handwritten questions

For each question provide:
1. The complete question text
2. All answer choices (A, B, C, D format)
3. The correct answer index (0=A, 1=B, 2=C, 3=D)
4. A brief explanation of why the answer is correct

## IMAGE QUALITY HANDLING

For LOW QUALITY, BLURRY content:
- Make your BEST effort to decipher
- Use context clues from surrounding text
- NEVER skip a question just because it's hard to read
- Low quality photos often contain the most important questions

## OUTPUT FORMAT

{
  "questions": [
    {
      "question": "Complete question text",
      "choices": ["A. First choice", "B. Second choice", "C. Third choice", "D. Fourth choice"],
      "correct_index": 0,
      "explanation": "Brief explanation of the correct answer"
    }
  ]
}

If no MCQs are found, return: { "questions": [] }

CRITICAL: Extract from BOTH typed text AND embedded photos. Never skip questions because of quality issues.`

// POST: Upload and process MCQs from text or document
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
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const body = await request.json()
    const { type, content, page_images, start_page = 1 } = body

    if (!type || !['text', 'images'].includes(type)) {
      return NextResponse.json({ error: 'Valid type (text or images) is required' }, { status: 400 })
    }

    // Update status to generating
    await supabaseAdmin
      .from('interactive_lessons')
      .update({ 
        mcq_status: 'generating',
        mcq_generation_progress: 0
      })
      .eq('id', id)

    const openai = getOpenAI()
    const allExtractedMcqs: any[] = []

    try {
      if (type === 'text') {
        // Process text content
        if (!content || typeof content !== 'string') {
          throw new Error('Content text is required')
        }

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: MCQ_EXTRACTION_PROMPT },
            { role: 'user', content: `Extract MCQs from the following text:\n\n${content}` }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4000,
          temperature: 0.3
        })

        const result = JSON.parse(response.choices[0]?.message?.content || '{"questions":[]}')
        
        // Assign page numbers - distribute evenly if not specified
        const questions = result.questions || []
        questions.forEach((q: any, i: number) => {
          allExtractedMcqs.push({
            ...q,
            page_number: start_page,
            question_order: i
          })
        })

      } else if (type === 'images') {
        // Process document images page by page
        if (!page_images || !Array.isArray(page_images) || page_images.length === 0) {
          throw new Error('Page images array is required')
        }

        const totalPages = page_images.length

        for (let i = 0; i < page_images.length; i++) {
          const pageImage = page_images[i]
          const pageNumber = pageImage.page_number || (start_page + i)

          // Update progress
          await supabaseAdmin
            .from('interactive_lessons')
            .update({ 
              mcq_generation_progress: Math.round(((i + 1) / totalPages) * 100)
            })
            .eq('id', id)

          try {
            const response = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: MCQ_EXTRACTION_PROMPT },
                { 
                  role: 'user', 
                  content: [
                    { type: 'text', text: `Extract all MCQs from this document page (page ${pageNumber}):` },
                    { type: 'image_url', image_url: { url: pageImage.url, detail: 'high' } }
                  ]
                }
              ],
              response_format: { type: 'json_object' },
              max_tokens: 4000,
              temperature: 0.3
            })

            const result = JSON.parse(response.choices[0]?.message?.content || '{"questions":[]}')
            const questions = result.questions || []
            
            questions.forEach((q: any, qIndex: number) => {
              allExtractedMcqs.push({
                ...q,
                page_number: pageNumber,
                question_order: qIndex
              })
            })
          } catch (pageError) {
            console.error(`Error processing page ${pageNumber}:`, pageError)
            // Continue with other pages
          }
        }
      }

      // Insert extracted MCQs
      if (allExtractedMcqs.length > 0) {
        const mcqRecords = allExtractedMcqs.map((mcq, index) => ({
          interactive_lesson_id: id,
          page_number: mcq.page_number,
          question: mcq.question,
          choices: mcq.choices,
          correct_index: mcq.correct_index,
          explanation: mcq.explanation || null,
          source_type: type === 'text' ? 'uploaded_text' : 'uploaded_doc',
          question_order: mcq.question_order ?? index
        }))

        await supabaseAdmin
          .from('interactive_lesson_page_mcqs')
          .insert(mcqRecords)
      }

      // Update lesson status
      await supabaseAdmin
        .from('interactive_lessons')
        .update({ 
          mcq_status: 'ready',
          mcq_generation_progress: 100,
          mcq_total_count: allExtractedMcqs.length
        })
        .eq('id', id)

      return NextResponse.json({
        success: true,
        extracted: allExtractedMcqs.length,
        message: `Successfully extracted ${allExtractedMcqs.length} MCQs`
      })

    } catch (processingError: any) {
      // Update status to error
      await supabaseAdmin
        .from('interactive_lessons')
        .update({ 
          mcq_status: 'error',
          mcq_error_message: processingError.message
        })
        .eq('id', id)

      throw processingError
    }

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/mcqs/upload:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

