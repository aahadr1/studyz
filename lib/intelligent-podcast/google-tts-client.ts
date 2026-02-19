/**
 * Gemini 2.5 TTS client — same technology powering NotebookLM Audio Overviews.
 * Uses REST API only (no SDK). Requires GEMINI_API_KEY from Google AI Studio.
 */

import type { VoiceProfile } from '@/types/intelligent-podcast'

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'

/** Default voice mapping: role → Gemini prebuilt voice name. */
const ROLE_VOICE_MAP: Record<string, string> = {
  host: 'Aoede',     // breezy, natural — great for podcast host
  expert: 'Charon',  // informative, clear — fits authoritative expert
  simplifier: 'Zephyr', // bright, cheerful — approachable simplifier
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
 * Synthesize one segment via Gemini 2.5 TTS.
 * Returns a base64 data URL ready for HTML5 audio playback.
 */
export async function generateGeminiTTSAudio(
  text: string,
  voiceProfile: VoiceProfile,
  _language: string
): Promise<TTSResult> {
  if (!text?.trim()) throw new Error('Cannot generate audio for empty text')
  const trimmed = text.length > 5000 ? text.slice(0, 5000) : text

  const voiceName = voiceProfile.voiceId || ROLE_VOICE_MAP[voiceProfile.role] || 'Aoede'

  const apiKey = getGeminiKey()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [{ parts: [{ text: trimmed }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const errText = await res.text()
    const hint =
      res.status === 401
        ? ' | Hint: Gemini TTS needs an AI Studio key (GEMINI_API_KEY). Vertex/Cloud keys are rejected.'
        : res.status === 429
          ? ' | Hint: Gemini TTS rate limit exceeded. Wait and retry.'
          : ''
    throw new Error(`Gemini TTS failed (${res.status}): ${errText}${hint}`)
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

  // Extract base64 audio (handle both camelCase and snake_case field names)
  const audioBase64 = data.candidates
    ?.flatMap((c) => c.content?.parts || [])
    ?.map((p) => p.inlineData?.data || p.inline_data?.data)
    ?.find((d) => !!d)

  if (!audioBase64) {
    throw new Error('Gemini TTS returned no audio data')
  }

  // Detect MIME type from response (Gemini returns PCM/WAV by default)
  const mimeType = data.candidates
    ?.flatMap((c) => c.content?.parts || [])
    ?.map((p) => p.inlineData?.mimeType || p.inline_data?.mime_type)
    ?.find((m) => !!m) || 'audio/L16;rate=24000'

  // For PCM/L16 audio, wrap as WAV; otherwise use the MIME type as-is
  const isRawPcm = mimeType.startsWith('audio/L16') || mimeType.startsWith('audio/pcm')
  const dataUrlMime = isRawPcm ? 'audio/wav' : mimeType
  const audioUrl = isRawPcm
    ? pcmToWavDataUrl(audioBase64, 24000)
    : `data:${dataUrlMime};base64,${audioBase64}`

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const duration = Math.max(1, (wordCount / 135) * 60)

  return { audioUrl, duration }
}

/**
 * Convert raw PCM16 base64 to a proper WAV data URL so browsers can play it.
 */
function pcmToWavDataUrl(pcmBase64: string, sampleRate: number): string {
  const pcmBytes = Buffer.from(pcmBase64, 'base64')
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmBytes.length
  const headerSize = 44
  const wav = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  // fmt chunk
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(numChannels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitsPerSample, 34)
  // data chunk
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcmBytes.copy(wav, headerSize)

  return `data:audio/wav;base64,${wav.toString('base64')}`
}
