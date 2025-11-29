import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Service role client for storage operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const documentId = params.documentId
    const url = new URL(request.url)
    const format = url.searchParams.get('format') || 'info' // info, blob, text

    console.log('🔍 Document content request for:', documentId, 'format:', format)

    if (!documentId) {
      return NextResponse.json(
        { error: 'Missing document ID' },
        { status: 400 }
      )
    }

    // Create auth client to verify user
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
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
              // Ignore server component errors
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set(name, '', options)
            } catch {
              // Ignore server component errors
            }
          },
        },
      }
    )

    // Get current user
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log('✅ User authenticated:', user.email)

    // Get document info and verify ownership
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select(`
        id,
        file_path,
        name,
        file_type,
        page_count,
        lesson_id,
        created_at,
        lessons!inner (
          user_id
        )
      `)
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      console.error('Document not found:', docError)
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify user owns this document
    const lessonData = document.lessons as any
    if (lessonData.user_id !== user.id) {
      console.error('Access denied')
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Handle different format requests
    switch (format) {
      case 'info':
        // Return document metadata
        return NextResponse.json({
          id: document.id,
          fileName: document.name,
          fileType: document.file_type,
          pageCount: document.page_count,
          createdAt: document.created_at,
          size: 0, // TODO: Add file size if needed
        })

      case 'blob':
        // Return raw file data
        try {
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('documents')
            .download(document.file_path)

          if (downloadError || !fileData) {
            console.error('Failed to download file:', downloadError)
            return NextResponse.json(
              { error: 'Failed to download file' },
              { status: 500 }
            )
          }

          // Determine content type
          const contentType = document.file_type === 'pdf' 
            ? 'application/pdf' 
            : 'application/octet-stream'

          return new NextResponse(fileData, {
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `inline; filename="${document.name}"`,
              'Cache-Control': 'private, max-age=3600',
            },
          })
        } catch (error) {
          console.error('Error serving file blob:', error)
          return NextResponse.json(
            { error: 'Failed to serve file' },
            { status: 500 }
          )
        }

      case 'text':
        // For future text extraction capabilities
        return NextResponse.json({
          text: 'Text extraction not yet implemented',
          pageCount: document.page_count,
        })

      default:
        return NextResponse.json(
          { error: 'Invalid format parameter' },
          { status: 400 }
        )
    }

  } catch (error: any) {
    console.error('Error in document content API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
