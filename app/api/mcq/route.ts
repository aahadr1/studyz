import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

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

// POST /api/mcq - Create a new MCQ set (just metadata, no images yet)
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

    // Parse JSON body
    const body = await request.json()
    const { name, sourcePdfName, totalPages } = body as {
      name?: string
      sourcePdfName: string
      totalPages: number
    }

    if (!totalPages || totalPages < 1) {
      return NextResponse.json({ error: 'totalPages is required' }, { status: 400 })
    }

    // Check page count limit (40 pages max for MCQ processing)
    const maxPages = 40
    if (totalPages > maxPages) {
      return NextResponse.json({
        error: `PDF has ${totalPages} pages, which exceeds the maximum limit of ${maxPages} pages`
      }, { status: 413 })
    }

    console.log(`Creating MCQ set for ${totalPages} pages from ${sourcePdfName}`)

    // Create the mcq_sets record
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .insert({
        user_id: user.id,
        name: name || sourcePdfName.replace('.pdf', ''),
        source_pdf_name: sourcePdfName,
        total_pages: totalPages,
      })
      .select()
      .single()

    if (setError || !mcqSet) {
      console.error('Error creating MCQ set:', setError)
      return NextResponse.json({ 
        error: 'Failed to create MCQ set. Please ensure the database migration has been run.',
        details: setError?.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      set: {
        id: mcqSet.id,
        name: mcqSet.name,
        total_pages: mcqSet.total_pages,
      },
      message: 'MCQ set created. Now upload pages one by one.'
    })
  } catch (error: any) {
    console.error('MCQ POST error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 })
  }
}
