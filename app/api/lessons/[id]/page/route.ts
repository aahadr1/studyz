import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

// Create a Supabase client with service role for server-side operations
function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Helper to convert data URL to Buffer and get content type
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

// POST /api/lessons/[id]/page - Upload a page image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createServerClient()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized - no auth header' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 401 })
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - no user' }, { status: 401 })
    }

    // Check lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError) {
      console.error('Error fetching lesson:', lessonError)
      return NextResponse.json({ error: `Lesson error: ${lessonError.message}` }, { status: 404 })
    }
    
    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Parse JSON body
    const body = await request.json()
    const { pageNumber, dataUrl } = body

    if (!pageNumber || !dataUrl) {
      return NextResponse.json({ error: 'pageNumber and dataUrl are required' }, { status: 400 })
    }

    // Convert data URL to buffer
    const { buffer: imageBuffer, contentType, extension } = parseDataUrl(dataUrl)
    console.log(`Uploading page ${pageNumber} for lesson ${id}, size: ${(imageBuffer.length / 1024).toFixed(1)}KB, type: ${contentType}`)

    // Upload to storage
    const imagePath = `${user.id}/${id}/page-${pageNumber}.${extension}`
    
    const { error: uploadError } = await supabase.storage
      .from('lesson-pages')
      .upload(imagePath, imageBuffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading page image:', uploadError)
      return NextResponse.json({ 
        error: `Storage error: ${uploadError.message}`,
        details: uploadError 
      }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('lesson-pages')
      .getPublicUrl(imagePath)

    // Create page record (use insert, not upsert to avoid constraint issues)
    // First try to delete any existing record for this page
    await supabase
      .from('lesson_pages')
      .delete()
      .eq('lesson_id', id)
      .eq('page_number', pageNumber)

    // Then insert the new record
    const { data: page, error: pageError } = await supabase
      .from('lesson_pages')
      .insert({
        lesson_id: id,
        page_number: pageNumber,
        image_url: publicUrl,
      })
      .select()
      .single()

    if (pageError) {
      console.error('Error creating page record:', pageError)
      return NextResponse.json({ 
        error: `Database error: ${pageError.message}`,
        code: pageError.code,
        details: pageError.details
      }, { status: 500 })
    }

    console.log(`Page ${pageNumber} uploaded successfully for lesson ${id}`)
    return NextResponse.json({ 
      page,
      message: 'Page uploaded successfully' 
    })
  } catch (error: any) {
    console.error('Page POST error:', error)
    return NextResponse.json({ 
      error: `Server error: ${error?.message || 'Unknown error'}` 
    }, { status: 500 })
  }
}

