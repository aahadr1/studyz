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

// GET: Get MCQs for a specific page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageNum: string }> }
) {
  try {
    const { id, pageNum } = await params
    const pageNumber = parseInt(pageNum)

    if (isNaN(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'Invalid page number' }, { status: 400 })
    }

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

    // Get MCQs for this page
    const { data: mcqs, error: mcqsError } = await supabaseAdmin
      .from('interactive_lesson_page_mcqs')
      .select('*')
      .eq('interactive_lesson_id', id)
      .eq('page_number', pageNumber)
      .order('question_order', { ascending: true })

    if (mcqsError) {
      console.error('Error fetching page MCQs:', mcqsError)
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

    // Attach progress to MCQs
    const mcqsWithProgress = (mcqs || []).map((mcq: any) => {
      const mcqProgress = progress.find((p: any) => p.mcq_id === mcq.id)
      return {
        ...mcq,
        progress: mcqProgress || null
      }
    })

    // Calculate page stats
    const total = mcqsWithProgress.length
    const answered = mcqsWithProgress.filter((m: any) => m.progress).length
    const correct = mcqsWithProgress.filter((m: any) => m.progress?.is_correct).length

    // Find the next unanswered MCQ
    const nextUnansweredIndex = mcqsWithProgress.findIndex((m: any) => !m.progress)
    const currentMcqIndex = nextUnansweredIndex >= 0 ? nextUnansweredIndex : 0

    return NextResponse.json({
      pageNumber,
      mcqs: mcqsWithProgress,
      currentMcqIndex,
      stats: {
        total,
        answered,
        correct,
        remaining: total - answered
      }
    })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/mcqs/page/[pageNum]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

