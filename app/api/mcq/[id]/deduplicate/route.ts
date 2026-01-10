import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { deduplicateAndMergeMcqs } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 60
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

// POST /api/mcq/[id]/deduplicate - Deduplicate and merge MCQs after all pages are processed
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

    // Verify MCQ set ownership
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, user_id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Get all questions for this MCQ set
    const { data: questions, error: questionsError } = await supabase
      .from('mcq_questions')
      .select('*')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })

    if (questionsError) {
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
    }

    if (!questions || questions.length <= 1) {
      return NextResponse.json({ 
        message: 'No deduplication needed',
        originalCount: questions?.length || 0,
        finalCount: questions?.length || 0,
        duplicatesRemoved: 0
      })
    }

    console.log(`Deduplicating ${questions.length} questions for MCQ set ${mcqSetId}`)

    // Convert to the format expected by deduplication function
    const questionsForDedup = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      questionType: q.question_type || ((Array.isArray(q.correct_options) && q.correct_options.length > 1) ? 'mcq' : 'scq'),
      correctOptions: Array.isArray(q.correct_options) && q.correct_options.length > 0
        ? q.correct_options
        : (q.correct_option ? [q.correct_option] : []),
      correctOption: q.correct_option, // legacy
      explanation: q.explanation,
      pageNumber: q.page_number
    }))

    // Run deduplication
    const dedupedQuestions = await deduplicateAndMergeMcqs(questionsForDedup)
    
    const originalCount = questions.length
    const finalCount = dedupedQuestions.length
    const duplicatesRemoved = originalCount - finalCount

    if (duplicatesRemoved > 0) {
      // Delete all existing questions
      await supabase
        .from('mcq_questions')
        .delete()
        .eq('mcq_set_id', mcqSetId)

      // Insert deduplicated questions
      const questionRecords = dedupedQuestions.map((q: any, index: number) => ({
        mcq_set_id: mcqSetId,
        page_number: q.pageNumber || 1,
        question: q.question,
        options: q.options,
        question_type: q.questionType || ((q.correctOptions || []).length > 1 ? 'mcq' : 'scq'),
        correct_options: Array.isArray(q.correctOptions)
          ? q.correctOptions
          : (q.correctOption ? [q.correctOption] : []),
        correct_option: (Array.isArray(q.correctOptions) && q.correctOptions.length > 0)
          ? q.correctOptions[0]
          : (q.correctOption || 'A'),
        explanation: q.explanation || null,
      }))

      const { error: insertError } = await supabase
        .from('mcq_questions')
        .insert(questionRecords)

      if (insertError) {
        console.error('Error inserting deduplicated questions:', insertError)
        return NextResponse.json({ error: 'Failed to save deduplicated questions' }, { status: 500 })
      }

      // Update total questions count
      await supabase
        .from('mcq_sets')
        .update({ total_questions: finalCount })
        .eq('id', mcqSetId)

      console.log(`Deduplication complete: ${originalCount} -> ${finalCount} questions`)
    }

    return NextResponse.json({
      message: duplicatesRemoved > 0 
        ? `Removed ${duplicatesRemoved} duplicate(s)` 
        : 'No duplicates found',
      originalCount,
      finalCount,
      duplicatesRemoved
    })
  } catch (error: any) {
    console.error('MCQ deduplication error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 })
  }
}

