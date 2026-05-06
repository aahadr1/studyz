import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

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

// Lazy initialization of OpenAI client
let openaiInstance: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

// Small in-memory cache for translations (best-effort; may reset between deploys)
const translationCache = new Map<string, string>()
const MAX_TRANSLATION_CACHE_ENTRIES = 200

function hashForCacheKey(input: string): string {
  // djb2-ish hash; short + stable
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
  }
  // Force unsigned 32-bit
  return (h >>> 0).toString(16)
}

async function translateToFrenchIfNeeded(params: {
  text: string
  translate: boolean
  language: string
}): Promise<string> {
  const { text, translate, language } = params
  if (!translate) return text
  if (language !== 'fr') return text

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[TTS] Translation requested but OPENAI_API_KEY is not set; speaking original text with FR voice.')
    return text
  }

  const input = text.trim().slice(0, 9000)
  if (!input) return ''

  const cacheKey = `${input.length}:${hashForCacheKey(input)}`
  const cached = translationCache.get(cacheKey)
  if (cached) return cached

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a translation engine.
Translate the user's text into French.

STRICT RULES:
- Preserve line breaks and overall formatting.
- Preserve MCQ option labels exactly (e.g. "A.", "B.", "C.", "D.") and do NOT translate the letters/labels.
- Do NOT add commentary, quotes, or explanations.
- If the text is already French, return it unchanged.

Return ONLY the translated text.`,
        },
        { role: 'user', content: input },
      ],
    })

    const translated = completion.choices[0]?.message?.content?.trim()
    const out = (translated && translated.length > 0 ? translated : input).slice(0, 10000)

    // Best-effort eviction to avoid unbounded growth
    if (translationCache.size >= MAX_TRANSLATION_CACHE_ENTRIES) {
      const firstKey = translationCache.keys().next().value
      if (firstKey) translationCache.delete(firstKey)
    }
    translationCache.set(cacheKey, out)

    return out
  } catch (err: any) {
    console.error('[TTS] Translation failed; speaking original text with FR voice:', err?.message || err)
    return input.slice(0, 10000)
  }
}

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
      speed = 1.3,
      translate = false,
    } = body

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const trimmedText = text.trim().substring(0, 10000)
    const ttsText = await translateToFrenchIfNeeded({ text: trimmedText, translate: !!translate, language })
    const voiceId = VOICES[language as keyof typeof VOICES]?.[voice as keyof typeof VOICES.en] || VOICES.en.male
    const languageBoost = language === 'fr' ? 'French' : 'English'
    const safeSpeed = (() => {
      const n = Number(speed)
      if (!Number.isFinite(n)) return 1.3
      return Math.max(0.5, Math.min(2.5, n))
    })()

    console.log(`[TTS] Starting: "${ttsText.substring(0, 40)}..." voice=${voiceId} translate=${!!translate}`)

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
          text: ttsText,
          voice_id: voiceId,
          speed: safeSpeed,
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
      speed: safeSpeed,
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
