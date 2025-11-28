import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Generate ephemeral token for OpenAI Realtime API
 * This token is used to establish WebRTC connection
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

    // Get page context from request
    const { pageNumber, pageContext } = await request.json()

    console.log('🎫 Generating ephemeral token for Realtime API')

    // Call OpenAI to get ephemeral token
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-4o-realtime-preview-2024-12-17',
          audio: {
            output: {
              voice: 'alloy',
            },
          },
          instructions: `You are Studyz Guy, a friendly voice-based AI study assistant. You are helping a student understand their study materials through voice conversation.

${pageContext ? `=== CURRENT PAGE CONTEXT (Page ${pageNumber}) ===\n${pageContext}\n=== END OF PAGE CONTEXT ===\n\n` : ''}

Your role is to:
- Answer questions about the content from Page ${pageNumber}${pageContext ? ' shown above' : ''}
- Explain concepts clearly and conversationally
- Keep responses concise and natural for voice (under 3-4 sentences)
- Be encouraging and supportive
- Reference specific parts of the page content when relevant

${pageContext ? 'IMPORTANT: The content between the === markers is what the student is currently viewing. Use it to answer their questions accurately.' : 'Always be helpful, patient, and educational in your responses.'}`,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('❌ Failed to get ephemeral token:', error)
      return NextResponse.json(
        { error: 'Failed to generate session token' },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('✅ Ephemeral token generated')

    return NextResponse.json({
      clientSecret: data.value,
      expiresAt: data.expires_at,
    })

  } catch (error: any) {
    console.error('❌ Error generating realtime token:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

