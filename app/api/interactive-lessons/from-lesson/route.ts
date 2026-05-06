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

// POST: Create interactive lesson from existing lesson
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAuthClient()
    const supabaseAdmin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { lessonId } = body

    if (!lessonId) {
      return NextResponse.json(
        { error: 'lessonId is required' },
        { status: 400 }
      )
    }

    // Fetch the source lesson with pages
    const { data: sourceLesson, error: lessonError } = await supabaseAdmin
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !sourceLesson) {
      return NextResponse.json(
        { error: 'Lesson not found or access denied' },
        { status: 404 }
      )
    }

    // Fetch lesson pages
    const { data: lessonPages, error: pagesError } = await supabaseAdmin
      .from('lesson_pages')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('page_number', { ascending: true })

    if (pagesError) {
      console.error('Error fetching lesson pages:', pagesError)
      return NextResponse.json(
        { error: 'Failed to fetch lesson pages' },
        { status: 500 }
      )
    }

    // Check if an interactive lesson already exists for this source lesson
    const { data: existingInteractive } = await supabaseAdmin
      .from('interactive_lessons')
      .select('id')
      .eq('source_lesson_id', lessonId)
      .eq('user_id', user.id)
      .single()

    if (existingInteractive) {
      // Return existing interactive lesson
      return NextResponse.json({
        interactiveLessonId: existingInteractive.id,
        message: 'Interactive lesson already exists for this lesson',
        existing: true
      })
    }

    // Create new interactive lesson
    const { data: interactiveLesson, error: createError } = await supabaseAdmin
      .from('interactive_lessons')
      .insert({
        user_id: user.id,
        name: sourceLesson.name,
        mode: 'document_based',
        status: 'draft',
        language: 'fr',
        source_lesson_id: lessonId
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating interactive lesson:', createError)
      return NextResponse.json(
        { error: 'Failed to create interactive lesson' },
        { status: 500 }
      )
    }

    // Create document record
    const { data: document, error: docError } = await supabaseAdmin
      .from('interactive_lesson_documents')
      .insert({
        interactive_lesson_id: interactiveLesson.id,
        category: 'lesson',
        name: sourceLesson.name,
        file_path: sourceLesson.document_url || `${user.id}/${lessonId}/source`,
        file_type: 'application/pdf',
        page_count: sourceLesson.total_pages || lessonPages?.length || 0
      })
      .select()
      .single()

    if (docError) {
      console.error('Error creating document record:', docError)
      // Cleanup: delete the interactive lesson if document creation failed
      await supabaseAdmin
        .from('interactive_lessons')
        .delete()
        .eq('id', interactiveLesson.id)
      
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    // Create page image records referencing the existing lesson page images
    if (lessonPages && lessonPages.length > 0) {
      const pageImageRecords = lessonPages.map((page: any) => ({
        document_id: document.id,
        page_number: page.page_number,
        image_path: page.image_url // Reference existing image URL
      }))

      const { error: pageImagesError } = await supabaseAdmin
        .from('interactive_lesson_page_images')
        .insert(pageImageRecords)

      if (pageImagesError) {
        console.error('Error creating page image records:', pageImagesError)
        // Don't fail the whole operation, pages can be added later
      }
    }

    return NextResponse.json({
      interactiveLessonId: interactiveLesson.id,
      message: 'Interactive lesson created successfully',
      existing: false
    }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/from-lesson:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

