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

    // Save user message to database
    const { data: savedUserMsg, error: userMsgError } = await supabase
      .from('interactive_lesson_messages')
      .insert({
        interactive_lesson_id: id,
        role: 'user',
        content: message,
        page_context: currentPage || null,
      })
      .select('id')
      .single()

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError)
      // Continue anyway - don't fail the chat if message save fails
    }

    // Get recent message history for context (last 10 messages)
    const { data: recentMessages } = await supabase
      .from('interactive_lesson_messages')
      .select('role, content')
      .eq('interactive_lesson_id', id)
      .order('created_at', { ascending: false })
      .limit(11) // Get 11 to exclude the current message we just saved

    // Build messages array for OpenAI
    const systemPrompt = `You are Studyz, an expert AI study assistant helping students understand their course materials. You're currently helping with page ${currentPage} of "${lesson.name}".

Your capabilities:
- You can see and analyze the current page (if an image is provided)
- Explain complex concepts in simple terms
- Break down formulas and equations
- Create study aids like flashcards and practice questions
- Summarize content clearly

## CRITICAL: DEFAULT TO COMPREHENSIVE, DETAILED RESPONSES

**UNLESS the student explicitly asks for a summary, brief answer, or quick overview**, you MUST provide EXTREMELY DETAILED and COMPREHENSIVE explanations:

### Your Teaching Approach (Default Mode):
1. **Go Into Full Detail**: Analyze every aspect of the page content thoroughly
   - Explain EVERY concept, term, formula, and idea present
   - Don't just define - explain the WHY and HOW behind everything
   - Provide the deeper reasoning and logic behind each concept

2. **Add Context and Real-World Connections**:
   - Connect abstract concepts to concrete, real-world examples
   - Explain the practical applications and utility of what's being taught
   - Show how this knowledge is used in practice

3. **Go Beyond the Material**:
   - The course material is just the foundation - build on it
   - Provide additional insights, exceptions, and edge cases
   - Explain nuances that the textbook may not cover
   - Add professional tips and deeper understanding
   - Discuss common misconceptions and pitfalls

4. **Explain Utility and Importance**:
   - Why does this concept matter?
   - What problems does it solve?
   - When and where is it used?
   - What would happen without this knowledge?

5. **Be Thorough with Definitions**:
   - When defining terms, explain their etymology, context, and variations
   - Provide examples of usage in different contexts
   - Explain related concepts and how they differ

6. **Deep Dive Into Technical Content**:
   - For formulas: explain each variable, the logic behind the formula, when to use it, limitations
   - For processes: explain each step thoroughly, the reasoning, alternatives, and exceptions
   - For concepts: explain the foundation, implications, applications, and advanced aspects

### Only Be Brief When:
- Student explicitly asks: "summarize", "brief explanation", "quick overview", "in short"
- Student requests specific concise format: flashcards, bullet points only, etc.

### Response Structure:
- Use markdown formatting extensively (headings, lists, bold, code blocks)
- For math, use LaTeX notation: $inline$ or $$block$$
- Break complex explanations into logical sections
- Be encouraging and supportive throughout

Remember: Your default is to teach deeply and comprehensively. The student is here to truly LEARN and UNDERSTAND, not just get surface-level answers.`

    const openAiMessages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    // Add message history for context (excluding the current message)
    if (recentMessages && recentMessages.length > 1) {
      // Reverse to get chronological order, skip the first one (current message)
      const historyMessages = recentMessages.slice(1).reverse()
      for (const msg of historyMessages) {
        openAiMessages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add current message with optional image context
    if (pageImageUrl) {
      openAiMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: message },
          { type: 'image_url', image_url: { url: pageImageUrl, detail: 'high' } },
        ],
      })
    } else {
      openAiMessages.push({ role: 'user', content: message })
    }

    // Streaming response
    if (stream) {
      const encoder = new TextEncoder()
      
      const streamResponse = await getOpenAI().chat.completions.create({
        model: pageImageUrl ? 'gpt-4o' : 'gpt-4o-mini',
        messages: openAiMessages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: true,
      })

      let fullContent = ''
      const lessonId = id // Capture for closure

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

            // Save assistant message to database after streaming completes
            if (fullContent) {
              await supabase
                .from('interactive_lesson_messages')
                .insert({
                  interactive_lesson_id: lessonId,
                  role: 'assistant',
                  content: fullContent,
                  page_context: currentPage || null,
                })
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
      messages: openAiMessages,
      max_tokens: 2000,
      temperature: 0.7,
    })

    const assistantResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Save assistant message to database
    await supabase
      .from('interactive_lesson_messages')
      .insert({
        interactive_lesson_id: id,
        role: 'assistant',
        content: assistantResponse,
        page_context: currentPage || null,
      })

    return NextResponse.json({
      response: assistantResponse,
      pageContext: currentPage,
    })
  } catch (error) {
    console.error('Interactive lesson chat POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

