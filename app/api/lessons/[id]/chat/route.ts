import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { chatWithPageContext, ChatMessage } from '@/lib/openai'

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

// POST /api/lessons/[id]/chat - Send a message to the AI assistant
export async function POST(
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

    // Parse request body
    const { message, currentPage } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get the current page image URL
    let pageImageUrl: string | undefined
    if (currentPage) {
      const { data: page } = await supabase
        .from('lesson_pages')
        .select('image_url')
        .eq('lesson_id', id)
        .eq('page_number', currentPage)
        .single()

      if (page) {
        pageImageUrl = page.image_url
      }
    }

    // Get previous messages for context (limit to last 10 for token efficiency)
    const { data: previousMessages } = await supabase
      .from('lesson_messages')
      .select('role, content')
      .eq('lesson_id', id)
      .order('created_at', { ascending: true })
      .limit(10)

    const chatHistory: ChatMessage[] = (previousMessages || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Save user message
    await supabase.from('lesson_messages').insert({
      lesson_id: id,
      role: 'user',
      content: message,
      page_context: currentPage || null,
    })

    // Call OpenAI with the page image context
    const assistantResponse = await chatWithPageContext(
      chatHistory,
      message,
      pageImageUrl
    )

    // Save assistant message
    await supabase.from('lesson_messages').insert({
      lesson_id: id,
      role: 'assistant',
      content: assistantResponse,
      page_context: currentPage || null,
    })

    return NextResponse.json({
      response: assistantResponse,
      pageContext: currentPage,
    })
  } catch (error) {
    console.error('Chat POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

