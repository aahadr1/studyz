import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
import {
  generateGeminiTTSAudio,
  generateGeminiMultiSpeakerChunk,
  ROLE_VOICE_MAP,
  ROLE_DISPLAY_NAME,
  type MultiSpeakerSegmentInput,
} from './google-tts-client'

/** Max chars per multi-speaker chunk (matches google-tts-client MULTI_SPEAKER_CHAR_LIMIT) */
const CHUNK_CHAR_LIMIT = 3000

/**
 * Voice configuration that stays consistent across the entire podcast.
 * This ensures Alex and Jamie always sound the same, regardless of which chunk they're in.
 */
const PODCAST_VOICES = {
  host: {
    voiceId: ROLE_VOICE_MAP.host,
    displayName: ROLE_DISPLAY_NAME.host,
  },
  expert: {
    voiceId: ROLE_VOICE_MAP.expert,
    displayName: ROLE_DISPLAY_NAME.expert,
  },
} as const

/**
 * Generate audio for all podcast segments using Gemini 2.5 multi-speaker TTS.
 * 
 * VOICE CONSISTENCY: The same voice configuration is used for all chunks.
 * Alex (host) always uses the same voice, Jamie (expert) always uses the same voice.
 * This ensures the podcast sounds like one continuous recording, not multiple stitched together.
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] generateMultiVoiceAudio START:`, {
    segmentCount: segments.length,
    voiceProfileCount: voiceProfiles.length,
    language,
    voiceProfiles: voiceProfiles.map(v => ({ role: v.role, voiceId: v.voiceId })),
  })

  if (segments.length === 0) {
    console.warn('[Audio] No segments provided, returning empty array')
    return []
  }

  // Pre-clean text for all segments (TTS-ready: no markdown, no emojis)
  console.log('[Audio] Pre-cleaning text for all segments...')
  const cleanedTexts = await Promise.all(
    segments.map((s, idx) =>
      makeTtsReadyText(s.text, null, language as any)
        .then(cleaned => {
          console.log(`[Audio] Segment ${idx} cleaned: ${s.text.length} -> ${cleaned.length} chars`)
          return cleaned
        })
        .catch(err => {
          console.warn(`[Audio] Segment ${idx} text cleaning failed, using original:`, err.message)
          return s.text
        })
    )
  )

  console.log('[Audio] Text cleaning complete, checking for empty texts:', {
    totalSegments: segments.length,
    emptyTexts: cleanedTexts.filter(t => !t.trim()).length,
    nonEmptyTexts: cleanedTexts.filter(t => t.trim()).length,
  })

  // Group segments into multi-speaker chunks
  const chunks = buildChunks(segments, cleanedTexts)
  console.log(`[Audio] Grouped ${segments.length} segments into ${chunks.length} multi-speaker chunks`, {
    chunkSizes: chunks.map(c => c.indices.length),
  })

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

    // Build inputs with CONSISTENT voice configuration
    const chunkInputs: MultiSpeakerSegmentInput[] = indices.map((origIdx) => {
      const seg = segments[origIdx]
      const voiceConfig = PODCAST_VOICES[seg.speaker] || PODCAST_VOICES.host
      return {
        id: seg.id || String(origIdx),
        text: cleanedTexts[origIdx],
        role: seg.speaker,
        voiceId: voiceConfig.voiceId,
        displayName: voiceConfig.displayName,
      }
    })

    // Filter out segments with empty text
    const validInputs = chunkInputs.filter(s => s.text.trim().length > 0)

    if (validInputs.length >= 2) {
      // Multi-speaker path
      console.log(`[Audio] Processing multi-speaker chunk: ${validInputs.length} valid inputs from ${indices.length} total segments`)
      try {
        const { results: chunkResults } = await generateGeminiMultiSpeakerChunk(validInputs, language)
        console.log(`[Audio] Multi-speaker API returned ${chunkResults.length} results`)
        
        const resultById = new Map(chunkResults.map(r => [r.id, r]))
        for (const origIdx of indices) {
          const seg = segments[origIdx]
          const id = seg.id || String(origIdx)
          const result = resultById.get(id)
          if (result) {
            results[origIdx] = { audioUrl: result.audioUrl, duration: result.duration }
            console.log(`[Audio] Segment ${origIdx} (${id}): audioUrl=${result.audioUrl ? 'present' : 'MISSING'}, duration=${result.duration}`)
          } else {
            results[origIdx] = { audioUrl: '', duration: 0 }
            console.warn(`[Audio] Segment ${origIdx} (${id}): NO RESULT from multi-speaker API`)
          }
          completedSegments++
        }
        console.log(`[Audio] Multi-speaker chunk done: ${indices.length} segments processed`)
      } catch (err: any) {
        console.error(`[Audio] Multi-speaker chunk FAILED, falling back to single-speaker:`, {
          error: err?.message ?? err,
          stack: err?.stack,
          validInputsCount: validInputs.length,
          indicesCount: indices.length,
        })
        await fallbackSingleSpeaker(indices, segments, cleanedTexts, language, results)
        completedSegments += indices.length
      }
    } else if (validInputs.length === 1) {
      // Only one valid segment in chunk — use single-speaker with consistent voice
      console.log(`[Audio] Processing single-speaker chunk: 1 valid input from ${indices.length} total segments`)
      const origIdx = indices.find(i => cleanedTexts[i].trim().length > 0) ?? indices[0]
      const voiceProfile = getConsistentVoiceProfile(segments[origIdx].speaker, voiceProfiles)
      results[origIdx] = await generateSingleSegment(cleanedTexts[origIdx], voiceProfile, language)
      console.log(`[Audio] Single-speaker result: audioUrl=${results[origIdx].audioUrl ? 'present' : 'MISSING'}, duration=${results[origIdx].duration}`)
      // Mark empty segments
      for (const i of indices) {
        if (i !== origIdx) results[i] = { audioUrl: '', duration: 0 }
      }
      completedSegments += indices.length
    } else {
      // All segments in chunk are empty
      console.warn(`[Audio] All segments in chunk are empty (${indices.length} segments), skipping generation`)
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
  const failedCount = processed.length - successCount
  
  console.log(`[Audio] generateMultiVoiceAudio COMPLETE:`, {
    totalSegments: segments.length,
    successCount,
    failedCount,
    successRate: `${Math.round((successCount / segments.length) * 100)}%`,
  })

  if (failedCount > 0) {
    console.warn(`[Audio] Failed segments details:`, processed
      .map((s, idx) => ({ idx, id: s.id, hasAudio: !!s.audioUrl }))
      .filter(s => !s.hasAudio)
    )
  }

  return processed
}

interface Chunk {
  indices: number[]
}

/**
 * Group all segments into multi-speaker chunks that fit within the char limit.
 */
function buildChunks(segments: PodcastSegment[], cleanedTexts: string[]): Chunk[] {
  const chunks: Chunk[] = []
  let currentIndices: number[] = []
  let currentChars = 0

  for (let i = 0; i < segments.length; i++) {
    const text = cleanedTexts[i]
    const speaker = segments[i].speaker
    const voiceConfig = PODCAST_VOICES[speaker] || PODCAST_VOICES.host
    const segChars = text.length + voiceConfig.displayName.length + 2 // "Name: text"

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

/**
 * Fallback to single-speaker synthesis with consistent voices
 */
async function fallbackSingleSpeaker(
  indices: number[],
  segments: PodcastSegment[],
  cleanedTexts: string[],
  language: string,
  results: Array<{ audioUrl: string; duration: number }>
): Promise<void> {
  console.log(`[Audio] fallbackSingleSpeaker: processing ${indices.length} segments individually`)
  
  for (let i = 0; i < indices.length; i++) {
    const origIdx = indices[i]
    const seg = segments[origIdx]
    const text = cleanedTexts[origIdx]
    
    console.log(`[Audio] Fallback segment ${i + 1}/${indices.length} (origIdx=${origIdx}):`, {
      hasText: !!text.trim(),
      textLength: text.length,
      speaker: seg.speaker,
    })
    
    if (!text.trim()) {
      console.log(`[Audio] Fallback segment ${origIdx}: empty text, skipping`)
      results[origIdx] = { audioUrl: '', duration: 0 }
      continue
    }
    
    const voiceProfile = getConsistentVoiceProfile(seg.speaker, [])
    results[origIdx] = await generateSingleSegment(text, voiceProfile, language)
    console.log(`[Audio] Fallback segment ${origIdx} result:`, {
      hasAudioUrl: !!results[origIdx].audioUrl,
      duration: results[origIdx].duration,
    })
    
    if (i < indices.length - 1) await delay(200)
  }
  
  console.log(`[Audio] fallbackSingleSpeaker complete: ${indices.length} segments processed`)
}

/**
 * Get a voice profile that's consistent with the podcast's voice configuration.
 * This ensures the same speaker always gets the same voice.
 */
function getConsistentVoiceProfile(speaker: string, voiceProfiles: VoiceProfile[]): VoiceProfile {
  const voiceConfig = PODCAST_VOICES[speaker as keyof typeof PODCAST_VOICES] || PODCAST_VOICES.host
  
  // Try to find matching profile from provided profiles
  const fromProfiles = voiceProfiles.find(v => v.role === speaker)
  if (fromProfiles) {
    // Override with consistent voiceId to ensure same voice across all segments
    return {
      ...fromProfiles,
      voiceId: voiceConfig.voiceId,
    }
  }
  
  // Create a consistent profile
  return {
    id: `${speaker}-voice`,
    role: speaker as 'host' | 'expert',
    name: voiceConfig.displayName,
    provider: 'gemini',
    voiceId: voiceConfig.voiceId,
    description: speaker === 'host' ? 'Curious, engaging host' : 'Knowledgeable, approachable expert',
  }
}

async function generateSingleSegment(
  text: string,
  voiceProfile: VoiceProfile,
  language: string,
): Promise<{ audioUrl: string; duration: number }> {
  console.log('[Audio] generateSingleSegment called', {
    textLength: text?.length ?? 0,
    hasText: !!text?.trim(),
    voiceRole: voiceProfile.role,
  })

  if (!text || text.trim().length === 0) {
    console.warn('[Audio] generateSingleSegment: empty text, returning empty result')
    return { audioUrl: '', duration: 0 }
  }
  try {
    const result = await generateGeminiTTSAudio(text, voiceProfile, language)
    console.log('[Audio] generateSingleSegment success:', {
      hasAudioUrl: !!result.audioUrl,
      audioUrlLength: result.audioUrl?.length ?? 0,
      duration: result.duration,
    })
    return { audioUrl: result.audioUrl, duration: result.duration }
  } catch (err: any) {
    console.error(`[Audio] Single-speaker generation failed:`, {
      error: err?.message ?? err,
      stack: err?.stack,
      textLength: text.length,
      voiceRole: voiceProfile.role,
    })
    return { audioUrl: '', duration: 0 }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  // Use consistent host voice
  const consistentHostVoice = getConsistentVoiceProfile('host', [hostVoice])
  const processed: PredictedQuestion[] = []

  for (let i = 0; i < questions.length; i++) {
    if (onProgress) onProgress(i + 1, questions.length)

    try {
      const result = await generateGeminiTTSAudio(questions[i].answer, consistentHostVoice, language)
      processed.push({ ...questions[i], audioUrl: result.audioUrl })
    } catch (error) {
      console.error(`[Audio] Failed to generate audio for question ${i + 1}:`, error)
      processed.push(questions[i])
    }
  }

  console.log('[Audio] Predicted questions audio generation complete')
  return processed
}

export async function mergeAudioSegments(
  segments: PodcastSegment[]
): Promise<{ finalAudioUrl: string; duration: number }> {
  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)
  return { finalAudioUrl: '', duration: totalDuration }
}

export async function postProcessAudio(audioUrl: string): Promise<string> {
  return audioUrl
}
