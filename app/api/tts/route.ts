import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

export const runtime = 'nodejs'
export const maxDuration = 60

// MiniMax Speech-02-Turbo Voice IDs
const VOICES = {
  en: {
    male: 'English_CaptivatingStoryteller',
    female: 'English_ConfidentWoman',
  },
  fr: {
    male: 'French_MaleNarrator',
    female: 'French_Female_News Anchor',
  },
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN
    
    if (!apiToken) {
      console.error('[TTS] REPLICATE_API_TOKEN not configured')
      return NextResponse.json(
        { error: 'TTS service not configured. Add REPLICATE_API_TOKEN to environment variables.' },
        { status: 503 }
      )
    }

    console.log('[TTS] Token found, length:', apiToken.length)

    const body = await request.json()
    const { 
      text, 
      language = 'en', 
      voice = 'male',
      speed = 1,
      emotion = 'auto'
    } = body

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    // Limit text to 10000 chars (MiniMax limit)
    const trimmedText = text.trim().substring(0, 10000)

    // Get voice ID
    const voiceId = VOICES[language as keyof typeof VOICES]?.[voice as keyof typeof VOICES.en] 
      || VOICES.en.male

    // Language boost
    const languageBoost = language === 'fr' ? 'French' : 'English'

    console.log(`[TTS] Request: text="${trimmedText.substring(0, 50)}..." lang=${language} voice=${voiceId}`)

    const replicate = new Replicate({ auth: apiToken })

    const input = {
      text: trimmedText,
      voice_id: voiceId,
      speed: speed,
      emotion: emotion,
      pitch: 0,
      volume: 1,
      sample_rate: 32000,
      bitrate: 128000,
      audio_format: 'mp3',
      channel: 'mono',
      language_boost: languageBoost,
      english_normalization: language === 'en',
    }

    console.log('[TTS] Calling Replicate with input:', JSON.stringify(input, null, 2))

    // Run MiniMax Speech-02-Turbo
    const output = await replicate.run(
      'minimax/speech-02-turbo',
      { input }
    )

    const duration = Date.now() - startTime
    console.log(`[TTS] Replicate response (${duration}ms):`, typeof output, output)

    // Output should be a URI string
    let audioUrl: string

    if (typeof output === 'string') {
      audioUrl = output
    } else if (output && typeof output === 'object') {
      // Sometimes it might return an object with the URL
      const obj = output as Record<string, unknown>
      if (obj.url && typeof obj.url === 'string') {
        audioUrl = obj.url
      } else if (obj.output && typeof obj.output === 'string') {
        audioUrl = obj.output
      } else {
        console.error('[TTS] Unexpected output format:', JSON.stringify(output))
        return NextResponse.json(
          { error: 'Unexpected response format from TTS service', details: JSON.stringify(output) },
          { status: 500 }
        )
      }
    } else {
      console.error('[TTS] Invalid output type:', typeof output, output)
      return NextResponse.json(
        { error: 'Invalid response from TTS service' },
        { status: 500 }
      )
    }

    console.log(`[TTS] Success! Audio URL: ${audioUrl.substring(0, 100)}...`)

    return NextResponse.json({ 
      audioUrl,
      voiceId,
      language,
      duration 
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[TTS] Error after ${duration}ms:`, error)
    console.error('[TTS] Error name:', error.name)
    console.error('[TTS] Error message:', error.message)
    console.error('[TTS] Error stack:', error.stack)
    
    // Check if it's a Replicate API error
    if (error.response) {
      console.error('[TTS] Replicate response status:', error.response.status)
      console.error('[TTS] Replicate response data:', error.response.data)
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate speech',
        name: error.name,
        duration
      },
      { status: 500 }
    )
  }
}
