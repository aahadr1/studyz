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

// GET /api/mcq/[id] - Get MCQ set details with all questions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Verify ownership and fetch MCQ set
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Fetch pages
    const { data: pages, error: pagesError } = await supabase
      .from('mcq_pages')
      .select('*')
      .eq('mcq_set_id', id)
      .order('page_number', { ascending: true })

    if (pagesError) {
      console.error('Error fetching pages:', pagesError)
    }

    // Fetch questions
    const { data: questions, error: questionsError } = await supabase
      .from('mcq_questions')
      .select('*')
      .eq('mcq_set_id', id)
      .order('page_number', { ascending: true })
      .order('page_question_index', { ascending: true })

    if (questionsError) {
      console.error('Error fetching questions:', questionsError)
    }

    // Transform questions to use camelCase for frontend compatibility
    const transformedQuestions = (questions || []).map(q => ({
      ...q,
      correctOption: q.correct_option, // Map snake_case to camelCase
      correctOptions: Array.isArray(q.correct_options) && q.correct_options.length > 0
        ? q.correct_options
        : (q.correct_option ? [q.correct_option] : []),
      questionType: q.question_type || ((Array.isArray(q.correct_options) && q.correct_options.length > 1) ? 'mcq' : 'scq'),
    }))

    return NextResponse.json({
      set: mcqSet,
      pages: pages || [],
      questions: transformedQuestions,
    })
  } catch (error) {
    console.error('MCQ GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/mcq/[id] - Delete an MCQ set
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Verify ownership
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Delete the MCQ set (cascades to pages and questions)
    const { error: deleteError } = await supabase
      .from('mcq_sets')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting MCQ set:', deleteError)
      return NextResponse.json({ error: 'Failed to delete MCQ set' }, { status: 500 })
    }

    // Also delete storage files
    const storagePath = `${user.id}/${id}`
    await supabase.storage.from('mcq-pages').remove([storagePath])

    return NextResponse.json({ message: 'MCQ set deleted successfully' })
  } catch (error) {
    console.error('MCQ DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

