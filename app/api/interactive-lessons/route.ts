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

// GET: List user's interactive lessons
export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthClient()
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
    const lessonsWithCounts = (lessons || []).map(lesson => {
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
    const supabase = await createAuthClient()
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
