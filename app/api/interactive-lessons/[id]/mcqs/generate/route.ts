import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60 // Vercel hobby limit

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

const MCQ_GENERATION_PROMPT = `You are an expert educational content creator specializing in creating high-quality multiple choice questions for studying.

Based on the provided lesson page content, create EXACTLY 5 multiple choice questions.

CRITICAL REQUIREMENTS:
1. Each question MUST be answerable ONLY from the content visible on this specific page
2. Questions should test UNDERSTANDING, not just memorization
3. Include 4 answer choices (A, B, C, D) - only ONE is correct
4. Provide a brief, helpful explanation for the correct answer
5. Vary difficulty: 2 easy, 2 medium, 1 hard question
6. Questions should be clear, unambiguous, and educational
7. Avoid trick questions - focus on genuine learning assessment

QUESTION TYPES TO INCLUDE:
- Conceptual understanding
- Application of knowledge
- Key term definitions
- Cause and effect relationships
- Comparison and contrast

Return a JSON object with this EXACT structure:
{
  "questions": [
    {
      "question": "Clear, complete question text?",
      "choices": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
      "correct_index": 0,
      "explanation": "Concise explanation of why this answer is correct",
      "difficulty": "easy"
    }
  ]
}

Generate exactly 5 questions. No more, no less.`

// POST: Generate MCQs for a SINGLE page (call multiple times from frontend)
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
    const { page_number, mcqs_per_page = 5, total_pages = 1, current_page_index = 0 } = body

    if (!page_number) {
      return NextResponse.json({ error: 'page_number is required' }, { status: 400 })
    }

    // Get lesson documents
    const { data: documents } = await supabaseAdmin
      .from('interactive_lesson_documents')
      .select('id, page_count')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No lesson documents found' }, { status: 400 })
    }

    // Get the page image for this specific page
    const docIds = documents.map((d: any) => d.id)
    const { data: pageImage } = await supabaseAdmin
      .from('interactive_lesson_page_images')
      .select('id, document_id, page_number, image_path')
      .in('document_id', docIds)
      .eq('page_number', page_number)
      .single()

    if (!pageImage) {
      return NextResponse.json({ error: `Page ${page_number} not found` }, { status: 404 })
    }

    // Update status to generating
    const progress = Math.round(((current_page_index + 1) / total_pages) * 100)
    await supabaseAdmin
      .from('interactive_lessons')
      .update({ 
        mcq_status: 'generating',
        mcq_generation_progress: progress
      })
      .eq('id', id)

    // Get image URL
    let imageUrl = pageImage.image_path
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      const { data: signedUrl } = await supabaseAdmin.storage
        .from('interactive-lessons')
        .createSignedUrl(pageImage.image_path, 3600)
      imageUrl = signedUrl?.signedUrl || ''
    }

    if (!imageUrl) {
      return NextResponse.json({ error: `No image URL for page ${page_number}` }, { status: 400 })
    }

    const openai = getOpenAI()
    const generatedMcqs: any[] = []

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: MCQ_GENERATION_PROMPT },
          { 
            role: 'user', 
            content: [
              { 
                type: 'text', 
                text: `Analyze this lesson page (page ${page_number}) and create ${mcqs_per_page} high-quality multiple choice questions based ONLY on what is visible on this page. The student will see this exact page while answering, so questions must be directly answerable from this content.`
              },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.7
      })

      const result = JSON.parse(response.choices[0]?.message?.content || '{"questions":[]}')
      const questions = result.questions || []
      
      questions.forEach((q: any, qIndex: number) => {
        generatedMcqs.push({
          interactive_lesson_id: id,
          page_number: page_number,
          question: q.question,
          choices: q.choices,
          correct_index: q.correct_index,
          explanation: q.explanation || null,
          source_type: 'ai_generated',
          question_order: qIndex
        })
      })

      // Insert MCQs for this page
      if (generatedMcqs.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('interactive_lesson_page_mcqs')
          .insert(generatedMcqs)

        if (insertError) {
          console.error('Error inserting MCQs:', insertError)
          throw new Error('Failed to save generated MCQs')
        }
      }

      // Get updated total count
      const { count } = await supabaseAdmin
        .from('interactive_lesson_page_mcqs')
        .select('*', { count: 'exact', head: true })
        .eq('interactive_lesson_id', id)

      // If this is the last page, update status to ready
      if (current_page_index >= total_pages - 1) {
        await supabaseAdmin
          .from('interactive_lessons')
          .update({ 
            mcq_status: 'ready',
            mcq_generation_progress: 100,
            mcq_total_count: count || 0
          })
          .eq('id', id)
      } else {
        await supabaseAdmin
          .from('interactive_lessons')
          .update({ mcq_total_count: count || 0 })
          .eq('id', id)
      }

      return NextResponse.json({
        success: true,
        page_number,
        generated: generatedMcqs.length,
        total_mcqs: count || 0,
        progress,
        is_complete: current_page_index >= total_pages - 1
      })

    } catch (aiError: any) {
      console.error(`Error generating MCQs for page ${page_number}:`, aiError)
      
      // Don't fail the whole process, just report this page failed
      return NextResponse.json({
        success: false,
        page_number,
        error: aiError.message || 'AI generation failed',
        generated: 0
      })
    }

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/mcqs/generate:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

