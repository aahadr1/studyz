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
      console.error('[TTS] REPLICATE_API_TOKEN not set')
      return NextResponse.json(
        { error: 'TTS not configured. Set REPLICATE_API_TOKEN in Vercel.' },
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
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const trimmedText = text.trim().substring(0, 10000)
    const voiceId = VOICES[language as keyof typeof VOICES]?.[voice as keyof typeof VOICES.en] || VOICES.en.male
    const languageBoost = language === 'fr' ? 'French' : 'English'

    console.log(`[TTS] Starting: "${trimmedText.substring(0, 40)}..." voice=${voiceId}`)

    // Create prediction using Replicate API directly
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'  // Wait for result synchronously
      },
      body: JSON.stringify({
        model: 'minimax/speech-02-turbo',
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
      })
    })

    const createData = await createResponse.json()
    console.log('[TTS] Create response:', createResponse.status, JSON.stringify(createData).substring(0, 200))

    if (!createResponse.ok) {
      return NextResponse.json(
        { error: createData.detail || createData.error || 'Replicate API error', status: createResponse.status },
        { status: 500 }
      )
    }

    // If using 'Prefer: wait', the output should be ready
    let output = createData.output

    // If not ready, poll for completion
    if (!output && createData.status !== 'succeeded' && createData.urls?.get) {
      console.log('[TTS] Polling for result...')
      
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000))
        
        const pollResponse = await fetch(createData.urls.get, {
          headers: { 'Authorization': `Bearer ${apiToken}` }
        })
        const pollData = await pollResponse.json()
        
        console.log(`[TTS] Poll ${i + 1}: status=${pollData.status}`)
        
        if (pollData.status === 'succeeded') {
          output = pollData.output
          break
        } else if (pollData.status === 'failed') {
          return NextResponse.json(
            { error: pollData.error || 'TTS generation failed' },
            { status: 500 }
          )
        }
      }
    }

    if (!output) {
      return NextResponse.json(
        { error: 'TTS timed out or no output' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    console.log(`[TTS] Done in ${duration}ms: ${String(output).substring(0, 80)}...`)

    return NextResponse.json({ 
      audioUrl: output,
      voiceId,
      language,
      duration 
    })

  } catch (error: any) {
    console.error('[TTS] Error:', error.message, error.stack)
    return NextResponse.json(
      { error: error.message || 'TTS failed' },
      { status: 500 }
    )
  }
}
