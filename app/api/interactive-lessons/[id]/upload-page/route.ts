/**
 * Upload Page Image API
 * 
 * Receives a single page image and stores it in Supabase Storage
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Lazy Supabase admin client
let supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabase
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const pageNumber = parseInt(formData.get('pageNumber') as string)
    
    if (!file || isNaN(pageNumber)) {
      return NextResponse.json(
        { error: 'Missing file or pageNumber' },
        { status: 400 }
      )
    }
    
    console.log(`[UPLOAD-PAGE] Lesson ${lessonId}, page ${pageNumber}`)
    
    const supabaseClient = getSupabase()
    
    // Upload to storage
    const storagePath = `${lessonId}/page-${pageNumber}.png`
    const buffer = Buffer.from(await file.arrayBuffer())
    
    const { error: uploadError } = await supabaseClient.storage
      .from('interactive-lessons')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true
      })
    
    if (uploadError) {
      console.error('[UPLOAD-PAGE] Storage error:', uploadError)
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      )
    }
    
    // Get the document ID for this lesson
    const { data: docs } = await (supabaseClient as any)
      .from('interactive_lesson_documents')
      .select('id')
      .eq('interactive_lesson_id', lessonId)
      .eq('category', 'lesson')
      .limit(1)
      .single()
    
    if (docs) {
      // Save image record to database
      await (supabaseClient as any)
        .from('interactive_lesson_page_images')
        .upsert({
          document_id: docs.id,
          page_number: pageNumber,
          image_path: storagePath,
          width: 0, // Will be updated later if needed
          height: 0
        }, { onConflict: 'document_id,page_number' })
    }
    
    console.log(`[UPLOAD-PAGE] ✓ Page ${pageNumber} uploaded`)
    
    return NextResponse.json({
      success: true,
      storagePath
    })
    
  } catch (error) {
    console.error('[UPLOAD-PAGE] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

