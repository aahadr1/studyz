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

// POST: Confirm upload and create document record
export async function POST(
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

    if (lesson.status !== 'draft') {
      return NextResponse.json(
        { error: 'Cannot add documents to a processed lesson' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { filePath, fileName, category, fileType } = body

    if (!filePath || !fileName || !category || !fileType) {
      return NextResponse.json(
        { error: 'filePath, fileName, category, and fileType are required' },
        { status: 400 }
      )
    }

    // Verify the file exists in storage
    const { data: fileData, error: fileError } = await getSupabaseAdmin()
      .storage
      .from('interactive-lessons')
      .list(filePath.split('/').slice(0, -1).join('/'), {
        search: filePath.split('/').pop()
      })

    // Create document record
    const { data: document, error: docError } = await getSupabaseAdmin()
      .from('interactive_lesson_documents')
      .insert({
        interactive_lesson_id: id,
        category,
        name: fileName,
        file_path: filePath,
        file_type: fileType,
        page_count: 0 // Will be updated during processing
      })
      .select()
      .single()

    if (docError) {
      console.error('Error creating document record:', docError)
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    return NextResponse.json({ document }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/confirm-upload:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

