import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

interface SubmitRequest {
  sectionId: string
  answers: Record<string, number> // questionId -> selectedIndex
}

// POST: Submit QCM answers for a section
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: SubmitRequest = await request.json()
    const { sectionId, answers } = body

    if (!sectionId || !answers) {
      return NextResponse.json(
        { error: 'Missing sectionId or answers' },
        { status: 400 }
      )
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    if (lesson.status !== 'ready') {
      return NextResponse.json(
        { error: 'Lesson is not ready for studying' },
        { status: 400 }
      )
    }

    // Get section and its questions
    const { data: section, error: sectionError } = await supabase
      .from('interactive_lesson_sections')
      .select(`
        id, section_order, pass_threshold,
        interactive_lesson_questions(id, correct_index)
      `)
      .eq('id', sectionId)
      .eq('interactive_lesson_id', id)
      .single()

    if (sectionError || !section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      )
    }

    const questions = section.interactive_lesson_questions || []
    
    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found for this section' },
        { status: 400 }
      )
    }

    // Calculate score
    let correctCount = 0
    const results: Record<string, { correct: boolean; correctAnswer: number }> = {}

    for (const question of questions) {
      const userAnswer = answers[question.id]
      const isCorrect = userAnswer === question.correct_index
      
      if (isCorrect) {
        correctCount++
      }
      
      results[question.id] = {
        correct: isCorrect,
        correctAnswer: question.correct_index
      }
    }

    const score = Math.round((correctCount / questions.length) * 100)
    const passed = score >= (section.pass_threshold || 70)

    // Update or create progress record
    const { data: existingProgress } = await supabase
      .from('interactive_lesson_progress')
      .select('id, attempts')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)
      .eq('section_id', sectionId)
      .single()

    const attempts = (existingProgress?.attempts || 0) + 1

    if (existingProgress) {
      await getSupabaseAdmin()
        .from('interactive_lesson_progress')
        .update({
          status: passed ? 'completed' : 'current',
          score,
          attempts,
          completed_at: passed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProgress.id)
    } else {
      await getSupabaseAdmin()
        .from('interactive_lesson_progress')
        .insert({
          user_id: user.id,
          interactive_lesson_id: id,
          section_id: sectionId,
          status: passed ? 'completed' : 'current',
          score,
          attempts,
          completed_at: passed ? new Date().toISOString() : null
        })
    }

    // If passed, unlock next section
    if (passed) {
      // Get next section
      const { data: nextSection } = await supabase
        .from('interactive_lesson_sections')
        .select('id')
        .eq('interactive_lesson_id', id)
        .eq('section_order', section.section_order + 1)
        .single()

      if (nextSection) {
        // Check if progress exists for next section
        const { data: nextProgress } = await supabase
          .from('interactive_lesson_progress')
          .select('id')
          .eq('user_id', user.id)
          .eq('interactive_lesson_id', id)
          .eq('section_id', nextSection.id)
          .single()

        if (nextProgress) {
          // Update to current if locked
          await getSupabaseAdmin()
            .from('interactive_lesson_progress')
            .update({ status: 'current', updated_at: new Date().toISOString() })
            .eq('id', nextProgress.id)
            .eq('status', 'locked')
        } else {
          // Create progress record for next section
          await getSupabaseAdmin()
            .from('interactive_lesson_progress')
            .insert({
              user_id: user.id,
              interactive_lesson_id: id,
              section_id: nextSection.id,
              status: 'current',
              attempts: 0
            })
        }
      }
    }

    return NextResponse.json({
      score,
      passed,
      correctCount,
      totalQuestions: questions.length,
      threshold: section.pass_threshold || 70,
      attempts,
      results
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/submit:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

