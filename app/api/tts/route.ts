import { NextRequest, NextResponse } from 'next/server'

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

// Cache for model version
let cachedVersion: string | null = null

async function getLatestVersion(apiToken: string): Promise<string> {
  if (cachedVersion) return cachedVersion

  try {
    const response = await fetch('https://api.replicate.com/v1/models/minimax/speech-02-turbo', {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    })
    
    if (response.ok) {
      const data = await response.json()
      cachedVersion = data.latest_version?.id
      if (cachedVersion) {
        console.log('[TTS] Latest version:', cachedVersion)
        return cachedVersion
      }
    }
  } catch (err) {
    console.error('[TTS] Failed to get latest version:', err)
  }

  // Fallback to known working version
  return '0544d2d437c9fdce5a5cf43a06b29f4df8a2c0bfef97f5c7f85a1f0c55b5eb06'
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN
    
    if (!apiToken) {
      return NextResponse.json(
        { error: 'TTS not configured. Set REPLICATE_API_TOKEN.' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { 
      text, 
      language = 'en', 
      voice = 'male',
    } = body

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const trimmedText = text.trim().substring(0, 10000)
    const voiceId = VOICES[language as keyof typeof VOICES]?.[voice as keyof typeof VOICES.en] || VOICES.en.male
    const languageBoost = language === 'fr' ? 'French' : 'English'

    console.log(`[TTS] Starting: "${trimmedText.substring(0, 40)}..." voice=${voiceId}`)

    // Get latest version
    const version = await getLatestVersion(apiToken)

    // Create prediction with VERSION (not model)
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: version,  // Use version, not model!
        input: {
          text: trimmedText,
          voice_id: voiceId,
          speed: 1,
          emotion: 'auto',
          pitch: 0,
          volume: 1,
          sample_rate: 32000,
          bitrate: 128000,
          audio_format: 'mp3',
          channel: 'mono',
          language_boost: languageBoost,
          english_normalization: language === 'en',
        }
      })
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('[TTS] Create failed:', createResponse.status, errorText)
      return NextResponse.json(
        { error: `Replicate error ${createResponse.status}`, details: errorText },
        { status: createResponse.status }
      )
    }

    let prediction = await createResponse.json()
    console.log('[TTS] Created:', prediction.id, prediction.status)

    // Poll for completion (max 60 seconds)
    let attempts = 0
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 60) {
      await new Promise(r => setTimeout(r, 1000))
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      })
      
      prediction = await pollResponse.json()
      attempts++
      
      if (attempts % 5 === 0) {
        console.log(`[TTS] Poll ${attempts}/60: ${prediction.status}`)
      }
    }

    if (prediction.status === 'failed') {
      console.error('[TTS] Failed:', prediction.error)
      return NextResponse.json(
        { error: prediction.error || 'TTS generation failed' },
        { status: 500 }
      )
    }

    if (!prediction.output) {
      console.error('[TTS] No output after', attempts, 'seconds')
      return NextResponse.json(
        { error: 'TTS timed out or no output' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    console.log(`[TTS] Success in ${duration}ms:`, String(prediction.output).substring(0, 80))

    return NextResponse.json({ 
      audioUrl: prediction.output,
      voiceId,
      language,
      duration 
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[TTS] Error after ${duration}ms:`, error.message)
    return NextResponse.json(
      { error: error.message || 'TTS failed' },
      { status: 500 }
    )
  }
}
