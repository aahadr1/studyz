import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

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

// GET: Get all MCQs for an interactive lesson (grouped by page)
export async function GET(
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
      .select('id, name, mcq_status, mcq_generation_progress, mcq_total_count')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get all MCQs for this lesson
    const { data: mcqs, error: mcqsError } = await supabaseAdmin
      .from('interactive_lesson_page_mcqs')
      .select('*')
      .eq('interactive_lesson_id', id)
      .order('page_number', { ascending: true })
      .order('question_order', { ascending: true })

    if (mcqsError) {
      console.error('Error fetching MCQs:', mcqsError)
      return NextResponse.json({ error: 'Failed to fetch MCQs' }, { status: 500 })
    }

    // Get user's progress for these MCQs
    const mcqIds = (mcqs || []).map((m: any) => m.id)
    let progress: any[] = []
    
    if (mcqIds.length > 0) {
      const { data: progressData } = await supabaseAdmin
        .from('interactive_lesson_mcq_progress')
        .select('*')
        .eq('user_id', user.id)
        .in('mcq_id', mcqIds)
      
      progress = progressData || []
    }

    // Group MCQs by page number
    const mcqsByPage: Record<number, any[]> = {}
    for (const mcq of mcqs || []) {
      if (!mcqsByPage[mcq.page_number]) {
        mcqsByPage[mcq.page_number] = []
      }
      // Attach progress to MCQ
      const mcqProgress = progress.find((p: any) => p.mcq_id === mcq.id)
      mcqsByPage[mcq.page_number].push({
        ...mcq,
        progress: mcqProgress || null
      })
    }

    // Calculate stats
    const totalMcqs = mcqs?.length || 0
    const answeredMcqs = progress.length
    const correctMcqs = progress.filter((p: any) => p.is_correct).length

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        name: lesson.name,
        mcq_status: lesson.mcq_status,
        mcq_generation_progress: lesson.mcq_generation_progress,
        mcq_total_count: lesson.mcq_total_count
      },
      mcqsByPage,
      stats: {
        total: totalMcqs,
        answered: answeredMcqs,
        correct: correctMcqs,
        accuracy: answeredMcqs > 0 ? Math.round((correctMcqs / answeredMcqs) * 100) : 0
      }
    })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/mcqs:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// POST: Create MCQs (batch insert)
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
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const body = await request.json()
    const { mcqs, source_type } = body

    if (!mcqs || !Array.isArray(mcqs) || mcqs.length === 0) {
      return NextResponse.json({ error: 'MCQs array is required' }, { status: 400 })
    }

    if (!source_type || !['uploaded_doc', 'uploaded_text', 'ai_generated'].includes(source_type)) {
      return NextResponse.json({ error: 'Valid source_type is required' }, { status: 400 })
    }

    // Prepare MCQs for insertion
    const mcqRecords = mcqs.map((mcq: any, index: number) => ({
      interactive_lesson_id: id,
      page_number: mcq.page_number,
      question: mcq.question,
      choices: mcq.choices,
      correct_index: mcq.correct_index,
      explanation: mcq.explanation || null,
      source_type,
      question_order: mcq.question_order ?? index
    }))

    // Insert MCQs
    const { data: insertedMcqs, error: insertError } = await supabaseAdmin
      .from('interactive_lesson_page_mcqs')
      .insert(mcqRecords)
      .select()

    if (insertError) {
      console.error('Error inserting MCQs:', insertError)
      return NextResponse.json({ error: 'Failed to create MCQs' }, { status: 500 })
    }

    // Update lesson's MCQ count
    const { count } = await supabaseAdmin
      .from('interactive_lesson_page_mcqs')
      .select('*', { count: 'exact', head: true })
      .eq('interactive_lesson_id', id)

    await supabaseAdmin
      .from('interactive_lessons')
      .update({ 
        mcq_total_count: count || 0,
        mcq_status: 'ready'
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      inserted: insertedMcqs?.length || 0,
      total: count || 0
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/mcqs:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete all MCQs for a lesson
export async function DELETE(
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
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Delete all MCQs (progress will cascade delete)
    const { error: deleteError } = await supabaseAdmin
      .from('interactive_lesson_page_mcqs')
      .delete()
      .eq('interactive_lesson_id', id)

    if (deleteError) {
      console.error('Error deleting MCQs:', deleteError)
      return NextResponse.json({ error: 'Failed to delete MCQs' }, { status: 500 })
    }

    // Reset lesson MCQ status
    await supabaseAdmin
      .from('interactive_lessons')
      .update({ 
        mcq_status: 'none',
        mcq_total_count: 0,
        mcq_generation_progress: 0
      })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/interactive-lessons/[id]/mcqs:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

