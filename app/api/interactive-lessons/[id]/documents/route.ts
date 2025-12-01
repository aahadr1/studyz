import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 60 // 60 seconds for large file uploads

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

// GET: List documents for an interactive lesson
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

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    const { data: documents, error } = await supabase
      .from('interactive_lesson_documents')
      .select('*')
      .eq('interactive_lesson_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching documents:', error)
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    return NextResponse.json({ documents })
  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/documents:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Upload document to interactive lesson
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

    // Verify lesson ownership and get current status
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

    // Only allow uploads if lesson is in draft status
    if (lesson.status !== 'draft') {
      return NextResponse.json(
        { error: 'Cannot upload documents to a processed lesson' },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const category = formData.get('category') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!category || !['lesson', 'mcq'].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be "lesson" or "mcq"' },
        { status: 400 }
      )
    }

    // Validate file type
    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const allowedTypes = ['pdf', 'docx', 'doc', 'txt']
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PDF, DOCX, DOC, TXT' },
        { status: 400 }
      )
    }

    // Upload file to storage
    const fileName = `${user.id}/${id}/${category}/${Date.now()}-${file.name}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await getSupabaseAdmin().storage
      .from('interactive-lessons')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Create document record
    const { data: document, error: docError } = await getSupabaseAdmin()
      .from('interactive_lesson_documents')
      .insert({
        interactive_lesson_id: id,
        category,
        name: file.name,
        file_path: fileName,
        file_type: fileExt,
        page_count: 0 // Will be updated during processing
      })
      .select()
      .single()

    if (docError) {
      console.error('Error creating document record:', docError)
      // Try to clean up uploaded file
      await getSupabaseAdmin().storage
        .from('interactive-lessons')
        .remove([fileName])
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    return NextResponse.json({ document }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/documents:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE: Remove document from interactive lesson
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

    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
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
        { error: 'Cannot remove documents from a processed lesson' },
        { status: 400 }
      )
    }

    // Get document to delete
    const { data: document, error: docFetchError } = await supabase
      .from('interactive_lesson_documents')
      .select('id, file_path')
      .eq('id', documentId)
      .eq('interactive_lesson_id', id)
      .single()

    if (docFetchError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Delete from storage
    await getSupabaseAdmin().storage
      .from('interactive-lessons')
      .remove([document.file_path])

    // Delete document record
    const { error: deleteError } = await getSupabaseAdmin()
      .from('interactive_lesson_documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      console.error('Error deleting document:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/interactive-lessons/[id]/documents:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
