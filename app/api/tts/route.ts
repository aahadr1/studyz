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

    // Create prediction - use model name, NOT version hash
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'minimax/speech-02-turbo',
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
        { error: `Replicate error: ${createResponse.status}`, details: errorText },
        { status: 500 }
      )
    }

    let prediction = await createResponse.json()
    console.log('[TTS] Created prediction:', prediction.id, prediction.status)

    // Poll for completion
    let attempts = 0
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 60) {
      await new Promise(r => setTimeout(r, 1000))
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      })
      
      prediction = await pollResponse.json()
      attempts++
      
      if (attempts % 5 === 0) {
        console.log(`[TTS] Poll ${attempts}: ${prediction.status}`)
      }
    }

    if (prediction.status === 'failed') {
      console.error('[TTS] Prediction failed:', prediction.error)
      return NextResponse.json(
        { error: prediction.error || 'TTS generation failed' },
        { status: 500 }
      )
    }

    if (!prediction.output) {
      console.error('[TTS] No output:', prediction)
      return NextResponse.json(
        { error: 'No audio generated' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    console.log(`[TTS] Done in ${duration}ms: ${String(prediction.output).substring(0, 80)}...`)

    return NextResponse.json({ 
      audioUrl: prediction.output,
      voiceId,
      language,
      duration 
    })

  } catch (error: any) {
    console.error('[TTS] Error:', error.message)
    return NextResponse.json(
      { error: error.message || 'TTS failed' },
      { status: 500 }
    )
  }
}
