import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 60

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

// Helper to parse data URL
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; extension: string } {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid data URL format')
  }
  const contentType = matches[1]
  const base64Data = matches[2]
  const extension = contentType === 'image/jpeg' ? 'jpg' : 'png'
  return {
    buffer: Buffer.from(base64Data, 'base64'),
    contentType,
    extension
  }
}

// POST: Upload a page image for an interactive lesson
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createAuthClient()
    const supabaseAdmin = getSupabaseAdmin()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get lesson document
    const { data: documents } = await supabaseAdmin
      .from('interactive_lesson_documents')
      .select('id')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')
      .limit(1)

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No lesson document found' }, { status: 404 })
    }

    const documentId = documents[0].id

    // Parse request body
    const body = await request.json()
    const { pageNumber, dataUrl, width, height } = body

    if (!pageNumber || !dataUrl) {
      return NextResponse.json({ error: 'pageNumber and dataUrl are required' }, { status: 400 })
    }

    // Parse data URL to buffer
    const { buffer: imageBuffer, contentType, extension } = parseDataUrl(dataUrl)
    console.log(`Uploading page ${pageNumber} for interactive lesson ${id}, size: ${(imageBuffer.length / 1024).toFixed(1)}KB`)

    // Upload to storage
    const imagePath = `${user.id}/${id}/pages/page-${pageNumber}.${extension}`
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('interactive-lessons')
      .upload(imagePath, imageBuffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading page image:', uploadError)
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
    }

    // Get signed URL for the uploaded image
    const { data: signedUrl } = await supabaseAdmin.storage
      .from('interactive-lessons')
      .createSignedUrl(imagePath, 3600 * 24 * 7) // 1 week

    // Delete existing page image record if any
    await supabaseAdmin
      .from('interactive_lesson_page_images')
      .delete()
      .eq('document_id', documentId)
      .eq('page_number', pageNumber)

    // Create page image record
    const { error: insertError } = await supabaseAdmin
      .from('interactive_lesson_page_images')
      .insert({
        document_id: documentId,
        page_number: pageNumber,
        image_path: signedUrl?.signedUrl || imagePath, // Store full URL for convenience
        width: width || null,
        height: height || null,
      })

    if (insertError) {
      console.error('Error creating page record:', insertError)
      return NextResponse.json({ error: `Database error: ${insertError.message}` }, { status: 500 })
    }

    // Update document page count if needed
    const { data: maxPage } = await supabaseAdmin
      .from('interactive_lesson_page_images')
      .select('page_number')
      .eq('document_id', documentId)
      .order('page_number', { ascending: false })
      .limit(1)
      .single()

    if (maxPage) {
      await supabaseAdmin
        .from('interactive_lesson_documents')
        .update({ page_count: maxPage.page_number })
        .eq('id', documentId)
    }

    console.log(`Page ${pageNumber} uploaded successfully for interactive lesson ${id}`)
    
    return NextResponse.json({ 
      success: true,
      pageNumber,
      imagePath
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/page:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

