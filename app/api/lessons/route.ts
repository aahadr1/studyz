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

// POST /api/lessons - Create a new lesson (accepts JSON with client-rendered page images)
export async function POST(request: NextRequest) {
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createServerClient()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized - no auth header' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 401 })
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - no user' }, { status: 401 })
    }

    // Parse JSON body
    const body = await request.json()
    const { name, totalPages } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!totalPages || totalPages < 1) {
      return NextResponse.json({ error: 'totalPages must be at least 1' }, { status: 400 })
    }

    // Check page count limit (200 pages max)
    const maxPages = 200
    if (totalPages > maxPages) {
      return NextResponse.json({
        error: `PDF has ${totalPages} pages, which exceeds the maximum limit of ${maxPages} pages`
      }, { status: 413 })
    }

    // Create the lesson record
    console.log('Creating lesson for user:', user.id, 'name:', name, 'totalPages:', totalPages)
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        user_id: user.id,
        name,
        total_pages: totalPages,
      })
      .select()
      .single()

    if (lessonError) {
      console.error('Error creating lesson:', lessonError)
      return NextResponse.json({ 
        error: `Database error: ${lessonError.message}`,
        code: lessonError.code,
        details: lessonError.details
      }, { status: 500 })
    }
    
    if (!lesson) {
      console.error('No lesson returned after insert')
      return NextResponse.json({ error: 'Failed to create lesson - no data returned' }, { status: 500 })
    }

    console.log('Lesson created successfully:', lesson.id)
    return NextResponse.json({ 
      lesson,
      message: 'Lesson created successfully' 
    })
  } catch (error: any) {
    console.error('Lessons POST error:', error)
    return NextResponse.json({ 
      error: `Server error: ${error?.message || 'Unknown error'}` 
    }, { status: 500 })
  }
}

