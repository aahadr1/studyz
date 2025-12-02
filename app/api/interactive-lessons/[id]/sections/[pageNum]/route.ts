import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
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

// Admin client for bypassing RLS
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: Fetch section for a specific page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageNum: string }> }
) {
  try {
    const { id, pageNum } = await params
    const pageNumber = parseInt(pageNum)

    if (isNaN(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'Invalid page number' }, { status: 400 })
    }

    const supabase = await createAuthClient()
    const supabaseAdmin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, lesson_status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get section for this page
    const { data: section, error: sectionError } = await supabaseAdmin
      .from('interactive_lesson_page_sections')
      .select('*')
      .eq('interactive_lesson_id', id)
      .eq('page_number', pageNumber)
      .single()

    if (sectionError || !section) {
      // Section might not exist yet
      return NextResponse.json({
        section: null,
        lesson_status: lesson.lesson_status
      })
    }

    // Generate signed URL for audio if exists
    let audioUrl = null
    if (section.audio_path) {
      const { data: signedUrl } = await supabaseAdmin.storage
        .from('interactive-lessons')
        .createSignedUrl(section.audio_path, 3600) // 1 hour
      audioUrl = signedUrl?.signedUrl || null
    }

    return NextResponse.json({
      section: {
        ...section,
        audio_url: audioUrl
      },
      lesson_status: lesson.lesson_status
    })

  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/sections/[pageNum]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

