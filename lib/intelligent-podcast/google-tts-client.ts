/**
 * Lightweight Google Cloud Text-to-Speech client using REST API only (no SDK).
 * Use GOOGLE_CLOUD_API_KEY in env. Keeps bundle small for Vercel.
 */

import type { VoiceProfile } from '@/types/intelligent-podcast'

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize'

/** Language code to Google TTS locale (languageCode for voice). */
const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
}

/** Map our voiceId (Kore, Charon, Aoede) + locale to Google TTS voice name. */
function getVoiceName(locale: string, voiceId: string): string {
  const base = locale
  const map: Record<string, string> = {
    Kore: `${base}-Neural2-F`,
    Charon: `${base}-Neural2-D`,
    Aoede: `${base}-Neural2-J`,
  }
  return map[voiceId] || `${base}-Neural2-F`
}

function getApiKey(): string {
  const key = process.env.GOOGLE_CLOUD_API_KEY
  if (!key) throw new Error('GOOGLE_CLOUD_API_KEY is not set')
  return key
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

/**
 * Synthesize one segment via Google Cloud TTS REST API.
 */
export async function generateGeminiTTSAudio(
  text: string,
  voiceProfile: VoiceProfile,
  language: string
): Promise<TTSResult> {
  if (!text?.trim()) throw new Error('Cannot generate audio for empty text')
  const trimmed = text.length > 5000 ? text.slice(0, 5000) : text
  const locale = LANG_TO_LOCALE[language] || LANG_TO_LOCALE.en
  const voiceName = getVoiceName(locale, voiceProfile.voiceId)

  const apiKey = getApiKey()
  const url = `${TTS_URL}?key=${encodeURIComponent(apiKey)}`
  const body = {
    input: { text: trimmed },
    voice: {
      languageCode: locale,
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: 24000,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Google TTS failed (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as { audioContent?: string }
  const b64 = data.audioContent
  if (!b64) throw new Error('Google TTS did not return audioContent')

  const audioUrl = `data:audio/mpeg;base64,${b64}`
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const duration = Math.max(1, (wordCount / 135) * 60)
  return { audioUrl, duration }
}

/** Conversation segment for multi-speaker (we do not merge; caller falls back to per-segment). */
export interface ConversationSegment {
  text: string
  speaker: string
  voiceProfile: VoiceProfile
}

/**
 * "Conversation" mode: not supported as a single API call in Cloud TTS.
 * Caller should use per-segment generation; this throws so audio-generator falls back.
 */
export async function generateGeminiConversationAudio(
  _segments: ConversationSegment[],
  _language: string,
  _conversationPrompt: string
): Promise<TTSResult> {
  throw new Error(
    'Google Cloud TTS does not support multi-speaker conversation in one call; use per-segment generation.'
  )
}
