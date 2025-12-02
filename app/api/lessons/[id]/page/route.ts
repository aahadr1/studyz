import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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

// Helper to convert data URL to Buffer
function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64Data = dataUrl.split(',')[1]
  return Buffer.from(base64Data, 'base64')
}

// POST /api/lessons/[id]/page - Upload a page image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Parse JSON body
    const body = await request.json()
    const { pageNumber, dataUrl } = body

    if (!pageNumber || !dataUrl) {
      return NextResponse.json({ error: 'pageNumber and dataUrl are required' }, { status: 400 })
    }

    // Convert data URL to buffer
    const imageBuffer = dataUrlToBuffer(dataUrl)

    // Upload to storage
    const imagePath = `${user.id}/${id}/page-${pageNumber}.png`
    
    const { error: uploadError } = await supabase.storage
      .from('lesson-pages')
      .upload(imagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading page image:', uploadError)
      return NextResponse.json({ error: 'Failed to upload page image' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('lesson-pages')
      .getPublicUrl(imagePath)

    // Create page record
    const { data: page, error: pageError } = await supabase
      .from('lesson_pages')
      .upsert({
        lesson_id: id,
        page_number: pageNumber,
        image_url: publicUrl,
      }, {
        onConflict: 'lesson_id,page_number',
      })
      .select()
      .single()

    if (pageError) {
      console.error('Error creating page record:', pageError)
      return NextResponse.json({ error: 'Failed to create page record' }, { status: 500 })
    }

    return NextResponse.json({ 
      page,
      message: 'Page uploaded successfully' 
    })
  } catch (error) {
    console.error('Page POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

