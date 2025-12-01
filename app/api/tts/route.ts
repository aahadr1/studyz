import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// ElevenLabs voices (more reliable)
const ELEVENLABS_VOICES = {
  en: {
    male: 'TxGEqnHWrfWFTfGW9XjX', // Josh
    female: 'EXAVITQu4vr4xnSDxMaL', // Bella
  },
  fr: {
    male: 'onwK4e9ZLuTAKqWW03F9', // Daniel (multilingual)
    female: 'XrExE9yKIg1WjnnlVkGX', // Charlotte (multilingual)
  },
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      text, 
      language = 'en', 
      voice = 'male',
    } = body

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    // Limit text length
    const trimmedText = text.trim().substring(0, 5000)

    // Try ElevenLabs first if token is available
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY
    
    if (elevenLabsKey) {
      try {
        const voiceId = ELEVENLABS_VOICES[language as keyof typeof ELEVENLABS_VOICES]?.[voice as keyof typeof ELEVENLABS_VOICES.en] 
          || ELEVENLABS_VOICES.en.male

        console.log(`[TTS] Using ElevenLabs, voice: ${voiceId}, text: ${trimmedText.substring(0, 50)}...`)

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenLabsKey,
          },
          body: JSON.stringify({
            text: trimmedText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        })

        if (response.ok) {
          const audioBuffer = await response.arrayBuffer()
          const base64Audio = Buffer.from(audioBuffer).toString('base64')
          const dataUrl = `data:audio/mpeg;base64,${base64Audio}`
          
          console.log('[TTS] ElevenLabs success, audio length:', audioBuffer.byteLength)
          
          return NextResponse.json({ 
            audioUrl: dataUrl,
            provider: 'elevenlabs',
            language 
          })
        } else {
          const errorText = await response.text()
          console.error('[TTS] ElevenLabs error:', response.status, errorText)
        }
      } catch (elevenError: any) {
        console.error('[TTS] ElevenLabs failed:', elevenError.message)
      }
    }

    // Try Replicate minimax as fallback
    const replicateToken = process.env.REPLICATE_API_TOKEN
    
    if (replicateToken) {
      try {
        console.log(`[TTS] Using Replicate minimax, text: ${trimmedText.substring(0, 50)}...`)

        // Use fetch directly for more control
        const response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${replicateToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: '0544d2d437c9fdce5a5cf43a06b29f4df8a2c0bfef97f5c7f85a1f0c55b5eb06',
            input: {
              text: trimmedText,
              voice_id: language === 'fr' ? 'Friendly_Person' : 'male-qn-qingse',
              speed: 1.0,
              vol: 1.0,
              pitch: 0,
            },
          }),
        })

        if (response.ok) {
          const prediction = await response.json()
          
          // Poll for result
          let result = prediction
          let attempts = 0
          
          while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            const statusResponse = await fetch(result.urls.get, {
              headers: { 'Authorization': `Bearer ${replicateToken}` },
            })
            
            result = await statusResponse.json()
            attempts++
          }

          if (result.status === 'succeeded' && result.output) {
            console.log('[TTS] Replicate success:', result.output)
            return NextResponse.json({ 
              audioUrl: result.output,
              provider: 'replicate',
              language 
            })
          } else {
            console.error('[TTS] Replicate failed:', result.error || 'Unknown error')
          }
        } else {
          const errorText = await response.text()
          console.error('[TTS] Replicate API error:', response.status, errorText)
        }
      } catch (replicateError: any) {
        console.error('[TTS] Replicate failed:', replicateError.message)
      }
    }

    // No providers available - return instruction to use browser TTS
    console.log('[TTS] No providers available, suggesting browser TTS')
    return NextResponse.json({ 
      useBrowserTTS: true,
      text: trimmedText,
      language,
      message: 'No TTS providers configured. Using browser speech synthesis.'
    })

  } catch (error: any) {
    console.error('[TTS] Error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate speech',
        useBrowserTTS: true,
      },
      { status: 500 }
    )
  }
}
