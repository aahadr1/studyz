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

// POST /api/interactive-lessons/[id]/chat - Send a message to the AI assistant (with streaming support)
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

    // Verify interactive lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Interactive lesson not found' }, { status: 404 })
    }

    // Get the current page image URL from interactive_lesson_page_images
    let pageImageUrl: string | undefined
    if (currentPage) {
      // Get document first
      const { data: doc } = await supabase
        .from('interactive_lesson_documents')
        .select('id')
        .eq('interactive_lesson_id', id)
        .eq('category', 'lesson')
        .single()

      if (doc) {
        const { data: pageImage } = await supabase
          .from('interactive_lesson_page_images')
          .select('image_path')
          .eq('document_id', doc.id)
          .eq('page_number', currentPage)
          .single()

        if (pageImage) {
          // Check if it's already a full URL or needs signed URL
          if (pageImage.image_path.startsWith('http://') || pageImage.image_path.startsWith('https://')) {
            pageImageUrl = pageImage.image_path
          } else {
            const { data: signedUrl } = await supabase.storage
              .from('interactive-lessons')
              .createSignedUrl(pageImage.image_path, 3600)
            pageImageUrl = signedUrl?.signedUrl
          }
        }
      }
    }

    // For interactive lessons, we'll store messages in lesson_messages with the interactive lesson id
    // Or we could create a separate table - for now, let's just not persist messages for interactive lessons
    // and focus on getting the chat working

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

    return NextResponse.json({
      response: assistantResponse,
      pageContext: currentPage,
    })
  } catch (error) {
    console.error('Interactive lesson chat POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

