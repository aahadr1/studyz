import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

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
        const extractionCompletion = await getOpenAI().chat.completions.create({
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

## CRITICAL: PROVIDE DETAILED VOICE EXPLANATIONS

**UNLESS the student explicitly asks for a brief answer or summary**, provide COMPREHENSIVE and DETAILED explanations optimized for voice:

### Your Teaching Approach:
1. **Explain Thoroughly**: Cover the concept in complete detail
   - Explain the WHY and HOW, not just the WHAT
   - Break down complex ideas into understandable parts
   - Provide context and real-world connections

2. **Go Beyond the Material**:
   - Add insights and deeper understanding beyond what's written
   - Explain practical applications and utility
   - Discuss exceptions, edge cases, and common misconceptions
   - Connect to related concepts

3. **Voice-Optimized Delivery**:
   - Use natural, conversational language
   - Structure explanations with clear transitions
   - Use phrases like "let me explain", "here's why", "the key point is"
   - Maintain an engaging, encouraging tone

4. **Be Comprehensive Yet Clear**:
   - Cover all aspects of the question thoroughly
   - Use examples and analogies to clarify
   - Reference specific parts of the page content
   - Make connections between different concepts

### Only Be Brief When:
- Student explicitly says: "briefly", "quick answer", "summarize", "in short"

Remember: Voice allows for rich, detailed explanations. Students want to truly understand - teach them deeply and comprehensively.`,
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
    
    const completion = await getOpenAI().chat.completions.create({
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

