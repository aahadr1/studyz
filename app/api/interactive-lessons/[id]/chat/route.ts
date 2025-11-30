import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
            // Called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}

// POST: Chat with AI about the current page
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { message, pageNumber, pageImageBase64 } = body

    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    if (!message || !pageImageBase64) {
      return NextResponse.json(
        { error: 'Message and page image are required' },
        { status: 400 }
      )
    }

    // Build the messages for OpenAI with vision
    const messages: any[] = [
      {
        role: 'system',
        content: `Tu es un assistant pédagogique qui aide les étudiants à comprendre leur cours. 
Tu as accès à l'image de la page du cours que l'étudiant est en train de consulter.
Réponds de manière claire, pédagogique et concise. Base tes réponses sur le contenu visible dans l'image de la page.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Je suis à la page ${pageNumber} du cours "${lesson.name}".\n\nMa question: ${message}`
          },
          {
            type: 'image_url',
            image_url: {
              url: pageImageBase64.startsWith('data:') 
                ? pageImageBase64 
                : `data:image/png;base64,${pageImageBase64}`
            }
          }
        ]
      }
    ]

    // Call OpenAI API with vision
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // or gpt-4-vision-preview
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content || 'Désolé, je n\'ai pas pu générer une réponse.'

    return NextResponse.json({
      reply,
      pageNumber,
    })

  } catch (error) {
    console.error('[CHAT] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json(
      { error: `Chat failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}

