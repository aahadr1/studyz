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

// POST: Submit an answer to an MCQ
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

    const body = await request.json()
    const { mcq_id, selected_index } = body

    if (!mcq_id) {
      return NextResponse.json({ error: 'mcq_id is required' }, { status: 400 })
    }

    if (typeof selected_index !== 'number' || selected_index < 0 || selected_index > 3) {
      return NextResponse.json({ error: 'Valid selected_index (0-3) is required' }, { status: 400 })
    }

    // Verify MCQ exists and belongs to user's lesson
    const { data: mcq, error: mcqError } = await supabaseAdmin
      .from('interactive_lesson_page_mcqs')
      .select(`
        id, 
        correct_index, 
        explanation,
        interactive_lesson_id,
        interactive_lessons!inner(user_id)
      `)
      .eq('id', mcq_id)
      .single()

    if (mcqError || !mcq) {
      return NextResponse.json({ error: 'MCQ not found' }, { status: 404 })
    }

    // Verify ownership
    if ((mcq as any).interactive_lessons?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const is_correct = selected_index === mcq.correct_index

    // Check if progress already exists
    const { data: existingProgress } = await supabaseAdmin
      .from('interactive_lesson_mcq_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('mcq_id', mcq_id)
      .single()

    if (existingProgress) {
      // Update existing progress
      await supabaseAdmin
        .from('interactive_lesson_mcq_progress')
        .update({
          is_correct,
          selected_index,
          answered_at: new Date().toISOString()
        })
        .eq('id', existingProgress.id)
    } else {
      // Create new progress
      await supabaseAdmin
        .from('interactive_lesson_mcq_progress')
        .insert({
          user_id: user.id,
          mcq_id,
          is_correct,
          selected_index
        })
    }

    return NextResponse.json({
      is_correct,
      correct_index: mcq.correct_index,
      explanation: mcq.explanation,
      selected_index
    })
  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/mcqs/answer:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

