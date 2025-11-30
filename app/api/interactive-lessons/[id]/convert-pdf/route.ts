import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { convertPdfToImagesForInteractiveLesson } from '@/lib/ocr/convertPdfToImagesForInteractiveLesson'

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

// POST: Convert PDF to images for interactive lesson
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

    // Get the lesson document (PDF)
    const { data: documents, error: docsError } = await supabase
      .from('interactive_lesson_documents')
      .select('id, file_type, category')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')
      .eq('file_type', 'pdf')

    if (docsError || !documents || documents.length === 0) {
      return NextResponse.json(
        { error: 'No PDF document found for this lesson' },
        { status: 404 }
      )
    }

    const documentId = documents[0].id

    // Check if already converted
    const { data: existingImages } = await supabase
      .from('interactive_lesson_page_images')
      .select('id')
      .eq('document_id', documentId)
      .limit(1)

    if (existingImages && existingImages.length > 0) {
      return NextResponse.json(
        { message: 'PDF already converted', documentId },
        { status: 200 }
      )
    }

    // Convert PDF to images
    console.log(`[CONVERT] Starting PDF conversion for document ${documentId}`)
    const pages = await convertPdfToImagesForInteractiveLesson(documentId)

    // Update lesson status to ready
    await supabase
      .from('interactive_lessons')
      .update({ status: 'ready' })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      documentId,
      pageCount: pages.length,
      pages,
    })

  } catch (error) {
    console.error('[CONVERT] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json(
      { error: `Failed to convert PDF: ${errorMessage}` },
      { status: 500 }
    )
  }
}

