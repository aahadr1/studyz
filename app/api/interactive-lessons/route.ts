import { NextRequest, NextResponse } from 'next/server'
import { createClient as createBrowserClient } from '@/lib/supabase'

export const runtime = 'nodejs'

// GET: List user's interactive lessons
export async function GET(request: NextRequest) {
  try {
    const supabase = createBrowserClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: lessons, error } = await supabase
      .from('interactive_lessons')
      .select(`
        *,
        interactive_lesson_documents(id, category, name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching interactive lessons:', error)
      return NextResponse.json(
        { error: 'Failed to fetch interactive lessons' },
        { status: 500 }
      )
    }

    // Add document counts by category
    const lessonsWithCounts = lessons.map(lesson => {
      const docs = lesson.interactive_lesson_documents || []
      return {
        ...lesson,
        lessonDocCount: docs.filter((d: any) => d.category === 'lesson').length,
        mcqDocCount: docs.filter((d: any) => d.category === 'mcq').length,
        interactive_lesson_documents: undefined // Remove raw docs from response
      }
    })

    return NextResponse.json({ lessons: lessonsWithCounts })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Create new interactive lesson
export async function POST(request: NextRequest) {
  try {
    const supabase = createBrowserClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, subject, level, language } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Mode will be determined later based on uploaded documents
    // For now, create as 'draft' with 'document_based' as default
    const { data: lesson, error } = await supabase
      .from('interactive_lessons')
      .insert({
        user_id: user.id,
        name: name.trim(),
        subject: subject?.trim() || null,
        level: level?.trim() || null,
        language: language || 'fr',
        mode: 'document_based', // Will be updated based on uploads
        status: 'draft'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating interactive lesson:', error)
      return NextResponse.json(
        { error: 'Failed to create interactive lesson' },
        { status: 500 }
      )
    }

    return NextResponse.json({ lesson }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

