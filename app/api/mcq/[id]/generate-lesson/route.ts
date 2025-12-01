import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { generateLessonFromMcqs, QuestionForLesson } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Create a Supabase client with service role for server-side operations
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

// POST /api/mcq/[id]/generate-lesson - Generate a lesson from MCQ questions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify MCQ set ownership and get details
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, name, user_id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Fetch all questions for this set
    const { data: questions, error: questionsError } = await supabase
      .from('mcq_questions')
      .select('id, question, options, correct_option, explanation')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })

    if (questionsError || !questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found to generate lesson from' }, { status: 400 })
    }

    console.log(`Generating lesson for ${questions.length} questions in set "${mcqSet.name}"`)

    // Prepare questions for lesson generation
    const questionsForLesson: QuestionForLesson[] = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correctOption: q.correct_option,
      explanation: q.explanation,
    }))

    // Generate the lesson using GPT-4o
    const lesson = await generateLessonFromMcqs(questionsForLesson, mcqSet.name)

    // Save lesson content to mcq_sets
    const { error: updateError } = await supabase
      .from('mcq_sets')
      .update({ lesson_content: lesson })
      .eq('id', mcqSetId)

    if (updateError) {
      console.error('Error saving lesson:', updateError)
      return NextResponse.json({ error: 'Failed to save lesson' }, { status: 500 })
    }

    // Update each question with its section_id
    for (const section of lesson.sections) {
      for (const questionId of section.questionIds) {
        await supabase
          .from('mcq_questions')
          .update({ section_id: section.id })
          .eq('id', questionId)
          .eq('mcq_set_id', mcqSetId)
      }
    }

    console.log(`Lesson generated with ${lesson.sections.length} sections`)

    return NextResponse.json({
      lesson,
      message: `Successfully generated lesson with ${lesson.sections.length} sections`
    })
  } catch (error: any) {
    console.error('Lesson generation error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate lesson',
      details: error?.message 
    }, { status: 500 })
  }
}

