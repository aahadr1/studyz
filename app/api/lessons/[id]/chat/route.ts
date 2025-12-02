import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

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

// Lazy initialization of OpenAI client
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return _openai
}

// POST /api/lessons/[id]/chat - Send a message to the AI assistant (with streaming support)
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
    const { message, currentPage, stream = false } = await request.json()

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

    // Build messages array for OpenAI
    const systemPrompt = `You are Studyz, an expert AI study assistant helping students understand their course materials. You're currently helping with page ${currentPage} of "${lesson.name}".

Your capabilities:
- You can see and analyze the current page (if an image is provided)
- Explain complex concepts in simple terms
- Break down formulas and equations
- Create study aids like flashcards and practice questions
- Summarize content clearly

Guidelines:
- Be concise but thorough
- Use markdown formatting for clarity (headings, lists, bold, code blocks)
- For math, use LaTeX notation: $inline$ or $$block$$
- When explaining, start with the key insight
- If asked to create flashcards or questions, format them clearly
- Be encouraging and supportive`

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    // Add previous conversation context
    if (previousMessages && previousMessages.length > 0) {
      for (const msg of previousMessages) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    }

    // Add current message with optional image context
    if (pageImageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: message },
          { type: 'image_url', image_url: { url: pageImageUrl, detail: 'high' } },
        ],
      })
    } else {
      messages.push({ role: 'user', content: message })
    }

    // Save user message
    await supabase.from('lesson_messages').insert({
      lesson_id: id,
      role: 'user',
      content: message,
      page_context: currentPage || null,
    })

    // Streaming response
    if (stream) {
      const encoder = new TextEncoder()
      
      const streamResponse = await getOpenAI().chat.completions.create({
        model: pageImageUrl ? 'gpt-4o' : 'gpt-4o-mini',
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: true,
      })

      let fullContent = ''

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const content = chunk.choices[0]?.delta?.content || ''
              if (content) {
                fullContent += content
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
              }
            }
            
            // Save the complete assistant message
            await supabase.from('lesson_messages').insert({
              lesson_id: id,
              role: 'assistant',
              content: fullContent,
              page_context: currentPage || null,
            })

            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch (error) {
            console.error('Stream error:', error)
            controller.error(error)
          }
        },
      })

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // Non-streaming response (fallback)
    const completion = await getOpenAI().chat.completions.create({
      model: pageImageUrl ? 'gpt-4o' : 'gpt-4o-mini',
      messages,
      max_tokens: 2000,
      temperature: 0.7,
    })

    const assistantResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

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
