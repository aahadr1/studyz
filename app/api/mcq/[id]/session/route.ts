import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// POST /api/mcq/[id]/session - Create a new practice session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      mode = 'test',
      totalQuestions,
      questionIds,
    } = body as {
      mode?: string
      totalQuestions?: number
      questionIds?: string[]
    }

    const normalizedQuestionIds = Array.isArray(questionIds)
      ? questionIds.filter((x) => typeof x === 'string' && x.length > 0)
      : null
    const resolvedTotal =
      typeof totalQuestions === 'number'
        ? totalQuestions
        : (normalizedQuestionIds ? normalizedQuestionIds.length : 0)

    // Create new session
    const { data: session, error: sessionError } = await supabase
      .from('mcq_sessions')
      .insert({
        mcq_set_id: mcqSetId,
        user_id: user.id,
        mode,
        total_questions: resolvedTotal,
        question_ids: normalizedQuestionIds ?? [],
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Error creating session:', sessionError)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({ session })
  } catch (error: any) {
    console.error('Session creation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET /api/mcq/[id]/session - Get the latest incomplete session or create a new one
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')

    const baseQuery = supabase
      .from('mcq_sessions')
      .select(`
        *,
        mcq_session_answers (
          question_id,
          selected_option,
          is_correct,
          time_spent_seconds
        )
      `)
      .eq('mcq_set_id', mcqSetId)
      .eq('user_id', user.id)

    // Fetch a specific session when sessionId is provided (used for "study selection")
    if (sessionId) {
      const { data: session, error: sessionError } = await baseQuery
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        console.error('Error fetching session by id:', sessionError)
        return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
      }

      return NextResponse.json({ session: session || null })
    }

    // Otherwise, return the latest incomplete session
    const { data: session, error: sessionError } = await baseQuery
      .eq('is_completed', false)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (sessionError && sessionError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned"
      console.error('Error fetching session:', sessionError)
      return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
    }

    return NextResponse.json({ session: session || null })
  } catch (error: any) {
    console.error('Session fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/mcq/[id]/session - Update session with answer or completion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, answer, complete } = body

    // If completing the session
    if (complete) {
      const { correctAnswers, totalTimeSeconds } = body
      
      const { data: session, error: updateError } = await supabase
        .from('mcq_sessions')
        .update({
          is_completed: true,
          ended_at: new Date().toISOString(),
          correct_answers: correctAnswers,
          total_time_seconds: totalTimeSeconds,
        })
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error completing session:', updateError)
        return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 })
      }

      return NextResponse.json({ session })
    }

    // If recording an answer
    if (answer) {
      const { questionId, selectedOption, isCorrect, timeSpentSeconds } = answer

      // Insert the answer
      const { error: answerError } = await supabase
        .from('mcq_session_answers')
        .insert({
          session_id: sessionId,
          question_id: questionId,
          selected_option: selectedOption,
          is_correct: isCorrect,
          time_spent_seconds: timeSpentSeconds,
        })

      if (answerError) {
        console.error('Error recording answer:', answerError)
        return NextResponse.json({ error: 'Failed to record answer' }, { status: 500 })
      }

      // Update session counters
      const { error: updateError } = await supabase
        .from('mcq_sessions')
        .update({
          questions_answered: supabase.rpc('increment', { x: 1 }),
          correct_answers: isCorrect ? supabase.rpc('increment', { x: 1 }) : undefined,
        })
        .eq('id', sessionId)

      if (updateError) {
        console.error('Error updating session counters:', updateError)
      }

      // Update question difficulty score
      await supabase.rpc('update_question_difficulty', {
        q_id: questionId,
        was_correct: isCorrect,
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error: any) {
    console.error('Session update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

