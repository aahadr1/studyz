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
      console.error('❌ OpenAI API key not configured')
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    let requestData
    try {
      requestData = await request.json()
      console.log('📥 Request received:', { 
        pageNumber: requestData.pageNumber,
        hasImageData: !!requestData.pageImageData,
        imageDataLength: requestData.pageImageData?.length || 0
      })
    } catch (parseError: any) {
      console.error('❌ Failed to parse request JSON:', parseError)
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { pageNumber, pageImageData, feature = 'general' } = requestData

    if (!pageNumber) {
      console.error('❌ Missing pageNumber in request')
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
    console.log(`🔑 STEP 2: Creating Realtime API session (${feature} mode) with ${pageContext ? 'page context' : 'no context'}...`)
    
    // Generate instructions based on feature mode
    const getInstructions = () => {
      const baseContext = pageContext 
        ? `=== CURRENT PAGE CONTEXT (Page ${pageNumber}) ===
${pageContext}
=== END OF PAGE CONTEXT ===

` : ''

      const featureInstructions: { [key: string]: string } = {
        explain: `${baseContext}You are Studyz Guy, a patient AI tutor. Your job is to EXPLAIN concepts from this page in detail.
- Break down complex ideas into simple terms
- Use analogies and examples
- Ask if the student understood before moving on
- Keep responses conversational and under 4-5 sentences
- Reference specific parts of page ${pageNumber} when explaining`,

        summarize: `${baseContext}You are Studyz Guy, a summarization expert. Your job is to SUMMARIZE content from this page.
- Create concise, clear summaries
- Highlight the most important points
- Use bullet-point style when listing multiple items
- Keep summaries brief (2-3 sentences for voice)
- Always mention this is from page ${pageNumber}`,

        quiz: `${baseContext}You are Studyz Guy, a quiz master. Your job is to QUIZ the student on this page's content.
- Ask one question at a time
- Wait for their answer before revealing if it's correct
- Give encouraging feedback
- Explain the correct answer if they're wrong
- Make questions based on key concepts from page ${pageNumber}`,

        keypoints: `${baseContext}You are Studyz Guy, a study guide creator. Your job is to identify KEY POINTS from this page.
- List the 3-5 most important concepts
- Keep each point concise
- Explain why each point matters
- Reference page ${pageNumber} in your response`,

        general: `${baseContext}You are Studyz Guy, a friendly AI study assistant helping students through voice conversation.
- Answer questions about page ${pageNumber}
- Explain concepts clearly and conversationally
- Keep responses concise for voice (under 4 sentences)
- Be encouraging and supportive
- Reference specific parts of the page when relevant`
      }

      return featureInstructions[feature] || featureInstructions.general
    }
    
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions: getInstructions(),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ STEP 2 failed with status:', response.status)
      console.error('❌ Error response:', errorText)
      
      let error
      try {
        error = JSON.parse(errorText)
      } catch {
        error = { error: errorText }
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to generate session token', 
          details: error,
          status: response.status 
        },
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
    console.error('Error stack:', error.stack)
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: error.toString(),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
