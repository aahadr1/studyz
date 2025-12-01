import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

export const runtime = 'nodejs'
export const maxDuration = 60 // Allow up to 60s for TTS generation

// Initialize Replicate client
function getReplicateClient() {
  const token = process.env.REPLICATE_API_TOKEN
  
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN is not configured')
  }
  
  return new Replicate({ auth: token })
}

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
    // Check for API token first
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('[TTS] REPLICATE_API_TOKEN not configured')
      return NextResponse.json(
        { error: 'Text-to-speech service not configured. Please add REPLICATE_API_TOKEN to environment variables.' },
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

    const replicate = getReplicateClient()
    
    const output = await replicate.run(
      'minimax/speech-02-turbo:4e10f48f00474b07a45e0c50eba1c54ba34a6b22c2e88c5f2da993fd83e3c9b1',
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

    // Ensure we have a valid URL
    if (!output || typeof output !== 'string') {
      throw new Error('Invalid audio URL returned from TTS service')
    }

    return NextResponse.json({ 
      audioUrl: output,
      voiceId,
      language 
    })

  } catch (error: any) {
    console.error('[TTS] Error:', error)
    console.error('[TTS] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate speech',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

