import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
import {
  generateGeminiTTSAudio,
  generateGeminiMultiSpeakerChunk,
  canUseMultiSpeaker,
  ROLE_VOICE_MAP,
  ROLE_DISPLAY_NAME,
  type MultiSpeakerSegmentInput,
} from './google-tts-client'

/** Max chars per multi-speaker chunk (matches google-tts-client MULTI_SPEAKER_CHAR_LIMIT) */
const CHUNK_CHAR_LIMIT = 3000

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate audio for all podcast segments using Gemini 2.5 multi-speaker TTS.
 *
 * Strategy: group ALL consecutive segments into multi-speaker chunks (≤3000 chars),
 * synthesize each chunk in a single API call, then split the PCM back per-segment.
 * Falls back to single-speaker per-segment only if the multi-speaker call fails.
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] generateMultiVoiceAudio: ${segments.length} segments, multi-speaker mode`)

  if (segments.length === 0) {
    console.warn('[Audio] No segments provided')
    return []
  }

  // Pre-clean text for all segments (TTS-ready: no markdown, no emojis)
  const cleanedTexts = await Promise.all(
    segments.map(s =>
      makeTtsReadyText(s.text, null, language as any).catch(() => s.text)
    )
  )

  // Group segments into multi-speaker chunks
  const chunks = buildChunks(segments, cleanedTexts)
  console.log(`[Audio] Grouped ${segments.length} segments into ${chunks.length} multi-speaker chunks`)

  // Result array aligned with original segments
  const results: Array<{ audioUrl: string; duration: number }> = new Array(segments.length)
  let completedSegments = 0

  for (const chunk of chunks) {
    const indices = chunk.indices
    const groupSegments = indices.map(i => segments[i])

    if (onProgress) {
      const speakers = [...new Set(groupSegments.map(s => s.speaker))].join('+')
      await onProgress(
        completedSegments,
        segments.length,
        `Multi-speaker chunk (${speakers}) — segments ${indices[0] + 1}–${indices[indices.length - 1] + 1}`
      )
    }

    const chunkInputs: MultiSpeakerSegmentInput[] = indices.map((origIdx, i) => {
      const seg = segments[origIdx]
      const voiceId = ROLE_VOICE_MAP[seg.speaker] || 'Aoede'
      const displayName = ROLE_DISPLAY_NAME[seg.speaker] || seg.speaker
      return {
        id: seg.id || String(origIdx),
        text: cleanedTexts[origIdx],
        role: seg.speaker,
        voiceId,
        displayName,
      }
    })

    // Filter out segments with empty text
    const validInputs = chunkInputs.filter(s => s.text.trim().length > 0)

    if (validInputs.length >= 2) {
      // Multi-speaker path
      try {
        const { results: chunkResults } = await generateGeminiMultiSpeakerChunk(validInputs, language)
        // Map results back by segment id
        const resultById = new Map(chunkResults.map(r => [r.id, r]))
        for (const origIdx of indices) {
          const seg = segments[origIdx]
          const id = seg.id || String(origIdx)
          const result = resultById.get(id)
          if (result) {
            results[origIdx] = { audioUrl: result.audioUrl, duration: result.duration }
          } else {
            results[origIdx] = { audioUrl: '', duration: 0 }
          }
          completedSegments++
        }
        console.log(`[Audio] Multi-speaker chunk done: ${indices.length} segments`)
      } catch (err: any) {
        console.error(`[Audio] Multi-speaker chunk failed, falling back to single-speaker:`, err?.message ?? err)
        await fallbackSingleSpeaker(indices, segments, cleanedTexts, voiceProfiles, language, results)
        completedSegments += indices.length
      }
    } else if (validInputs.length === 1) {
      // Only one valid segment in chunk — use single-speaker
      const origIdx = indices.find(i => cleanedTexts[i].trim().length > 0) ?? indices[0]
      const voiceProfile = resolveVoiceProfile(segments[origIdx].speaker, voiceProfiles)
      results[origIdx] = await generateSingleSegment(cleanedTexts[origIdx], voiceProfile, language)
      // Mark empty segments
      for (const i of indices) {
        if (i !== origIdx) results[i] = { audioUrl: '', duration: 0 }
      }
      completedSegments += indices.length
    } else {
      // All segments in chunk are empty
      for (const i of indices) {
        results[i] = { audioUrl: '', duration: 0 }
      }
      completedSegments += indices.length
    }

    if (onProgress) {
      await onProgress(completedSegments, segments.length, `${completedSegments}/${segments.length} segments done`)
    }

    // Rate-limit between API calls
    await delay(300)
  }

  // Merge results back into segments
  const processed = segments.map((seg, i) => ({
    ...seg,
    audioUrl: results[i]?.audioUrl ?? '',
    duration: results[i]?.duration ?? 0,
  }))

  const successCount = processed.filter(s => s.audioUrl && s.audioUrl.length > 0).length
  console.log(`[Audio] Generation complete: ${successCount}/${segments.length} segments successful`)

  return processed
}

// ─── Chunk builder ──────────────────────────────────────────────────────────

interface Chunk {
  indices: number[]
}

/**
 * Group all segments into multi-speaker chunks that fit within the char limit.
 * Since we only have 2 speakers (host + expert), all segments are eligible.
 */
function buildChunks(segments: PodcastSegment[], cleanedTexts: string[]): Chunk[] {
  const chunks: Chunk[] = []
  let currentIndices: number[] = []
  let currentChars = 0

  for (let i = 0; i < segments.length; i++) {
    const text = cleanedTexts[i]
    const speaker = segments[i].speaker
    const displayName = ROLE_DISPLAY_NAME[speaker] || speaker
    const segChars = text.length + displayName.length + 2 // "Name: text"

    // Start new chunk if adding this segment would exceed the limit
    if (currentIndices.length > 0 && currentChars + segChars > CHUNK_CHAR_LIMIT) {
      chunks.push({ indices: currentIndices })
      currentIndices = []
      currentChars = 0
    }

    currentIndices.push(i)
    currentChars += segChars
  }

  // Push final chunk
  if (currentIndices.length > 0) {
    chunks.push({ indices: currentIndices })
  }

  return chunks
}

// ─── Fallback single-speaker ────────────────────────────────────────────────

async function fallbackSingleSpeaker(
  indices: number[],
  segments: PodcastSegment[],
  cleanedTexts: string[],
  voiceProfiles: VoiceProfile[],
  language: string,
  results: Array<{ audioUrl: string; duration: number }>
): Promise<void> {
  for (let i = 0; i < indices.length; i++) {
    const origIdx = indices[i]
    const seg = segments[origIdx]
    const text = cleanedTexts[origIdx]
    if (!text.trim()) {
      results[origIdx] = { audioUrl: '', duration: 0 }
      continue
    }
    const voiceProfile = resolveVoiceProfile(seg.speaker, voiceProfiles)
    results[origIdx] = await generateSingleSegment(text, voiceProfile, language)
    if (i < indices.length - 1) await delay(200)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateSingleSegment(
  text: string,
  voiceProfile: VoiceProfile,
  language: string,
): Promise<{ audioUrl: string; duration: number }> {
  if (!text || text.trim().length === 0) {
    return { audioUrl: '', duration: 0 }
  }
  try {
    const result = await generateGeminiTTSAudio(text, voiceProfile, language)
    return { audioUrl: result.audioUrl, duration: result.duration }
  } catch (err: any) {
    console.error(`[Audio] Single-speaker fallback failed:`, err?.message ?? err)
    return { audioUrl: '', duration: 0 }
  }
}

function resolveVoiceProfile(speaker: string, voiceProfiles: VoiceProfile[]): VoiceProfile {
  return voiceProfiles.find(v => v.role === speaker) ?? voiceProfiles[0]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Predicted Q&A ──────────────────────────────────────────────────────────

/**
 * Pre-generate audio for predicted Q&A answers using host voice.
 */
export async function generatePredictedQuestionsAudio(
  questions: PredictedQuestion[],
  language: string,
  hostVoice: VoiceProfile,
  onProgress?: (current: number, total: number) => void
): Promise<PredictedQuestion[]> {
  console.log(`[Audio] Generating audio for ${questions.length} predicted questions`)

  const processed: PredictedQuestion[] = []

  for (let i = 0; i < questions.length; i++) {
    if (onProgress) onProgress(i + 1, questions.length)

    try {
      const result = await generateGeminiTTSAudio(questions[i].answer, hostVoice, language)
      processed.push({ ...questions[i], audioUrl: result.audioUrl })
    } catch (error) {
      console.error(`[Audio] Failed to generate audio for question ${i + 1}:`, error)
      processed.push(questions[i])
    }
  }

  console.log('[Audio] Predicted questions audio generation complete')
  return processed
}

// ─── Stubs ───────────────────────────────────────────────────────────────────

export async function mergeAudioSegments(
  segments: PodcastSegment[]
): Promise<{ finalAudioUrl: string; duration: number }> {
  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)
  return { finalAudioUrl: '', duration: totalDuration }
}

export async function postProcessAudio(audioUrl: string): Promise<string> {
  return audioUrl
}
