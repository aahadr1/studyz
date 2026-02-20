import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
import { generateGeminiTTSAudio, ROLE_VOICE_MAP } from './google-tts-client'

/**
 * Generate audio for all podcast segments with stable per-role voices.
 *
 * We intentionally use deterministic single-speaker synthesis per segment:
 * - host always uses the host voice
 * - expert always uses the expert voice
 *
 * This avoids speaker leakage that can happen when splitting multi-speaker
 * chunks back into per-segment files.
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] generateMultiVoiceAudio: ${segments.length} segments, stable single-speaker mode`)

  if (segments.length === 0) {
    console.warn('[Audio] No segments provided')
    return []
  }

  const cleanedTexts = await Promise.all(
    segments.map((s) => makeTtsReadyText(s.text, null, language as any).catch(() => s.text))
  )

  const processed: PodcastSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const cleaned = String(cleanedTexts[i] || '').trim()

    if (onProgress) {
      await onProgress(i, segments.length, `Synthesizing ${seg.speaker} segment ${i + 1}/${segments.length}`)
    }

    if (!cleaned) {
      processed.push({ ...seg, audioUrl: '', duration: 0 })
      continue
    }

    const voiceProfile = resolveVoiceProfile(seg.speaker, voiceProfiles)

    try {
      const result = await generateGeminiTTSAudio(cleaned, voiceProfile, language)
      processed.push({ ...seg, audioUrl: result.audioUrl, duration: result.duration })
    } catch (err: any) {
      console.error(`[Audio] Segment ${seg.id || i} failed:`, err?.message ?? err)
      processed.push({ ...seg, audioUrl: '', duration: 0 })
    }

    if (onProgress) {
      await onProgress(i + 1, segments.length, `${i + 1}/${segments.length} segments done`)
    }

    await delay(120)
  }

  const successCount = processed.filter((s) => s.audioUrl && s.audioUrl.length > 0).length
  console.log(`[Audio] Generation complete: ${successCount}/${segments.length} segments successful`)

  return processed
}

function resolveVoiceProfile(
  speaker: 'host' | 'expert',
  voiceProfiles: VoiceProfile[]
): VoiceProfile {
  const matched = voiceProfiles.find((v) => v.role === speaker)
  if (matched) return matched

  const fallbackVoiceId = ROLE_VOICE_MAP[speaker] || ROLE_VOICE_MAP.host
  return {
    id: `${speaker}-fallback`,
    role: speaker,
    name: speaker === 'host' ? 'Alex' : 'Jamie',
    provider: 'gemini',
    voiceId: fallbackVoiceId,
    description: speaker === 'host' ? 'Curious host' : 'Approachable expert',
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
