import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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

// PUT /api/mcq/[id]/question/[questionId] - Update a question
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const { id: mcqSetId, questionId } = await params
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
      .select('id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { question, options, correct_option, correct_options, question_type, explanation } = body

    const normalizedCorrectOptions: string[] = Array.isArray(correct_options)
      ? correct_options
      : (typeof correct_option === 'string' && correct_option ? [correct_option] : [])
    const normalizedQuestionType: 'scq' | 'mcq' =
      question_type === 'mcq' || normalizedCorrectOptions.length > 1 ? 'mcq' : 'scq'
    const primaryCorrect = normalizedCorrectOptions[0] || (typeof correct_option === 'string' && correct_option ? correct_option : 'A')

    // Update the question
    const { data: updatedQuestion, error: updateError } = await supabase
      .from('mcq_questions')
      .update({
        question,
        options,
        question_type: normalizedQuestionType,
        correct_options: normalizedCorrectOptions,
        correct_option: primaryCorrect,
        explanation,
      })
      .eq('id', questionId)
      .eq('mcq_set_id', mcqSetId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating question:', updateError)
      return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
    }

    return NextResponse.json({ question: updatedQuestion })
  } catch (error) {
    console.error('Question PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/mcq/[id]/question/[questionId] - Delete a question
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const { id: mcqSetId, questionId } = await params
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
      .select('id, total_questions')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Delete the question
    const { error: deleteError } = await supabase
      .from('mcq_questions')
      .delete()
      .eq('id', questionId)
      .eq('mcq_set_id', mcqSetId)

    if (deleteError) {
      console.error('Error deleting question:', deleteError)
      return NextResponse.json({ error: 'Failed to delete question' }, { status: 500 })
    }

    // Update total questions count
    await supabase
      .from('mcq_sets')
      .update({ total_questions: Math.max(0, (mcqSet.total_questions || 1) - 1) })
      .eq('id', mcqSetId)

    return NextResponse.json({ message: 'Question deleted successfully' })
  } catch (error) {
    console.error('Question DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

