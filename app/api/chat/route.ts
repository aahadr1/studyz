import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const {
      message,
      documentId,
      pageNumber,
      lessonId,
      conversationHistory,
    } = await request.json()

    if (!message || !documentId || !pageNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get the page image URL
    const { data: pageData, error: pageError } = await supabase
      .from('document_pages')
      .select('image_path')
      .eq('document_id', documentId)
      .eq('page_number', pageNumber)
      .single()

    if (pageError) {
      return NextResponse.json(
        { error: 'Page not found or not yet processed' },
        { status: 404 }
      )
    }

    // Get public URL for the image
    const { data: urlData } = supabase.storage
      .from('document-pages')
      .getPublicUrl(pageData.image_path)

    const imageUrl = urlData.publicUrl

    // Prepare conversation history for OpenAI
    const messages: any[] = [
      {
        role: 'system',
        content: `You are Studyz Guy, a friendly and helpful AI study assistant. You are helping a student understand their study materials. You can see the page image the student is currently viewing (Page ${pageNumber}). 

Your role is to:
- Answer questions about the content visible in the page image
- Explain concepts clearly and concisely
- Provide examples and clarifications when needed
- Be encouraging and supportive
- Reference specific elements from the page image when relevant

Always be helpful, patient, and educational in your responses.`,
      },
    ]

    // Add conversation history (limit to last 10 messages for context)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10)
      messages.push(...recentHistory)
    }

    // Add current message with the page image
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message,
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: 'high',
          },
        },
      ],
    })

    // Call OpenAI API with vision
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    })

    const assistantResponse = completion.choices[0]?.message?.content || 
      'Sorry, I could not generate a response.'

    return NextResponse.json({
      response: assistantResponse,
      pageNumber,
      documentId,
    })
  } catch (error: any) {
    console.error('Error in chat API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process chat request' },
      { status: 500 }
    )
  }
}

