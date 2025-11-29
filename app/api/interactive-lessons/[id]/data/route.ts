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

// GET: Get full interactive lesson data for the player
export async function GET(
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

    // Get full lesson data with all related entities
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select(`
        id, name, subject, level, language, mode, status, error_message, created_at,
        interactive_lesson_documents!inner(
          id, category, name, file_path, file_type, page_count
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError) {
      // Try without !inner in case there are no documents
      const { data: lessonNoDoc, error: lessonNoDocError } = await supabase
        .from('interactive_lessons')
        .select(`
          id, name, subject, level, language, mode, status, error_message, created_at
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      
      if (lessonNoDocError) {
        return NextResponse.json(
          { error: 'Interactive lesson not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json({
        lesson: { ...lessonNoDoc, interactive_lesson_documents: [] },
        sections: [],
        progress: [],
        documentUrls: {}
      })
    }

    // Get sections with questions
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

    // Get user progress
    const { data: progress, error: progressError } = await supabase
      .from('interactive_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)

    if (progressError) {
      console.error('Error fetching progress:', progressError)
    }

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

    return NextResponse.json({
      lesson,
      sections: sortedSections,
      progress: progress || [],
      documentUrls,
      generatedContent
    })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/data:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

