import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Generate ephemeral token for OpenAI Realtime API with page context
 * TWO-STEP PROCESS:
 * 1. Extract text from page image using GPT-4o-mini (OCR)
 * 2. Create Realtime API session with extracted text as context
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const { pageNumber, pageImageData } = await request.json()

    if (!pageNumber) {
      return NextResponse.json(
        { error: 'Missing pageNumber' },
        { status: 400 }
      )
    }

    console.log('🎫 Starting two-step process for Realtime API token')

    // ===== STEP 1: Extract text from page image using GPT-4o-mini =====
    let pageContext = ''
    
    if (pageImageData) {
      console.log(`📄 STEP 1: Extracting text from page ${pageNumber} using GPT-4o-mini...`)
      
      try {
        const extractionCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a text extraction assistant. Extract ALL text content from the provided document page image. Include: headings, paragraphs, bullet points, formulas, equations, captions, and any other visible text. Preserve the structure and formatting. If there are diagrams or charts, briefly describe them.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract all text from this document page ${pageNumber}:`,
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
        
        if (pageContext) {
          console.log(`✅ STEP 1 complete: Extracted ${pageContext.length} characters from page ${pageNumber}`)
          console.log(`📝 Preview: ${pageContext.substring(0, 200)}...`)
        } else {
          console.warn('⚠️ No text extracted from image')
        }
        
      } catch (extractError: any) {
        console.error('❌ STEP 1 failed:', extractError.message)
        pageContext = ''
      }
    } else {
      console.log('⚠️ No page image provided, skipping text extraction')
    }

    // ===== STEP 2: Create Realtime API session with extracted text =====
    console.log(`🔑 STEP 2: Creating Realtime API session with ${pageContext ? 'page context' : 'no context'}...`)
    
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions: pageContext 
          ? `You are Studyz Guy, a friendly voice-based AI study assistant helping a student understand their study materials through voice conversation.

=== CURRENT PAGE CONTEXT (Page ${pageNumber}) ===
${pageContext}
=== END OF PAGE CONTEXT ===

Your role is to:
- Answer questions about the content shown above from Page ${pageNumber}
- Explain concepts clearly and conversationally (this is voice, keep it natural)
- Keep responses concise for voice (2-4 sentences typically)
- Be encouraging and supportive
- Reference specific parts of the page content when relevant
- When the student asks "what's on this page" or "explain this page", refer to the content between the === markers above

CRITICAL: The content between the === PAGE CONTEXT === markers is exactly what the student is viewing right now on their screen. Use this content to answer their questions accurately. This is their study material.`
          : `You are Studyz Guy, a friendly voice-based AI study assistant helping a student understand their study materials on Page ${pageNumber}.

Your role is to:
- Help the student with their study materials
- Explain concepts clearly and conversationally  
- Keep responses concise for voice (2-4 sentences)
- Be encouraging and supportive

Always be helpful, patient, and educational.`,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('❌ STEP 2 failed:', error)
      return NextResponse.json(
        { error: 'Failed to generate session token', details: error },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('✅ STEP 2 complete: Ephemeral token generated')
    console.log('🎉 Two-step process complete!')

    return NextResponse.json({
      clientSecret: data.value,
      expiresAt: data.expires_at,
      hasPageContext: !!pageContext,
      pageContextLength: pageContext.length,
    })

  } catch (error: any) {
    console.error('❌ Error in two-step token generation:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
