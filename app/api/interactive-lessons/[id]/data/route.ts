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

// GET: Get full interactive lesson data for the player
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

    // Get full lesson data with all related entities
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select(`
        id, name, subject, level, language, mode, status, error_message, created_at,
        interactive_lesson_documents(
          id, category, name, file_path, file_type, page_count
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError) {
      if (lessonError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Interactive lesson not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching lesson:', lessonError)
      return NextResponse.json(
        { error: 'Failed to fetch lesson' },
        { status: 500 }
      )
    }

    // Get sections with questions (legacy support)
    const { data: sections, error: sectionsError } = await supabase
      .from('interactive_lesson_sections')
      .select(`
        id, section_order, title, start_page, end_page, summary, key_points, pass_threshold, document_id,
        interactive_lesson_questions(
          id, question, choices, correct_index, explanation, question_order
        )
      `)
      .eq('interactive_lesson_id', id)
      .order('section_order', { ascending: true })

    if (sectionsError) {
      console.error('Error fetching sections:', sectionsError)
    }

    // Sort questions within each section
    const sortedSections = (sections || []).map(section => ({
      ...section,
      interactive_lesson_questions: (section.interactive_lesson_questions || [])
        .sort((a: any, b: any) => a.question_order - b.question_order)
    }))

    // Get checkpoints with questions (new v2 structure)
    const { data: checkpoints } = await getSupabaseAdmin()
      .from('interactive_lesson_checkpoints')
      .select(`
        id, checkpoint_order, title, checkpoint_type, start_page, end_page, 
        summary, content_excerpt, pass_threshold, parent_id,
        interactive_lesson_questions(
          id, question, choices, correct_index, explanation, question_order
        )
      `)
      .eq('interactive_lesson_id', id)
      .order('checkpoint_order', { ascending: true })

    // Sort questions within each checkpoint
    const sortedCheckpoints = (checkpoints || []).map((cp: any) => ({
      ...cp,
      interactive_lesson_questions: (cp.interactive_lesson_questions || [])
        .sort((a: any, b: any) => a.question_order - b.question_order)
    }))

    // Get lesson reconstruction
    const { data: reconstruction } = await getSupabaseAdmin()
      .from('interactive_lesson_reconstructions')
      .select('full_content, structure_json')
      .eq('interactive_lesson_id', id)
      .single()

    // Get user progress (legacy)
    const { data: progress, error: progressError } = await supabase
      .from('interactive_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)

    if (progressError) {
      console.error('Error fetching progress:', progressError)
    }

    // Get checkpoint progress (new v2)
    const { data: checkpointProgress } = await getSupabaseAdmin()
      .from('interactive_lesson_checkpoint_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)

    // Get generated content for mcq_only mode
    let generatedContent: Record<string, string> = {}
    if (lesson.mode === 'mcq_only') {
      const sectionIds = sortedSections.map(s => s.id)
      if (sectionIds.length > 0) {
        const { data: content } = await supabase
          .from('interactive_lesson_generated_content')
          .select('section_id, content_html')
          .in('section_id', sectionIds)

        if (content) {
          generatedContent = content.reduce((acc: Record<string, string>, item: any) => {
            acc[item.section_id] = item.content_html
            return acc
          }, {})
        }
      }
    }

    // Generate signed URLs for lesson documents
    const documentUrls: Record<string, string> = {}
    const lessonDocs = (lesson.interactive_lesson_documents || [])
      .filter((d: any) => d.category === 'lesson')

    for (const doc of lessonDocs) {
      const { data: signedUrlData } = await getSupabaseAdmin().storage
        .from('interactive-lessons')
        .createSignedUrl(doc.file_path, 3600) // 1 hour expiry

      if (signedUrlData?.signedUrl) {
        documentUrls[doc.id] = signedUrlData.signedUrl
      }
    }

    // Calculate total page count
    const totalPages = lessonDocs.reduce((sum: number, doc: any) => sum + (doc.page_count || 0), 0)

    return NextResponse.json({
      lesson,
      sections: sortedSections,
      checkpoints: sortedCheckpoints,
      reconstruction: reconstruction || null,
      progress: progress || [],
      checkpointProgress: checkpointProgress || [],
      documentUrls,
      generatedContent,
      totalPages
    })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/data:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
