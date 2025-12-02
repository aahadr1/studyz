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

// GET /api/lessons/[id] - Get a specific lesson with pages and messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Fetch lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Fetch pages
    const { data: pages, error: pagesError } = await supabase
      .from('lesson_pages')
      .select('*')
      .eq('lesson_id', id)
      .order('page_number', { ascending: true })

    if (pagesError) {
      console.error('Error fetching pages:', pagesError)
    }

    // Fetch messages
    const { data: messages, error: messagesError } = await supabase
      .from('lesson_messages')
      .select('*')
      .eq('lesson_id', id)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching messages:', messagesError)
    }

    return NextResponse.json({
      lesson,
      pages: pages || [],
      messages: messages || [],
    })
  } catch (error) {
    console.error('Lesson GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/lessons/[id] - Delete a lesson
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Check ownership
    const { data: lesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Delete storage files
    const folderPath = `${user.id}/${id}`
    
    // List and delete all files in the lesson folder
    const { data: docFiles } = await supabase.storage
      .from('lesson-documents')
      .list(folderPath)
    
    if (docFiles && docFiles.length > 0) {
      await supabase.storage
        .from('lesson-documents')
        .remove(docFiles.map(f => `${folderPath}/${f.name}`))
    }

    const { data: pageFiles } = await supabase.storage
      .from('lesson-pages')
      .list(folderPath)
    
    if (pageFiles && pageFiles.length > 0) {
      await supabase.storage
        .from('lesson-pages')
        .remove(pageFiles.map(f => `${folderPath}/${f.name}`))
    }

    // Delete lesson (cascades to pages and messages)
    const { error: deleteError } = await supabase
      .from('lessons')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting lesson:', deleteError)
      return NextResponse.json({ error: 'Failed to delete lesson' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Lesson deleted successfully' })
  } catch (error) {
    console.error('Lesson DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


