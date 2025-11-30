import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id: lessonId, documentId } = await params

  try {
    const supabase = getSupabaseServerClient()

    // Get the document from the database
    const { data: document, error: docError } = await supabase
      .from('interactive_lesson_documents')
      .select('*')
      .eq('id', documentId)
      .eq('interactive_lesson_id', lessonId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Generate a signed URL for the document
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('interactive-lessons')
      .createSignedUrl(document.file_path, 3600) // 1 hour expiry

    if (urlError || !signedUrlData) {
      console.error('Error creating signed URL:', urlError)
      return NextResponse.json(
        { error: 'Failed to create signed URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      signedUrl: signedUrlData.signedUrl,
      expiresIn: 3600
    })
  } catch (error: any) {
    console.error('Error in signed-url route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

