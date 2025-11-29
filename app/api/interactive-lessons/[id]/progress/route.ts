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

// GET: Get user's progress for an interactive lesson
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

    // Verify lesson exists and get sections
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select(`
        id, name, status,
        interactive_lesson_sections(id, section_order, title)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    // Get progress for all sections
    const { data: progress, error: progressError } = await supabase
      .from('interactive_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)

    if (progressError) {
      console.error('Error fetching progress:', progressError)
      return NextResponse.json(
        { error: 'Failed to fetch progress' },
        { status: 500 }
      )
    }

    const sections = lesson.interactive_lesson_sections || []
    const progressMap = new Map(progress?.map(p => [p.section_id, p]) || [])

    // Calculate overall progress
    const completedSections = progress?.filter(p => p.status === 'completed').length || 0
    const totalSections = sections.length
    const overallProgress = totalSections > 0 
      ? Math.round((completedSections / totalSections) * 100) 
      : 0

    // Combine sections with their progress
    const sectionsWithProgress = sections
      .sort((a: any, b: any) => a.section_order - b.section_order)
      .map((section: any) => {
        const sectionProgress = progressMap.get(section.id)
        return {
          id: section.id,
          order: section.section_order,
          title: section.title,
          status: sectionProgress?.status || (section.section_order === 1 ? 'current' : 'locked'),
          score: sectionProgress?.score || null,
          attempts: sectionProgress?.attempts || 0,
          completedAt: sectionProgress?.completed_at || null
        }
      })

    return NextResponse.json({
      lessonId: id,
      lessonName: lesson.name,
      overallProgress,
      completedSections,
      totalSections,
      sections: sectionsWithProgress
    })

  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/progress:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Initialize progress for a lesson (when starting)
export async function POST(
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

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    if (lesson.status !== 'ready') {
      return NextResponse.json(
        { error: 'Lesson is not ready' },
        { status: 400 }
      )
    }

    // Get all sections
    const { data: sections, error: sectionsError } = await supabase
      .from('interactive_lesson_sections')
      .select('id, section_order')
      .eq('interactive_lesson_id', id)
      .order('section_order', { ascending: true })

    if (sectionsError || !sections || sections.length === 0) {
      return NextResponse.json(
        { error: 'No sections found' },
        { status: 400 }
      )
    }

    // Check if progress already exists
    const { data: existingProgress } = await supabase
      .from('interactive_lesson_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('interactive_lesson_id', id)
      .limit(1)

    if (existingProgress && existingProgress.length > 0) {
      return NextResponse.json({ 
        message: 'Progress already initialized',
        initialized: false 
      })
    }

    // Create progress records for all sections
    const progressRecords = sections.map((section, index) => ({
      user_id: user.id,
      interactive_lesson_id: id,
      section_id: section.id,
      status: index === 0 ? 'current' : 'locked', // First section is current, rest are locked
      attempts: 0
    }))

    const { error: insertError } = await getSupabaseAdmin()
      .from('interactive_lesson_progress')
      .insert(progressRecords)

    if (insertError) {
      console.error('Error initializing progress:', insertError)
      return NextResponse.json(
        { error: 'Failed to initialize progress' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      message: 'Progress initialized',
      initialized: true,
      sectionsCount: sections.length
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/progress:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

