import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

// GET: Get page-specific data (transcription, elements, checkpoint info)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageNum: string }> }
) {
  const { id, pageNum } = await params
  const pageNumber = parseInt(pageNum)

  if (isNaN(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 })
  }

  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, user_id, mode, language')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get all lesson documents
    const { data: documents } = await supabase
      .from('interactive_lesson_documents')
      .select('id, name, category, page_count')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')
      .order('created_at')

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No lesson documents found' }, { status: 404 })
    }

    // Find which document contains this page
    let currentDoc = null
    let pageOffset = 0
    let localPageNumber = pageNumber

    for (const doc of documents) {
      if (localPageNumber <= doc.page_count) {
        currentDoc = doc
        break
      }
      localPageNumber -= doc.page_count
      pageOffset += doc.page_count
    }

    if (!currentDoc) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Get page text with elements
    const { data: pageText } = await getSupabaseAdmin()
      .from('interactive_lesson_page_texts')
      .select(`
        id,
        page_number,
        text_content,
        transcription_type,
        elements_description,
        has_visual_content,
        interactive_lesson_page_elements (
          id,
          element_type,
          element_text,
          explanation,
          color,
          position_hint,
          element_order
        )
      `)
      .eq('document_id', currentDoc.id)
      .eq('page_number', localPageNumber)
      .single()

    // Get page image
    const { data: pageImage } = await getSupabaseAdmin()
      .from('interactive_lesson_page_images')
      .select('id, image_path, width, height')
      .eq('document_id', currentDoc.id)
      .eq('page_number', localPageNumber)
      .single()

    // Generate signed URL for image if exists
    let imageUrl = null
    if (pageImage?.image_path) {
      // Check if it's already a full URL (from regular lessons) or a storage path
      if (pageImage.image_path.startsWith('http://') || pageImage.image_path.startsWith('https://')) {
        // Already a full URL, use it directly
        imageUrl = pageImage.image_path
      } else {
        // It's a storage path, generate signed URL
        const { data: signedUrl } = await getSupabaseAdmin().storage
          .from('interactive-lessons')
          .createSignedUrl(pageImage.image_path, 3600) // 1 hour
        
        imageUrl = signedUrl?.signedUrl
      }
    }
    
    // Also get all page images for this document to return allPages
    const { data: allPageImages } = await getSupabaseAdmin()
      .from('interactive_lesson_page_images')
      .select('id, document_id, page_number, image_path')
      .eq('document_id', currentDoc.id)
      .order('page_number', { ascending: true })
    
    // Process all pages to add correct URLs - generate signed URLs for storage paths
    const allPages = await Promise.all((allPageImages || []).map(async (p: any) => {
      let finalImagePath = p.image_path
      if (!p.image_path.startsWith('http://') && !p.image_path.startsWith('https://')) {
        const { data: signedUrl } = await getSupabaseAdmin().storage
          .from('interactive-lessons')
          .createSignedUrl(p.image_path, 3600) // 1 hour
        finalImagePath = signedUrl?.signedUrl || p.image_path
      }
      return {
        ...p,
        image_path: finalImagePath
      }
    }))

    // Get checkpoint that contains this page
    const { data: checkpoints } = await getSupabaseAdmin()
      .from('interactive_lesson_checkpoints')
      .select(`
        id,
        title,
        checkpoint_type,
        start_page,
        end_page,
        summary,
        checkpoint_order,
        pass_threshold,
        parent_id
      `)
      .eq('interactive_lesson_id', id)
      .lte('start_page', pageNumber)
      .gte('end_page', pageNumber)
      .order('checkpoint_order')

    // Get current checkpoint (most specific one - subtopic if exists)
    const currentCheckpoint = checkpoints?.find((cp: any) => cp.checkpoint_type === 'subtopic') 
      || checkpoints?.[0] 
      || null

    // Check if at checkpoint end
    const isAtCheckpointEnd = currentCheckpoint?.end_page === pageNumber

    // Get user progress for this checkpoint
    let checkpointProgress = null
    if (currentCheckpoint) {
      const { data: progress } = await getSupabaseAdmin()
        .from('interactive_lesson_checkpoint_progress')
        .select('status, score, attempts')
        .eq('user_id', user.id)
        .eq('checkpoint_id', currentCheckpoint.id)
        .single()
      
      checkpointProgress = progress
    }

    // Parse elements description if it's a string
    let visualElements = []
    if (pageText?.elements_description) {
      try {
        visualElements = typeof pageText.elements_description === 'string'
          ? JSON.parse(pageText.elements_description)
          : pageText.elements_description
      } catch {
        visualElements = []
      }
    }

    return NextResponse.json({
      page: {
        number: pageNumber,
        localNumber: localPageNumber,
        documentId: currentDoc.id,
        documentName: currentDoc.name
      },
      transcription: pageText ? {
        text: pageText.text_content,
        type: pageText.transcription_type,
        hasVisualContent: pageText.has_visual_content,
        visualElements
      } : null,
      elements: pageText?.interactive_lesson_page_elements?.sort(
        (a: any, b: any) => a.element_order - b.element_order
      ) || [],
      image: pageImage ? {
        url: imageUrl,
        width: pageImage.width,
        height: pageImage.height
      } : null,
      checkpoint: currentCheckpoint ? {
        id: currentCheckpoint.id,
        title: currentCheckpoint.title,
        type: currentCheckpoint.checkpoint_type,
        startPage: currentCheckpoint.start_page,
        endPage: currentCheckpoint.end_page,
        summary: currentCheckpoint.summary,
        order: currentCheckpoint.checkpoint_order,
        threshold: currentCheckpoint.pass_threshold,
        isAtEnd: isAtCheckpointEnd,
        progress: checkpointProgress
      } : null,
      allCheckpointsOnPage: checkpoints || [],
      allPages: allPages || []
    })

  } catch (error: any) {
    console.error('Error in GET /api/interactive-lessons/[id]/page/[pageNum]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

