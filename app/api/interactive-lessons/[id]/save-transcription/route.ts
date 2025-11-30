/**
 * Save Transcription API
 * 
 * Saves a page transcription to the database
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
    const { pageNumber, transcription, documentId } = await request.json()
    
    if (!pageNumber || !transcription || !documentId) {
      return NextResponse.json(
        { error: 'Missing pageNumber, documentId or transcription' },
        { status: 400 }
      )
    }
    
    console.log(`[SAVE-TRANSCRIPTION] Lesson ${lessonId}, page ${pageNumber}: ${transcription.length} chars`)
    
    const supabaseClient = getSupabase()
    
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
    
    // Save transcription to database
    const { error } = await (supabaseClient as any)
      .from('interactive_lesson_page_texts')
      .upsert({
        document_id: documentId,
        page_number: pageNumber,
        text_content: transcription,
        transcription_type: 'vision',
        has_visual_content: true
      }, { onConflict: 'document_id,page_number' })
    
    if (error) {
      console.error('[SAVE-TRANSCRIPTION] DB error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    console.log(`[SAVE-TRANSCRIPTION] ✓ Page ${pageNumber} saved`)
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('[SAVE-TRANSCRIPTION] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Save failed' },
      { status: 500 }
    )
  }
}

