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
    const documentId = formData.get('documentId') as string
    const width = parseInt(formData.get('width') as string) || 0
    const height = parseInt(formData.get('height') as string) || 0
    
    if (!file || isNaN(pageNumber) || !documentId) {
      return NextResponse.json(
        { error: 'Missing file, documentId or pageNumber' },
        { status: 400 }
      )
    }
    
    console.log(`[UPLOAD-PAGE] Lesson ${lessonId}, page ${pageNumber}`)
    
    const supabaseClient = getSupabase()
    
    // Upload to storage
    const storagePath = `${lessonId}/${documentId}/page-${pageNumber}.png`
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
    
    const { data: docRecord, error: docError } = await (supabaseClient as any)
      .from('interactive_lesson_documents')
      .select('id')
      .eq('id', documentId)
      .eq('interactive_lesson_id', lessonId)
      .single()
    
    if (docError || !docRecord) {
      return NextResponse.json(
        { error: 'Document not found for this lesson' },
        { status: 404 }
      )
    }
    
    await (supabaseClient as any)
      .from('interactive_lesson_page_images')
      .upsert({
        document_id: documentId,
        page_number: pageNumber,
        image_path: storagePath,
        width,
        height
      }, { onConflict: 'document_id,page_number' })
    
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

