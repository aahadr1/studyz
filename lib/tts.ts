import OpenAI from 'openai'

// MiniMax Speech-02-Turbo Voice IDs (same as /api/tts)
const VOICES = {
  en: {
    male: 'English_CaptivatingStoryteller',
    female: 'English_ConfidentWoman',
  },
  fr: {
    male: 'French_MaleNarrator',
    female: 'French_Female_News Anchor',
  },
} as const

export type TtsLanguage = keyof typeof VOICES
export type TtsVoiceGender = keyof typeof VOICES.en

let cachedVersion: string | null = null

async function getLatestMinimaxVersion(apiToken: string): Promise<string> {
  if (cachedVersion) return cachedVersion
  try {
    const response = await fetch('https://api.replicate.com/v1/models/minimax/speech-02-turbo', {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    })
    if (response.ok) {
      const data = await response.json()
      cachedVersion = data.latest_version?.id || null
      if (cachedVersion) return cachedVersion
    }
  } catch {
    // ignore
  }
  // Fallback known working version (same as /api/tts)
  return '0544d2d437c9fdce5a5cf43a06b29f4df8a2c0bfef97f5c7f85a1f0c55b5eb06'
}

function cleanTextForTTSFallback(text: string): string {
  let cleaned = text
  cleaned = cleaned.replace(/\*\*\*(.+?)\*\*\*/g, '$1')
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1')
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1')
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '')
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
  cleaned = cleaned.replace(/^[\s]*[-*+•]\s+/gm, '')
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '')
  cleaned = cleaned.replace(/^>\s+/gm, '')
  cleaned = cleaned.replace(/[\uD800-\uDFFF]./g, '')
  cleaned = cleaned.replace(/[\u2600-\u27BF]/g, '')
  cleaned = cleaned.replace(/[\u2700-\u27BF]/g, '')
  cleaned = cleaned.replace(/[—–]/g, ', ')
  cleaned = cleaned.replace(/\s*[:;]\s*/g, ', ')
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  cleaned = cleaned.trim()
  return cleaned
}

export async function makeTtsReadyText(text: string, openai: OpenAI, language: TtsLanguage): Promise<string> {
  // IMPORTANT:
  // This function must NEVER shorten/summarize content, otherwise podcast audio
  // can become much shorter than the generated script. Use deterministic cleanup only.
  // (We keep the OpenAI param for API compatibility with callers.)
  void openai
  void language
  return cleanTextForTTSFallback(String(text || ''))
}

export async function generateTtsAudioUrl(params: {
  text: string
  language: TtsLanguage
  voice: TtsVoiceGender
  speed?: number
}): Promise<{ audioUrl: string; voiceId: string; language: string; speed: number }> {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) throw new Error('TTS not configured. Set REPLICATE_API_TOKEN.')

  const voiceId = VOICES[params.language]?.[params.voice] || VOICES.en.male
  const languageBoost = params.language === 'fr' ? 'French' : 'English'
  const version = await getLatestMinimaxVersion(apiToken)
  const safeSpeed = (() => {
    const n = Number(params.speed ?? 1.3)
    if (!Number.isFinite(n)) return 1.3
    return Math.max(0.5, Math.min(2.5, n))
  })()

  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version,
      input: {
        text: params.text.trim().substring(0, 10000),
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
        english_normalization: params.language === 'en',
      },
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Replicate error ${createResponse.status}: ${errorText}`)
  }

  let prediction = await createResponse.json()

  let attempts = 0
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 60) {
    await new Promise(r => setTimeout(r, 1000))
    const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    })
    prediction = await pollResponse.json()
    attempts++
  }

  if (prediction.status === 'failed') throw new Error(prediction.error || 'TTS generation failed')
  if (!prediction.output) throw new Error('TTS timed out or no output')

  return { audioUrl: String(prediction.output), voiceId, language: params.language, speed: safeSpeed }
}

