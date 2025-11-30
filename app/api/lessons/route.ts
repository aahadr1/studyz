import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { convertPdfToImages } from '@/lib/pdf-to-images'

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

// GET /api/lessons - List all lessons for the current user
export async function GET(request: NextRequest) {
  try {
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

    // Fetch lessons
    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching lessons:', error)
      return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 })
    }

    return NextResponse.json({ lessons })
  } catch (error) {
    console.error('Lessons GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/lessons - Create a new lesson with PDF upload
export async function POST(request: NextRequest) {
  try {
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

    // Parse form data
    const formData = await request.formData()
    const name = formData.get('name') as string
    const file = formData.get('file') as File

    if (!name || !file) {
      return NextResponse.json({ error: 'Name and file are required' }, { status: 400 })
    }

    if (!file.type.includes('pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // Convert PDF to images
    console.log('Converting PDF to images...')
    const pageImages = await convertPdfToImages(pdfBuffer, 1.5)
    console.log(`Converted ${pageImages.length} pages`)

    // Create the lesson record first
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        user_id: user.id,
        name,
        total_pages: pageImages.length,
      })
      .select()
      .single()

    if (lessonError || !lesson) {
      console.error('Error creating lesson:', lessonError)
      return NextResponse.json({ error: 'Failed to create lesson' }, { status: 500 })
    }

    // Upload original PDF to storage
    const pdfPath = `${user.id}/${lesson.id}/document.pdf`
    const { error: uploadError } = await supabase.storage
      .from('lesson-documents')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError)
      // Continue anyway - we have the images
    }

    // Upload page images and create page records
    const pageRecords = []
    for (const pageImage of pageImages) {
      const imagePath = `${user.id}/${lesson.id}/page-${pageImage.pageNumber}.png`
      
      const { error: imageUploadError } = await supabase.storage
        .from('lesson-pages')
        .upload(imagePath, pageImage.buffer, {
          contentType: 'image/png',
          upsert: true,
        })

      if (imageUploadError) {
        console.error(`Error uploading page ${pageImage.pageNumber}:`, imageUploadError)
        continue
      }

      // Get public URL for the image
      const { data: { publicUrl } } = supabase.storage
        .from('lesson-pages')
        .getPublicUrl(imagePath)

      pageRecords.push({
        lesson_id: lesson.id,
        page_number: pageImage.pageNumber,
        image_url: publicUrl,
      })
    }

    // Insert all page records
    if (pageRecords.length > 0) {
      const { error: pagesError } = await supabase
        .from('lesson_pages')
        .insert(pageRecords)

      if (pagesError) {
        console.error('Error inserting page records:', pagesError)
      }
    }

    // Update lesson with document URL
    const { data: { publicUrl: docUrl } } = supabase.storage
      .from('lesson-documents')
      .getPublicUrl(pdfPath)

    await supabase
      .from('lessons')
      .update({ document_url: docUrl })
      .eq('id', lesson.id)

    return NextResponse.json({ 
      lesson: {
        ...lesson,
        document_url: docUrl,
      },
      message: 'Lesson created successfully' 
    })
  } catch (error) {
    console.error('Lessons POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

