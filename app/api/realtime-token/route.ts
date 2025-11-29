import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const { pageNumber, pageText, feature = 'general' } = await request.json()

    if (!pageNumber) {
      return NextResponse.json({ error: 'Missing pageNumber' }, { status: 400 })
    }

    console.log(`🎫 Creating Realtime session for page ${pageNumber}`)

    // Build instructions with page context
    const baseContext = pageText
      ? `=== PAGE ${pageNumber} CONTENT ===
${pageText}
=== END CONTENT ===

`
      : ''

    const instructions: { [key: string]: string } = {
      explain: `${baseContext}You are Studyz Guy. EXPLAIN concepts from page ${pageNumber}. Be clear, use examples, keep responses short (4-5 sentences).`,
      summarize: `${baseContext}You are Studyz Guy. SUMMARIZE page ${pageNumber} content. Be concise (2-3 sentences).`,
      quiz: `${baseContext}You are Studyz Guy. QUIZ the student on page ${pageNumber}. One question at a time, give feedback.`,
      keypoints: `${baseContext}You are Studyz Guy. List 3-5 KEY POINTS from page ${pageNumber}.`,
      general: `${baseContext}You are Studyz Guy, a friendly voice study assistant for page ${pageNumber}. Be concise and helpful.`,
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
        instructions: instructions[feature] || instructions.general,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Realtime API error:', err)
      return NextResponse.json({ error: 'Failed to create session' }, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      clientSecret: data.value,
      expiresAt: data.expires_at,
      hasPageContext: !!pageText,
    })
  } catch (error: any) {
    console.error('Token error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
