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
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN
    
    if (!apiToken) {
      console.error('[TTS] REPLICATE_API_TOKEN not configured')
      return NextResponse.json(
        { error: 'TTS service not configured. Add REPLICATE_API_TOKEN.' },
        { status: 503 }
      )
    }

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

    console.log(`[TTS] Generating: "${trimmedText.substring(0, 50)}..." (${language}, ${voiceId})`)

    const replicate = new Replicate({ auth: apiToken })

    // Run MiniMax Speech-02-Turbo
    const output = await replicate.run(
      'minimax/speech-02-turbo',
      {
        input: {
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
      }
    )

    console.log('[TTS] Output:', output)

    // Output is a URI string
    if (!output || typeof output !== 'string') {
      console.error('[TTS] Invalid output:', output)
      return NextResponse.json(
        { error: 'Failed to generate audio' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      audioUrl: output,
      voiceId,
      language 
    })

  } catch (error: any) {
    console.error('[TTS] Error:', error.message)
    console.error('[TTS] Stack:', error.stack)
    
    return NextResponse.json(
      { error: error.message || 'Failed to generate speech' },
      { status: 500 }
    )
  }
}
