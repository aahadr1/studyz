import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const {
      message,
      pageNumber,
      pageImageData, // Base64 image from canvas
      conversationHistory,
    } = await request.json()

    if (!message || !pageNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log('🎙️ Voice chat request for page', pageNumber)

    // Step 1: Extract text from page image using GPT-4o-mini (cheaper and fast)
    let pageContext = ''
    
    if (pageImageData) {
      console.log('📄 Extracting text from page image...')
      
      try {
        const extractionCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a text extraction assistant. Extract ALL text content from the provided image. Include headings, paragraphs, bullet points, formulas, and any other text visible. Preserve the structure and formatting as much as possible. If there are diagrams or charts, describe them briefly.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this document page:',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: pageImageData,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0,
        })

        pageContext = extractionCompletion.choices[0]?.message?.content || ''
        console.log('✅ Page text extracted:', pageContext.substring(0, 100) + '...')
        
      } catch (extractError: any) {
        console.error('⚠️ Failed to extract page text:', extractError.message)
        pageContext = '[Could not extract text from page]'
      }
    }

    // If this is just a text extraction request, return the context
    if (message === 'EXTRACT_TEXT_ONLY') {
      return NextResponse.json({
        pageContext,
        pageNumber,
      })
    }

    // Step 2: Prepare conversation for voice assistant
    const messages: any[] = [
      {
        role: 'system',
        content: `You are Studyz Guy, a friendly voice-based AI study assistant. You are helping a student understand their study materials through voice conversation.

CURRENT PAGE CONTEXT (Page ${pageNumber}):
${pageContext ? `\n${pageContext}\n` : '[No page context available]'}

Your role is to:
- Answer questions about the content shown above from Page ${pageNumber}
- Explain concepts clearly and conversationally (this is voice, not text)
- Keep responses concise and easy to understand when spoken aloud
- Be encouraging and supportive
- Reference specific parts of the page content when relevant

Important: Keep your responses under 3-4 sentences for voice conversations. Be natural and conversational.`,
      },
    ]

    // Add conversation history (limit to last 8 for voice to keep context manageable)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-8)
      messages.push(...recentHistory)
    }

    // Add current voice message
    messages.push({
      role: 'user',
      content: message,
    })

    // Step 3: Get AI response using gpt-4o-mini (fast and cost-effective for text)
    console.log('🤖 Calling OpenAI GPT-4o-mini for voice response')
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 300, // Keep responses shorter for voice
      temperature: 0.8, // Slightly more natural/conversational
    })

    const assistantResponse = completion.choices[0]?.message?.content || 
      'Sorry, I could not generate a response.'

    console.log('✅ Voice response generated')

    return NextResponse.json({
      response: assistantResponse,
      pageNumber,
      hasPageContext: !!pageContext,
    })
    
  } catch (error: any) {
    console.error('❌ Error in voice chat API:', error)
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      type: error.type,
    })
    
    let errorMessage = 'Failed to process voice chat request'
    if (error.message?.includes('API key')) {
      errorMessage = 'OpenAI API key is missing or invalid'
    } else if (error.message?.includes('quota')) {
      errorMessage = 'OpenAI API quota exceeded'
    } else if (error.message?.includes('model')) {
      errorMessage = 'AI model is not available'
    }
    
    return NextResponse.json(
      { error: error.message || errorMessage },
      { status: 500 }
    )
  }
}

