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

// ─── Types ──────────────────────────────────────────────────────────────────

type SingleGroup = { type: 'single'; index: number }
type MultiGroup  = { type: 'multi'; indices: number[] }
type Group = SingleGroup | MultiGroup

// Max segments to bundle in a single multi-speaker call (2–4 turns)
const CROSSOVER_MAX_SEGMENTS = 4
// Max words per individual segment to qualify for multi-speaker batching
const CROSSOVER_MAX_WORDS_PER_SEGMENT = 200

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate audio for all podcast segments using Gemini 2.5 TTS.
 *
 * Hybrid strategy:
 * - Consecutive 2-speaker exchanges (crossover groups) → Gemini multi-speaker call
 *   → PCM split proportionally → per-segment WAV URLs
 * - Solo turns and 3-speaker moments → Gemini single-speaker call per segment
 * - If multi-speaker call fails → retry each segment individually (single-speaker)
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] generateMultiVoiceAudio: ${segments.length} segments, hybrid mode`)
  return generateHybridSegments(segments, voiceProfiles, language, onProgress)
}

// ─── Core hybrid engine ─────────────────────────────────────────────────────

async function generateHybridSegments(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
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

  // Detect groups: multi-speaker crossover bundles vs single-speaker segments
  const groups = detectCrossoverGroups(segments, cleanedTexts)

  const multiGroupCount = groups.filter(g => g.type === 'multi').length
  const singleGroupCount = groups.filter(g => g.type === 'single').length
  console.log(`[Audio] Groups: ${groups.length} total — ${multiGroupCount} multi-speaker, ${singleGroupCount} single-speaker`)

  // Result array aligned with original segments
  const results: Array<{ audioUrl: string; duration: number }> = new Array(segments.length)
  let completedSegments = 0

  for (const group of groups) {
    if (group.type === 'single') {
      const idx = group.index
      const segment = segments[idx]
      const cleanedText = cleanedTexts[idx]

      if (onProgress) {
        await onProgress(completedSegments, segments.length, `Generating audio — ${segment.speaker} (segment ${idx + 1}/${segments.length})`)
      }

      const voiceProfile = resolveVoiceProfile(segment.speaker, voiceProfiles)
      const result = await generateSingleSegment(cleanedText, voiceProfile, language, idx + 1, segments.length)
      results[idx] = result
      completedSegments++

      if (onProgress) {
        await onProgress(completedSegments, segments.length, `Segment ${idx + 1}/${segments.length} done`)
      }

      // Rate-limit buffer between calls
      await delay(200)

    } else {
      // Multi-speaker crossover group
      const indices = group.indices
      const groupSegments = indices.map(i => segments[i])
      const groupTexts = indices.map(i => cleanedTexts[i])

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
          text: groupTexts[i],
          role: seg.speaker,
          voiceId,
          displayName,
        }
      })

      try {
        const { results: chunkResults } = await generateGeminiMultiSpeakerChunk(chunkInputs, language)
        for (let i = 0; i < indices.length; i++) {
          const origIdx = indices[i]
          results[origIdx] = {
            audioUrl: chunkResults[i]?.audioUrl ?? '',
            duration: chunkResults[i]?.duration ?? 0,
          }
          completedSegments++
        }
        console.log(`[Audio] ✅ Multi-speaker chunk done: ${indices.length} segments`)
      } catch (err: any) {
        console.error(`[Audio] ❌ Multi-speaker chunk failed, falling back to single-speaker:`, err?.message ?? err)

        // Fallback: generate each segment individually
        for (let i = 0; i < indices.length; i++) {
          const origIdx = indices[i]
          const seg = segments[origIdx]
          const voiceProfile = resolveVoiceProfile(seg.speaker, voiceProfiles)
          results[origIdx] = await generateSingleSegment(groupTexts[i], voiceProfile, language, origIdx + 1, segments.length)
          completedSegments++
          if (i < indices.length - 1) await delay(200)
        }
      }

      if (onProgress) {
        await onProgress(completedSegments, segments.length, `Chunk complete — ${completedSegments}/${segments.length} segments done`)
      }

      // Slightly larger pause after multi-speaker calls (heavier endpoint)
      await delay(400)
    }
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

// ─── Crossover group detection ───────────────────────────────────────────────

/**
 * Scan segments and partition them into groups:
 * - A "multi" group is a run of 2–4 consecutive segments that:
 *   - Contains exactly 2 distinct speakers
 *   - Each segment has ≤ CROSSOVER_MAX_WORDS_PER_SEGMENT words
 *   - Combined cleaned text is within Gemini's multi-speaker char limit
 * - Everything else becomes a "single" group
 */
function detectCrossoverGroups(segments: PodcastSegment[], cleanedTexts: string[]): Group[] {
  const groups: Group[] = []
  let i = 0

  while (i < segments.length) {
    // Try to extend a crossover window starting at i
    const windowEnd = findCrossoverWindowEnd(segments, cleanedTexts, i)

    if (windowEnd > i) {
      // Valid multi-speaker window [i, windowEnd)
      groups.push({ type: 'multi', indices: range(i, windowEnd) })
      i = windowEnd
    } else {
      groups.push({ type: 'single', index: i })
      i++
    }
  }

  return groups
}

/**
 * Find the furthest end index (exclusive) of a valid crossover window starting at `start`.
 * Returns `start` if no multi-speaker window is possible.
 */
function findCrossoverWindowEnd(segments: PodcastSegment[], cleanedTexts: string[], start: number): number {
  const startSpeaker = segments[start].speaker
  const startWordCount = wordCount(cleanedTexts[start])

  // First segment must itself be short enough
  if (startWordCount > CROSSOVER_MAX_WORDS_PER_SEGMENT) return start

  let speakers = new Set<string>([startSpeaker])
  let bestEnd = start // no valid window yet

  for (let j = start + 1; j < segments.length && j - start < CROSSOVER_MAX_SEGMENTS; j++) {
    const seg = segments[j]
    const text = cleanedTexts[j]
    const words = wordCount(text)

    // Segment too long for batching
    if (words > CROSSOVER_MAX_WORDS_PER_SEGMENT) break

    const newSpeakers = new Set([...speakers, seg.speaker])

    // More than 2 distinct speakers → can't use multi-speaker API
    if (newSpeakers.size > 2) break

    // Would exceed char limit
    if (!canUseMultiSpeaker(buildDummyInputs(segments, cleanedTexts, start, j + 1))) break

    speakers = newSpeakers

    // Need at least 2 segments with 2 distinct speakers to qualify
    if (speakers.size === 2) {
      bestEnd = j + 1
    }
  }

  return bestEnd
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateSingleSegment(
  text: string,
  voiceProfile: VoiceProfile,
  language: string,
  segNum: number,
  totalSegs: number
): Promise<{ audioUrl: string; duration: number }> {
  if (!text || text.trim().length === 0) {
    console.warn(`[Audio] Segment ${segNum} has empty text, skipping`)
    return { audioUrl: '', duration: 0 }
  }

  try {
    const result = await generateGeminiTTSAudio(text, voiceProfile, language)
    console.log(`[Audio] ✅ Segment ${segNum}/${totalSegs} done: ${result.duration.toFixed(1)}s`)
    return { audioUrl: result.audioUrl, duration: result.duration }
  } catch (err: any) {
    console.error(`[Audio] ❌ Segment ${segNum} failed:`, err?.message ?? err)
    return { audioUrl: '', duration: 0 }
  }
}

function resolveVoiceProfile(speaker: string, voiceProfiles: VoiceProfile[]): VoiceProfile {
  return voiceProfiles.find(v => v.role === speaker) ?? voiceProfiles[0]
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => i + start)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Build dummy MultiSpeakerSegmentInput[] for canUseMultiSpeaker char-limit check */
function buildDummyInputs(
  segments: PodcastSegment[],
  cleanedTexts: string[],
  start: number,
  end: number
): MultiSpeakerSegmentInput[] {
  return segments.slice(start, end).map((seg, i) => ({
    id: seg.id || String(start + i),
    text: cleanedTexts[start + i],
    role: seg.speaker,
    voiceId: ROLE_VOICE_MAP[seg.speaker] || 'Aoede',
    displayName: ROLE_DISPLAY_NAME[seg.speaker] || seg.speaker,
  }))
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

/**
 * Placeholder — audio merging not implemented; segments play sequentially.
 */
export async function mergeAudioSegments(
  segments: PodcastSegment[]
): Promise<{ finalAudioUrl: string; duration: number }> {
  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)
  return { finalAudioUrl: '', duration: totalDuration }
}

/**
 * Placeholder — post-processing not implemented.
 */
export async function postProcessAudio(audioUrl: string): Promise<string> {
  return audioUrl
}
