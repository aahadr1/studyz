import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

export const runtime = 'nodejs'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Voice mapping for languages
const VOICES = {
  en: {
    male: 'English_CaptivatingStoryteller',
    female: 'English_FriendlyPerson',
  },
  fr: {
    male: 'French_MaleNarrator',
    female: 'French_Female_News Anchor',
  },
}

export async function POST(request: NextRequest) {
  try {
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

    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text exceeds maximum length of 10,000 characters' },
        { status: 400 }
      )
    }

    // Get the appropriate voice based on language and preference
    const voiceId = VOICES[language as keyof typeof VOICES]?.[voice as keyof typeof VOICES.en] 
      || VOICES.en.male

    // Language boost mapping
    const languageBoost = language === 'fr' ? 'French' : 'English'

    console.log(`[TTS] Generating speech: ${text.substring(0, 50)}... (${language}, ${voiceId})`)

    const output = await replicate.run(
      'minimax/speech-02-turbo',
      {
        input: {
          text: text,
          voice_id: voiceId,
          speed: speed,
          emotion: emotion,
          language_boost: languageBoost,
          sample_rate: 32000,
          bitrate: 128000,
          audio_format: 'mp3',
          channel: 'mono',
          english_normalization: language === 'en',
        }
      }
    )

    console.log('[TTS] Generated audio URL:', output)

    return NextResponse.json({ 
      audioUrl: output,
      voiceId,
      language 
    })

  } catch (error: any) {
    console.error('[TTS] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate speech' },
      { status: 500 }
    )
  }
}

