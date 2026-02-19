/**
 * Gemini 2.5 TTS client — same technology powering NotebookLM Audio Overviews.
 * Supports both single-speaker and multi-speaker (2-speaker dialogue chunks).
 * Uses REST API only (no SDK). Requires GEMINI_API_KEY from Google AI Studio.
 */

import type { VoiceProfile } from '@/types/intelligent-podcast'

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'

/** PCM audio specs returned by Gemini TTS */
const PCM_SAMPLE_RATE = 24000
const PCM_BYTES_PER_SAMPLE = 2 // 16-bit

/** Default voice per role — Gemini prebuilt voice names */
export const ROLE_VOICE_MAP: Record<string, string> = {
  host: 'Aoede',    // breezy, natural — the curious host
  expert: 'Charon', // informative, clear — the knowledgeable expert
}

/** Display names used as speaker labels in multi-speaker scripts */
export const ROLE_DISPLAY_NAME: Record<string, string> = {
  host: 'Alex',
  expert: 'Jamie',
}

/** Multi-speaker input limit: 3000 chars (real limit is ~4000 bytes / 5min audio; 3000 is safe) */
const MULTI_SPEAKER_CHAR_LIMIT = 3000

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY (AI Studio) is not set')
  return key
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

export interface MultiSpeakerSegmentInput {
  id: string
  text: string
  role: string // 'host' | 'expert'
  voiceId: string
  displayName: string
}

export interface MultiSpeakerChunkResult {
  results: Array<{ id: string; audioUrl: string; duration: number }>
}

// ─── Single-speaker ────────────────────────────────────────────────────────

/**
 * Synthesize one segment via Gemini 2.5 TTS (single speaker).
 * Returns a WAV data URL ready for HTML5 audio playback.
 */
export async function generateGeminiTTSAudio(
  text: string,
  voiceProfile: VoiceProfile,
  _language: string
): Promise<TTSResult> {
  if (!text?.trim()) throw new Error('Cannot generate audio for empty text')
  const trimmed = text.length > 5000 ? text.slice(0, 5000) : text
  const voiceName = voiceProfile.voiceId || ROLE_VOICE_MAP[voiceProfile.role] || 'Aoede'

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

  const audioBase64 = await callGeminiTTS(body)
  const audioUrl = buildAudioUrl(audioBase64)
  const duration = estimateDuration(trimmed)
  return { audioUrl, duration }
}

// ─── Multi-speaker ─────────────────────────────────────────────────────────

/**
 * Synthesize a crossover chunk (2 distinct speakers) in a single Gemini TTS call.
 * The resulting PCM audio is proportionally split back into per-segment WAV files.
 *
 * Falls back to single-speaker per-segment if multi-speaker API fails.
 */
export async function generateGeminiMultiSpeakerChunk(
  segments: MultiSpeakerSegmentInput[],
  _language: string
): Promise<MultiSpeakerChunkResult> {
  if (segments.length < 2) {
    throw new Error('Multi-speaker chunk requires at least 2 segments')
  }

  // Build dialogue script: "Alex: text\nJamie: text\n..."
  const script = segments
    .map(s => `${s.displayName}: ${s.text.trim().replace(/\s+/g, ' ')}`)
    .join('\n')

  // Build speaker voice config (deduplicated by displayName)
  const speakerMap = new Map<string, string>()
  for (const s of segments) {
    if (!speakerMap.has(s.displayName)) {
      speakerMap.set(s.displayName, s.voiceId)
    }
  }

  const speakerVoiceConfigs = Array.from(speakerMap.entries()).map(([speaker, voiceName]) => ({
    speaker,
    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
  }))

  const body = {
    contents: [{ parts: [{ text: script }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        multiSpeakerVoiceConfig: { speakerVoiceConfigs },
      },
    },
  }

  const audioBase64 = await callGeminiTTS(body)

  // Split the combined PCM proportionally by word count per segment
  const results = splitPcmByWordCount(audioBase64, segments)
  return { results }
}

/**
 * Check whether a set of segments qualifies for multi-speaker generation.
 * Rules: at least 2 segments, at most 2 distinct roles, combined text within char limit.
 */
export function canUseMultiSpeaker(segments: MultiSpeakerSegmentInput[]): boolean {
  if (segments.length < 2) return false
  const roles = new Set(segments.map(s => s.role))
  if (roles.size > 2) return false
  const totalChars = segments.reduce((sum, s) => sum + s.text.length + s.displayName.length + 2, 0)
  return totalChars <= MULTI_SPEAKER_CHAR_LIMIT
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

async function callGeminiTTS(body: object): Promise<string> {
  const apiKey = getGeminiKey()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

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
      res.status === 401 ? ' | Hint: Gemini TTS needs an AI Studio key (GEMINI_API_KEY).' :
      res.status === 429 ? ' | Hint: Gemini TTS rate limit exceeded. Wait and retry.' : ''
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

  const audioBase64 = data.candidates
    ?.flatMap(c => c.content?.parts || [])
    ?.map(p => p.inlineData?.data || p.inline_data?.data)
    ?.find(d => !!d)

  if (!audioBase64) throw new Error('Gemini TTS returned no audio data')
  return audioBase64
}

/** Detect MIME, wrap PCM as WAV if needed, return data URL */
function buildAudioUrl(audioBase64: string, mimeType?: string): string {
  const mime = mimeType || 'audio/L16;rate=24000'
  const isRawPcm = mime.startsWith('audio/L16') || mime.startsWith('audio/pcm')
  if (isRawPcm) return pcmBase64ToWavDataUrl(audioBase64, PCM_SAMPLE_RATE)
  return `data:${mime};base64,${audioBase64}`
}

function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, (wordCount / 135) * 60)
}

/**
 * Split raw PCM base64 proportionally across segments by word count.
 * Each segment gets its own WAV data URL.
 */
function splitPcmByWordCount(
  pcmBase64: string,
  segments: MultiSpeakerSegmentInput[]
): Array<{ id: string; audioUrl: string; duration: number }> {
  const pcmBytes = Buffer.from(pcmBase64, 'base64')
  const totalSamples = pcmBytes.length / PCM_BYTES_PER_SAMPLE

  const wordCounts = segments.map(s => Math.max(1, s.text.split(/\s+/).filter(Boolean).length))
  const totalWords = wordCounts.reduce((a, b) => a + b, 0)

  const results: Array<{ id: string; audioUrl: string; duration: number }> = []
  let sampleOffset = 0

  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1

    // Align to sample boundary (2 bytes per sample)
    let samplesForSegment: number
    if (isLast) {
      samplesForSegment = totalSamples - sampleOffset
    } else {
      samplesForSegment = Math.round((wordCounts[i] / totalWords) * totalSamples)
    }

    // Ensure we don't exceed buffer
    samplesForSegment = Math.min(samplesForSegment, totalSamples - sampleOffset)
    samplesForSegment = Math.max(0, samplesForSegment)

    const byteStart = sampleOffset * PCM_BYTES_PER_SAMPLE
    const byteEnd = byteStart + samplesForSegment * PCM_BYTES_PER_SAMPLE
    const segmentPcm = pcmBytes.slice(byteStart, byteEnd)

    const audioUrl = pcmBufToWavDataUrl(segmentPcm, PCM_SAMPLE_RATE)
    const duration = Math.max(1, samplesForSegment / PCM_SAMPLE_RATE)

    results.push({ id: segments[i].id, audioUrl, duration })
    sampleOffset += samplesForSegment
  }

  return results
}

// ─── PCM → WAV helpers ──────────────────────────────────────────────────────

/** Wrap a raw PCM base64 string as a WAV data URL */
function pcmBase64ToWavDataUrl(pcmBase64: string, sampleRate: number): string {
  return pcmBufToWavDataUrl(Buffer.from(pcmBase64, 'base64'), sampleRate)
}

/** Wrap a raw PCM Buffer as a WAV data URL */
function pcmBufToWavDataUrl(pcmBuf: Buffer, sampleRate: number): string {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmBuf.length
  const wav = Buffer.alloc(44 + dataSize)

  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(numChannels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitsPerSample, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcmBuf.copy(wav, 44)

  return `data:audio/wav;base64,${wav.toString('base64')}`
}
