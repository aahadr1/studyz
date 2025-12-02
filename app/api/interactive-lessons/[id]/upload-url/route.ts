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

// POST: Get a signed upload URL for direct upload to Supabase Storage
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

    // Verify lesson ownership and status
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
        { error: 'Cannot upload documents to a processed lesson' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { fileName, category, contentType } = body

    if (!fileName || !category) {
      return NextResponse.json(
        { error: 'fileName and category are required' },
        { status: 400 }
      )
    }

    if (!['lesson', 'mcq'].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be "lesson" or "mcq"' },
        { status: 400 }
      )
    }

    // Generate unique file path
    const fileExt = fileName.split('.').pop()?.toLowerCase()
    const allowedTypes = ['pdf', 'docx', 'doc', 'txt']
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PDF, DOCX, DOC, TXT' },
        { status: 400 }
      )
    }

    const filePath = `${user.id}/${id}/${category}/${Date.now()}-${fileName}`

    // Create signed upload URL (valid for 5 minutes)
    const { data: signedUrlData, error: signedUrlError } = await getSupabaseAdmin()
      .storage
      .from('interactive-lessons')
      .createSignedUploadUrl(filePath)

    if (signedUrlError || !signedUrlData) {
      console.error('Error creating signed upload URL:', signedUrlError)
      return NextResponse.json(
        { error: 'Failed to create upload URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      uploadUrl: signedUrlData.signedUrl,
      token: signedUrlData.token,
      filePath,
      fileType: fileExt
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/upload-url:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



