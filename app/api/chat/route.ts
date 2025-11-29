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
      documentId,
      pageNumber,
      lessonId,
      conversationHistory,
      pageText, // Text content from the page
    } = await request.json()

    if (!message || !pageNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log(`💬 Chat request for page ${pageNumber}`)

    // Build system prompt with page context
    const systemPrompt = pageText
      ? `You are Studyz Guy, a friendly AI study assistant. The student is viewing Page ${pageNumber}.

=== PAGE CONTENT ===
${pageText}
=== END PAGE CONTENT ===

Help the student understand this content. Be concise, clear, and educational.`
      : `You are Studyz Guy, a friendly AI study assistant helping with Page ${pageNumber}. Be concise and helpful.`

    // Build messages
    const messages: any[] = [{ role: 'system', content: systemPrompt }]

    // Add history (last 10)
    if (conversationHistory?.length > 0) {
      messages.push(...conversationHistory.slice(-10))
    }

    // Add current message
    messages.push({ role: 'user', content: message })

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content || 'Sorry, I could not respond.'

    return NextResponse.json({
      response,
      pageNumber,
      documentId,
      hasContext: !!pageText,
    })
  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    )
  }
}
