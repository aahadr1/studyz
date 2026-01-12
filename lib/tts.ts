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
  const input = text.trim().slice(0, 12000)
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            language === 'fr'
              ? `Tu es un expert en préparation de texte pour la synthèse vocale (text-to-speech).
Transforme un texte (potentiellement avec du markdown) en texte oral fluide et naturel.

RÈGLES STRICTES:
- Supprime tout le markdown (titres, listes, code, etc.)
- Remplace les listes par des phrases complètes
- Garde une ponctuation simple: . , ? ! et autorise les parenthèses ( ) quand elles contiennent du vocabulaire important.
- Pas d'emojis, pas de symboles spéciaux
- Garde le sens, mais rends-le très naturel à l'oral
- IMPORTANT: si le texte contient des termes techniques en anglais entre parenthèses, CONSERVE-LES (ex: "résistance (resistance)").

Retourne UNIQUEMENT le texte final.`
              : `You are an expert at preparing text for text-to-speech.
Turn potentially-markdown text into natural spoken text.

STRICT RULES:
- Remove all markdown (headings, lists, code, etc.)
- Convert lists into full sentences
- Keep simple punctuation: . , ? ! and allow parentheses ( ) when they contain important vocabulary.
- No emojis, no special symbols
- Keep the meaning but make it very natural for speech
- IMPORTANT: if the text contains English technical terms in parentheses, KEEP them (e.g. "résistance (resistance)").

Return ONLY the final text.`,
        },
        { role: 'user', content: input },
      ],
      max_tokens: 1200,
      temperature: 0.2,
    })
    return response.choices[0]?.message?.content?.trim() || cleanTextForTTSFallback(input)
  } catch {
    return cleanTextForTTSFallback(input)
  }
}

export async function generateTtsAudioUrl(params: {
  text: string
  language: TtsLanguage
  voice: TtsVoiceGender
}): Promise<{ audioUrl: string; voiceId: string; language: string }> {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) throw new Error('TTS not configured. Set REPLICATE_API_TOKEN.')

  const voiceId = VOICES[params.language]?.[params.voice] || VOICES.en.male
  const languageBoost = params.language === 'fr' ? 'French' : 'English'
  const version = await getLatestMinimaxVersion(apiToken)

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
        speed: 1,
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

  return { audioUrl: String(prediction.output), voiceId, language: params.language }
}

