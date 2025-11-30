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

// POST: Upload a single page image (converted client-side)
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

    // Get the lesson document
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

    // Get the form data
    const formData = await request.formData()
    const pageNumber = parseInt(formData.get('pageNumber') as string)
    const imageBlob = formData.get('image') as Blob

    if (!pageNumber || !imageBlob) {
      return NextResponse.json(
        { error: 'pageNumber and image are required' },
        { status: 400 }
      )
    }

    // Convert blob to buffer
    const arrayBuffer = await imageBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to storage
    const storagePath = `${documentId}/page-${pageNumber}.png`
    
    const { error: uploadError } = await supabase.storage
      .from('interactive-lesson-pages')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: `Failed to upload image: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Create or update page image record
    const { error: dbError } = await supabase
      .from('interactive_lesson_page_images')
      .upsert({
        document_id: documentId,
        page_number: pageNumber,
        image_path: storagePath,
      }, {
        onConflict: 'document_id,page_number'
      })

    if (dbError) {
      console.error('DB error:', dbError)
      return NextResponse.json(
        { error: `Failed to save page record: ${dbError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      pageNumber,
      storagePath,
    })

  } catch (error) {
    console.error('[UPLOAD-PAGE] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json(
      { error: `Failed to upload page image: ${errorMessage}` },
      { status: 500 }
    )
  }
}

