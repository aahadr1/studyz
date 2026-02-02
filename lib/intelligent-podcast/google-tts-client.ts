/**
 * Lightweight Google Cloud Text-to-Speech client using REST API only (no SDK).
 * Use GOOGLE_CLOUD_API_KEY in env. Keeps bundle small for Vercel.
 */

import type { VoiceProfile } from '@/types/intelligent-podcast'

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize' // legacy (kept for reference)
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const GEMINI_NATIVE_TTS_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog'

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

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY (AI Studio) is not set')
  return key
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

/**
 * Synthesize one segment via Gemini native TTS (preview, higher quality than Cloud TTS).
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

  const apiKey = getGeminiKey()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: trimmed }],
      },
    ],
    response_mime_type: 'audio/mp3', // request audio response directly
    generationConfig: {
      temperature: 0.6,
      topP: 0.95,
    },
    // Voice selection is not yet GA for preview TTS; include hint in prompt instead.
    // Keeping voiceName variables in case API adds support; currently we let model choose best voice.
    // speech_config is omitted to avoid mismatched casing issues.
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini TTS failed (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType: string; data: string }
          inline_data?: { mime_type: string; data: string }
        }>
      }
    }>
  }

  const audioBase64 =
    data.candidates
      ?.flatMap((c) => c.content?.parts || [])
      ?.map((p) => p.inlineData?.data || p.inline_data?.data)
      ?.find((d) => !!d)

  if (!audioBase64) {
    throw new Error('Gemini TTS did not return inlineData audio')
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const duration = Math.max(1, (wordCount / 135) * 60)

  return {
    audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
    duration,
  }
}

/** Conversation segment for multi-speaker (we do not merge; caller falls back to per-segment). */
export interface ConversationSegment {
  text: string
  speaker: string
  voiceProfile: VoiceProfile
}

/**
 * Multi-speaker conversation using Gemini native audio dialog (preview).
 * If Gemini native TTS fails, caller should fall back to per-segment generation.
 */
export async function generateGeminiConversationAudio(
  _segments: ConversationSegment[],
  _language: string,
  _conversationPrompt: string
): Promise<TTSResult> {
  const apiKey = getGeminiKey()
  if (!_segments.length) {
    throw new Error('No segments provided for conversation audio')
  }

  // Build a dialogue script with speaker labels that Gemini can render with multiple voices.
  const script = _segments
    .map(
      (s) =>
        `${s.speaker.toUpperCase()}: ${s.text.trim().replace(/\s+/g, ' ')}`
    )
    .join('\n')

  const prompt = `${_conversationPrompt}\n\nGenerate natural multi-speaker audio for the following dialogue. Use distinct voices per speaker role (Host, Expert, Simplifier):\n\n${script}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_NATIVE_TTS_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    // Response as audio
    response_mime_type: 'audio/wav',
    generationConfig: {
      temperature: 0.6,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini native audio error (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>
  }

  const audioBase64 =
    data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data

  if (!audioBase64) {
    throw new Error('Gemini native audio did not return inlineData audio')
  }

  // Rough duration estimate: 135 wpm ~ 2.25 wps
  const totalWords = _segments.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0)
  const duration = Math.max(1, (totalWords / 135) * 60)

  return {
    audioUrl: `data:audio/wav;base64,${audioBase64}`,
    duration,
  }
}
