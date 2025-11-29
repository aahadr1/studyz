import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // Ensure fresh URLs each time

// Cache signed URLs briefly to avoid regenerating on rapid requests
const urlCache = new Map<string, { url: string; expires: number }>()

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

    console.log('🔍 Signed URL request for document:', documentId)

    if (!documentId) {
      return NextResponse.json(
        { error: 'Missing document ID' },
        { status: 400 }
      )
    }

    // Create auth client to verify user
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('🍪 Cookies received:', allCookies.length, 'cookies')
    
    // Log cookie names for debugging
    const cookieNames = allCookies.map(c => c.name)
    console.log('🍪 Cookie names:', cookieNames.join(', '))
    
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
              // Called from Server Component - can ignore
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set(name, '', options)
            } catch {
              // Called from Server Component - can ignore
            }
          },
        },
      }
    )

    // Get current user
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('❌ Auth error:', authError.message)
    }

    if (!user) {
      console.error('❌ No user found in session')
    }

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please log in to view this document' },
        { status: 401 }
      )
    }

    console.log('✅ User authenticated:', user.email)

    // Get document info and verify ownership through lesson
    console.log('Fetching document:', documentId, 'for user:', user.id)
    
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select(`
        id,
        file_path,
        name,
        file_type,
        page_count,
        lesson_id,
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

    console.log('Document found:', document.name, 'lesson_id:', document.lesson_id)

    // Verify user owns this document (through lesson ownership)
    const lessonData = document.lessons as any
    console.log('Document owner:', lessonData.user_id, 'Current user:', user.id)
    
    if (lessonData.user_id !== user.id) {
      console.error('Access denied: User', user.id, 'does not own document owned by', lessonData.user_id)
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check cache first (avoid regenerating URLs rapidly)
    const cacheKey = `${documentId}:${user.id}`
    const cached = urlCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      console.log('✅ Serving cached signed URL')
      return NextResponse.json({
        signedUrl: cached.url,
        documentId: document.id,
        fileName: document.name,
        fileType: document.file_type,
        pageCount: document.page_count,
        expiresIn: Math.floor((cached.expires - Date.now()) / 1000),
      })
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(document.file_path, 3600)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Failed to create signed URL:', signedUrlError)
      return NextResponse.json(
        { error: 'Failed to generate document URL' },
        { status: 500 }
      )
    }

    // Cache the URL (expires in 50 minutes to be safe)
    urlCache.set(cacheKey, {
      url: signedUrlData.signedUrl,
      expires: Date.now() + (50 * 60 * 1000),
    })

    console.log('✅ Generated and cached new signed URL')

    return NextResponse.json({
      signedUrl: signedUrlData.signedUrl,
      documentId: document.id,
      fileName: document.name,
      fileType: document.file_type,
      pageCount: document.page_count,
      expiresIn: 3600,
    })

  } catch (error: any) {
    console.error('Error generating signed URL:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



