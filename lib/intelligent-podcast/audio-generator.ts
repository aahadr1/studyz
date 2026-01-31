import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
import { getOpenAI } from './openai-client'

/**
 * Generate audio for all podcast segments with multiple voices
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] Starting audio generation for ${segments.length} segments`)

  const processedSegments: PodcastSegment[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]

    if (onProgress) {
      onProgress(i + 1, segments.length, `Generating audio for segment ${i + 1}/${segments.length}`)
    }

    // Find the appropriate voice profile for this speaker
    const voiceProfile = voiceProfiles.find((v) => v.role === segment.speaker) || voiceProfiles[0]

    try {
      // Generate audio based on provider
      let audioUrl: string
      let actualDuration: number

      if (voiceProfile.provider === 'elevenlabs') {
        const result = await generateElevenLabsAudio(segment.text, voiceProfile, language)
        audioUrl = result.audioUrl
        actualDuration = result.duration
      } else if (voiceProfile.provider === 'playht') {
        const result = await generatePlayHTAudio(segment.text, voiceProfile, language)
        audioUrl = result.audioUrl
        actualDuration = result.duration
      } else {
        // Default to OpenAI TTS
        const result = await generateOpenAIAudio(segment.text, voiceProfile, language)
        audioUrl = result.audioUrl
        actualDuration = result.duration
      }

      processedSegments.push({
        ...segment,
        audioUrl,
        duration: actualDuration,
      })

      console.log(`[Audio] Segment ${i + 1} completed: ${actualDuration.toFixed(1)}s`)
    } catch (error) {
      console.error(`[Audio] Failed to generate audio for segment ${i + 1}:`, error)
      // Add segment without audio
      processedSegments.push(segment)
    }
  }

  console.log('[Audio] All segments processed successfully')
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

  const openai = getOpenAI()
  const cleanedText = await makeTtsReadyText(text, openai, language as any)

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

  const openai = getOpenAI()
  const cleanedText = await makeTtsReadyText(text, openai, language as any)

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
 * Generate audio using OpenAI TTS (fallback, already available)
 */
async function generateOpenAIAudio(
  text: string,
  voiceProfile: VoiceProfile,
  language: string
): Promise<{ audioUrl: string; duration: number }> {
  const openai = getOpenAI()
  const cleanedText = await makeTtsReadyText(text, openai, language as any)

  // Map role to OpenAI voice
  const voiceMap: Record<string, any> = {
    host: 'nova', // Female
    expert: 'onyx', // Male
    simplifier: 'shimmer', // Female
  }

  const voice = voiceProfile.voiceId || voiceMap[voiceProfile.role] || 'alloy'

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd', // High quality
    voice: voice as any,
    input: cleanedText,
    speed: 1.0,
  })

  const audioBuffer = await response.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')
  const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

  // Estimate duration
  const wordCount = cleanedText.split(/\s+/).length
  const estimatedDuration = (wordCount / 150) * 60

  return {
    audioUrl,
    duration: estimatedDuration,
  }
}

/**
 * Pre-generate audio for predicted questions
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
      // Generate audio for the answer using host voice
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
