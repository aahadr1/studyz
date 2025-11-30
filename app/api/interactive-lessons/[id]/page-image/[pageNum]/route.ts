import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

// GET: Get signed URL for a specific page image
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageNum: string }> }
) {
  try {
    const { id, pageNum } = await params
    const pageNumber = parseInt(pageNum)
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

    // Get the document ID
    const { data: documents } = await supabase
      .from('interactive_lesson_documents')
      .select('id')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')
      .limit(1)

    if (!documents || documents.length === 0) {
      return NextResponse.json(
        { error: 'No document found' },
        { status: 404 }
      )
    }

    const documentId = documents[0].id

    // Get the page image record
    const { data: pageImage, error: pageError } = await supabase
      .from('interactive_lesson_page_images')
      .select('image_path')
      .eq('document_id', documentId)
      .eq('page_number', pageNumber)
      .single()

    if (pageError || !pageImage) {
      return NextResponse.json(
        { error: 'Page image not found' },
        { status: 404 }
      )
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('interactive-lesson-pages')
      .createSignedUrl(pageImage.image_path, 3600)

    if (signedUrlError || !signedUrlData) {
      return NextResponse.json(
        { error: 'Failed to generate signed URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      signedUrl: signedUrlData.signedUrl,
      pageNumber,
    })

  } catch (error) {
    console.error('[PAGE-IMAGE] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json(
      { error: `Failed to get page image: ${errorMessage}` },
      { status: 500 }
    )
  }
}

