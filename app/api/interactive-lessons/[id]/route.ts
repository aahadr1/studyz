import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

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

// GET: Get single interactive lesson details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: lesson, error } = await supabase
      .from('interactive_lessons')
      .select(`
        *,
        interactive_lesson_documents(
          id, category, name, file_path, file_type, page_count, created_at
        ),
        interactive_lesson_sections(
          id, section_order, title, start_page, end_page, summary, key_points, pass_threshold,
          interactive_lesson_questions(
            id, question, choices, correct_index, explanation, question_order
          )
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Interactive lesson not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching interactive lesson:', error)
      return NextResponse.json(
        { error: 'Failed to fetch interactive lesson' },
        { status: 500 }
      )
    }

    // Get user progress for this lesson
    const { data: progress } = await supabase
      .from('interactive_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)

    return NextResponse.json({ 
      lesson,
      progress: progress || []
    })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH: Update interactive lesson
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, subject, level, language, mode, status } = body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name.trim()
    if (subject !== undefined) updates.subject = subject?.trim() || null
    if (level !== undefined) updates.level = level?.trim() || null
    if (language !== undefined) updates.language = language
    if (mode !== undefined) updates.mode = mode
    if (status !== undefined) updates.status = status

    const { data: lesson, error } = await supabase
      .from('interactive_lessons')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating interactive lesson:', error)
      return NextResponse.json(
        { error: 'Failed to update interactive lesson' },
        { status: 500 }
      )
    }

    return NextResponse.json({ lesson })
  } catch (error: any) {
    console.error('Error in PATCH /api/interactive-lessons/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE: Delete interactive lesson
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // First get the lesson to verify ownership and get document paths
    const { data: lesson, error: fetchError } = await supabase
      .from('interactive_lessons')
      .select('id, interactive_lesson_documents(file_path)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    // Delete files from storage
    const docs = lesson.interactive_lesson_documents || []
    if (docs.length > 0) {
      const filePaths = docs.map((d: any) => d.file_path)
      await supabase.storage
        .from('interactive-lessons')
        .remove(filePaths)
    }

    // Delete the lesson (cascades to related tables)
    const { error: deleteError } = await supabase
      .from('interactive_lessons')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting interactive lesson:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete interactive lesson' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/interactive-lessons/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
