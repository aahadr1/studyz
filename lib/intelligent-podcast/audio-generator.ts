import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
// Gemini TTS disabled; OpenAI only
import getOpenAI from '../openai'

/**
 * Generate audio for all podcast segments with multiple voices
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] generateMultiVoiceAudio: segments=${segments.length}, provider=${voiceProfiles[0]?.provider ?? 'unknown'}, hasOnProgress=${Boolean(onProgress)}`)
  console.log(`[Audio] Using individual segment generation for ${segments.length} segments`)
  return generateIndividualSegments(segments, voiceProfiles, language, onProgress)
}

/**
 * Generate individual segments (fallback method)
 */
async function generateIndividualSegments(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] Starting individual audio generation for ${segments.length} segments`)

  if (segments.length === 0) {
    console.warn(`[Audio] No segments provided for audio generation`)
    return []
  }

  const processedSegments: PodcastSegment[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const segmentNumber = i + 1

    console.log(`[Audio] Processing segment ${segmentNumber}/${segments.length}: ${segment.id}`)

    // Update progress before starting
    if (onProgress) {
      const step = `Generating audio for segment ${segmentNumber}/${segments.length} (${segment.speaker})`
      await onProgress(i, segments.length, step)
    }

    // Validate segment
    if (!segment.text || segment.text.trim().length === 0) {
      console.warn(`[Audio] Segment ${segmentNumber} has empty text, skipping`)
      processedSegments.push(segment)
      continue
    }

    // Find the appropriate voice profile for this speaker
    const voiceProfile = voiceProfiles.find((v) => v.role === segment.speaker) || voiceProfiles[0]
    console.log(`[Audio] Using voice profile: ${voiceProfile.role} (${voiceProfile.provider})`)

    try {
      // Generate audio based on provider
      let audioUrl: string
      let actualDuration: number

      console.log(`[Audio] Starting TTS for segment ${segmentNumber}...`)
      
      // Only OpenAI TTS is supported for podcast audio
      const result = await generateOpenAIAudio(segment.text, voiceProfile, language)
      audioUrl = result.audioUrl
      actualDuration = result.duration

      processedSegments.push({
        ...segment,
        audioUrl,
        duration: actualDuration,
      })

      console.log(`[Audio] ✅ Segment ${segmentNumber} completed: ${actualDuration.toFixed(1)}s, audio length: ${audioUrl.length} chars`)

      if (onProgress) {
        const step = `Segment ${segmentNumber}/${segments.length} audio generated`
        console.log(`[Audio] onProgress after segment ${segmentNumber}: (${segmentNumber}, ${segments.length}, "${step}")`)
        await onProgress(segmentNumber, segments.length, step)
      }

    } catch (error: any) {
      console.error(`[Audio] ❌ Failed to generate audio for segment ${segmentNumber}/${segments.length}:`, error?.message ?? error)
      console.error(`[Audio] Segment details:`, {
        id: segment.id,
        speaker: segment.speaker,
        textLength: segment.text?.length ?? 0,
        textPreview: segment.text?.slice(0, 100) + '...'
      })
      console.error(`[Audio] Error details:`, { message: error?.message, code: error?.code, name: error?.name })

      // Add segment without audio but don't fail the entire process
      processedSegments.push({
        ...segment,
        audioUrl: '', // Empty audio URL indicates failure
        duration: 0
      })

      // Still update progress to show we attempted this segment
      if (onProgress) {
        const step = `Segment ${segmentNumber}/${segments.length} failed (continuing...)`
        await onProgress(segmentNumber, segments.length, step)
      }
    }

    // Small delay between segments to avoid rate limiting
    if (i < segments.length - 1) {
      console.log(`[Audio] Waiting 200ms before next segment...`)
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  const successCount = processedSegments.filter(s => s.audioUrl && s.audioUrl.length > 0).length
  console.log(`[Audio] Individual generation completed: ${successCount}/${segments.length} segments successful`)
  
  return processedSegments
}

/**
 * Generate audio using ElevenLabs (highest quality)
 */
async function generateElevenLabsAudio(
  text: string,
  voiceProfile: VoiceProfile,
  language: string
): Promise<{ audioUrl: string; duration: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  const cleanedText = await makeTtsReadyText(text, null, language as any)

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceProfile.voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanedText,
        model_id: 'eleven_turbo_v2_5', // Fastest model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`ElevenLabs error: ${error}`)
  }

  const audioBuffer = await response.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')
  const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

  // Estimate duration (rough: ~150 words per minute)
  const wordCount = cleanedText.split(/\s+/).length
  const estimatedDuration = (wordCount / 150) * 60

  return {
    audioUrl,
    duration: estimatedDuration,
  }
}

/**
 * Generate audio using PlayHT
 */
async function generatePlayHTAudio(
  text: string,
  voiceProfile: VoiceProfile,
  language: string
): Promise<{ audioUrl: string; duration: number }> {
  const userId = process.env.PLAYHT_USER_ID
  const apiKey = process.env.PLAYHT_API_KEY

  if (!userId || !apiKey) {
    throw new Error('PlayHT credentials not configured')
  }

  const cleanedText = await makeTtsReadyText(text, null, language as any)

  const response = await fetch('https://api.play.ht/api/v2/tts', {
    method: 'POST',
    headers: {
      'AUTHORIZATION': apiKey,
      'X-USER-ID': userId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: cleanedText,
      voice: voiceProfile.voiceId,
      quality: 'premium',
      output_format: 'mp3',
      speed: 1,
      sample_rate: 24000,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PlayHT error: ${error}`)
  }

  const result = await response.json()
  const audioUrl = result.url || result.audio_url

  if (!audioUrl) {
    throw new Error('PlayHT did not return audio URL')
  }

  // Estimate duration
  const wordCount = cleanedText.split(/\s+/).length
  const estimatedDuration = (wordCount / 150) * 60

  return {
    audioUrl,
    duration: estimatedDuration,
  }
}

/**
 * Pre-generate audio for predicted questions (uses Gemini TTS)
 */
export async function generatePredictedQuestionsAudio(
  questions: PredictedQuestion[],
  language: string,
  hostVoice: VoiceProfile,
  onProgress?: (current: number, total: number) => void
): Promise<PredictedQuestion[]> {
  console.log(`[Audio] Generating audio for ${questions.length} predicted questions`)

  const processedQuestions: PredictedQuestion[] = []

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]

    if (onProgress) {
      onProgress(i + 1, questions.length)
    }

    try {
      // Generate audio for the answer using host voice via Gemini TTS
      const result = await generateOpenAIAudio(question.answer, hostVoice, language)

      processedQuestions.push({
        ...question,
        audioUrl: result.audioUrl,
      })
    } catch (error) {
      console.error(`[Audio] Failed to generate audio for question ${i + 1}:`, error)
      processedQuestions.push(question)
    }
  }

  console.log('[Audio] Predicted questions audio generation completed')
  return processedQuestions
}

/**
 * Merge audio segments into a single file (requires FFmpeg)
 * This is a placeholder - actual implementation would require FFmpeg processing
 */
export async function mergeAudioSegments(
  segments: PodcastSegment[]
): Promise<{ finalAudioUrl: string; duration: number }> {
  // For now, we'll just return the segments as-is
  // In production, you would use FFmpeg to merge all audio files
  console.log('[Audio] Audio merging not implemented - segments will be played sequentially')

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)

  return {
    finalAudioUrl: '', // Would be the merged audio file URL
    duration: totalDuration,
  }
}

/**
 * Post-process audio (normalize volume, add transitions)
 * This is a placeholder - actual implementation would require audio processing
 */
export async function postProcessAudio(audioUrl: string): Promise<string> {
  // In production, you would:
  // 1. Download the audio
  // 2. Normalize volume with FFmpeg
  // 3. Add fade in/out effects
  // 4. Compress for web delivery
  // 5. Upload to storage
  // 6. Return new URL

  console.log('[Audio] Post-processing not implemented - using original audio')
  return audioUrl
}

/**
 * Generate audio using OpenAI TTS (gpt-4o-mini-tts)
 */
async function generateOpenAIAudio(
  text: string,
  voiceProfile: VoiceProfile,
  language: string
): Promise<{ audioUrl: string; duration: number }> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate audio for empty text')
  }

  // Clean / trim input
  const openai = getOpenAI()
  let cleanedText = text.slice(0, 5000)
  try {
    cleanedText = await makeTtsReadyText(cleanedText, openai as any, language as any)
  } catch {
    // ignore cleaning errors, use raw
  }

  // Map role to voices and speaking instructions for gpt-4o-mini-tts
  const voiceMap: Record<string, string> = {
    host: 'shimmer',    // soft, inviting
    expert: 'onyx',     // rich, authoritative
    simplifier: 'nova', // bright, energetic
  }
  const instructionsMap: Record<string, string> = {
    host: 'Speak in a warm, curious, and conversational tone like a friendly podcast host. Be engaging and inviting, with natural pauses and emphasis. Vary your intonation to keep the listener interested.',
    expert: 'Speak in a confident, authoritative, and knowledgeable tone like a subject-matter expert on a podcast. Be clear and articulate, with a rich and steady delivery. Use natural emphasis on key terms.',
    simplifier: 'Speak in a bright, energetic, and approachable tone like someone who loves making complex things simple. Be enthusiastic and use a lively pace with natural variation in pitch and rhythm.',
  }
  const voice = voiceProfile.voiceId || voiceMap[voiceProfile.role] || 'shimmer'
  const instructions = instructionsMap[voiceProfile.role] || instructionsMap.host

  // Call OpenAI TTS with gpt-4o-mini-tts for natural, expressive speech
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TTS timeout after 30s')), 30000))
  const ttsPromise = (openai as any).audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice,
    input: cleanedText,
    instructions,
  })

  const response = (await Promise.race([ttsPromise, timeout])) as any
  const audioBuffer = await response.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')
  const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

  // Estimate duration
  const wordCount = cleanedText.split(/\s+/).filter(Boolean).length
  const duration = Math.max(1, (wordCount / 135) * 60)

  return { audioUrl, duration }
}
