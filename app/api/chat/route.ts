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
      pageImageData, // Base64 image data from frontend
    } = await request.json()

    if (!message || !pageNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    let imageUrl = null

    // Try to use the page image data sent from frontend first
    if (pageImageData) {
      imageUrl = pageImageData
      const sizeKB = Math.round(pageImageData.length / 1024)
      console.log(`✅ Using page image from frontend - Page ${pageNumber}, Size: ${sizeKB}KB`)
    } else if (documentId) {
      console.log('⚠️ No page image from frontend, trying database fallback...')
      // Fallback: try to get from document_pages table
      const { data: pageData, error: pageError } = await supabase
        .from('document_pages')
        .select('image_path')
        .eq('document_id', documentId)
        .eq('page_number', pageNumber)
        .single()

      if (!pageError && pageData) {
        const { data: urlData } = supabase.storage
          .from('document-pages')
          .getPublicUrl(pageData.image_path)
        imageUrl = urlData.publicUrl
      }
    }

    // Prepare conversation history for OpenAI
    const messages: any[] = [
      {
        role: 'system',
        content: imageUrl 
          ? `You are Studyz Guy, a friendly and helpful AI study assistant. You are helping a student understand their study materials. You can see the page image the student is currently viewing (Page ${pageNumber}). 

Your role is to:
- Answer questions about the content visible in the page image
- Explain concepts clearly and concisely
- Provide examples and clarifications when needed
- Be encouraging and supportive
- Reference specific elements from the page image when relevant

Always be helpful, patient, and educational in your responses.`
          : `You are Studyz Guy, a friendly and helpful AI study assistant. You are helping a student understand their study materials on Page ${pageNumber}. 

Your role is to:
- Answer questions about the student's study materials
- Explain concepts clearly and concisely
- Provide examples and clarifications when needed
- Be encouraging and supportive
- Help with general study-related questions

Always be helpful, patient, and educational in your responses.`,
      },
    ]

    // Add conversation history (limit to last 10 messages for context)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10)
      messages.push(...recentHistory)
    }

    // Add current message with the page image (if available)
    if (imageUrl) {
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
    } else {
      // Text-only mode if no image available
      messages.push({
        role: 'user',
        content: message,
      })
    }

    // Call OpenAI API
    // Use gpt-4o for vision when image available, gpt-4o-mini for text-only
    const model = imageUrl ? 'gpt-4o' : 'gpt-4o-mini'
    console.log(`🤖 Calling OpenAI ${model} (${imageUrl ? 'WITH' : 'WITHOUT'} visual context)`)
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    })

    const assistantResponse = completion.choices[0]?.message?.content || 
      'Sorry, I could not generate a response.'

    console.log('✅ GPT response generated successfully')

    return NextResponse.json({
      response: assistantResponse,
      pageNumber,
      documentId,
      hasVisualContext: !!imageUrl, // Let frontend know if GPT saw the image
    })
  } catch (error: any) {
    console.error('Error in chat API:', error)
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      type: error.type,
    })
    
    // Provide more specific error messages
    let errorMessage = 'Failed to process chat request'
    if (error.message?.includes('API key')) {
      errorMessage = 'OpenAI API key is missing or invalid. Please check your environment variables.'
    } else if (error.message?.includes('quota')) {
      errorMessage = 'OpenAI API quota exceeded. Please check your OpenAI account.'
    } else if (error.message?.includes('model')) {
      errorMessage = 'The AI model is not available. This might be a temporary issue.'
    }
    
    return NextResponse.json(
      { error: error.message || errorMessage },
      { status: 500 }
    )
  }
}

