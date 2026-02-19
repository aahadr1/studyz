import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
import { generateGeminiTTSAudio } from './google-tts-client'

/**
 * Generate audio for all podcast segments using Gemini 2.5 TTS
 * (same technology as NotebookLM Audio Overviews).
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] generateMultiVoiceAudio: segments=${segments.length}, provider=gemini, hasOnProgress=${Boolean(onProgress)}`)
  return generateIndividualSegments(segments, voiceProfiles, language, onProgress)
}

/**
 * Generate audio segment-by-segment via Gemini TTS.
 */
async function generateIndividualSegments(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] Starting Gemini TTS generation for ${segments.length} segments`)

  if (segments.length === 0) {
    console.warn(`[Audio] No segments provided`)
    return []
  }

  const processedSegments: PodcastSegment[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const segmentNumber = i + 1

    if (onProgress) {
      await onProgress(i, segments.length, `Generating audio for segment ${segmentNumber}/${segments.length} (${segment.speaker})`)
    }

    if (!segment.text || segment.text.trim().length === 0) {
      console.warn(`[Audio] Segment ${segmentNumber} has empty text, skipping`)
      processedSegments.push(segment)
      continue
    }

    const voiceProfile = voiceProfiles.find((v) => v.role === segment.speaker) || voiceProfiles[0]

    try {
      const cleanedText = await makeTtsReadyText(segment.text, null, language as any).catch(() => segment.text)

      const result = await generateGeminiTTSAudio(cleanedText, voiceProfile, language)

      processedSegments.push({ ...segment, audioUrl: result.audioUrl, duration: result.duration })

      console.log(`[Audio] ✅ Segment ${segmentNumber}/${segments.length} done: ${result.duration.toFixed(1)}s`)

      if (onProgress) {
        await onProgress(segmentNumber, segments.length, `Segment ${segmentNumber}/${segments.length} audio generated`)
      }
    } catch (error: any) {
      console.error(`[Audio] ❌ Segment ${segmentNumber} failed:`, error?.message ?? error)
      processedSegments.push({ ...segment, audioUrl: '', duration: 0 })

      if (onProgress) {
        await onProgress(segmentNumber, segments.length, `Segment ${segmentNumber}/${segments.length} failed (continuing...)`)
      }
    }

    // Small delay between segments to stay within Gemini TTS rate limits
    if (i < segments.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }

  const successCount = processedSegments.filter(s => s.audioUrl && s.audioUrl.length > 0).length
  console.log(`[Audio] Generation complete: ${successCount}/${segments.length} segments successful`)

  return processedSegments
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
