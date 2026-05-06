import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

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

export async function POST(request: NextRequest) {
  try {
    const { message, documentId, pageNumber, totalPages, pageImage } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Build the messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a helpful study assistant. The user is viewing page ${pageNumber} of ${totalPages} of a document. 
They can see the page content in the image. Help them understand the material, answer questions, and explain concepts.
Be concise and helpful. If the image is provided, use it to give accurate answers about what's on the page.`,
      },
    ]

    // If we have a page image, include it in the message
    if (pageImage && pageImage.startsWith('data:image')) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: pageImage,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: message,
          },
        ],
      })
    } else {
      // No image, just text
      messages.push({
        role: 'user',
        content: `[Viewing page ${pageNumber} of ${totalPages}]\n\n${message}`,
      })
    }

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
    })

    const reply = completion.choices[0]?.message?.content || 'No response'

    return NextResponse.json({ reply })
  } catch (error: any) {
    console.error('Chat vision error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    )
  }
}
