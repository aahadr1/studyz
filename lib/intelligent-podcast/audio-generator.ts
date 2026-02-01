import { PodcastSegment, VoiceProfile, PredictedQuestion } from '@/types/intelligent-podcast'
import { makeTtsReadyText } from '../tts'
import { getOpenAI } from './openai-client'
import { generateGeminiTTSAudio, generateGeminiConversationAudio } from './google-tts-client'

/**
 * Generate audio for all podcast segments with multiple voices
 */
export async function generateMultiVoiceAudio(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  // Check if we're using Gemini TTS and should use conversation mode
  const isGeminiProvider = voiceProfiles.some(v => v.provider === 'gemini')
  
  if (isGeminiProvider && segments.length > 1) {
    console.log(`[Audio] Using Gemini conversation mode for ${segments.length} segments`)
    return generateGeminiConversation(segments, voiceProfiles, language, onProgress)
  }
  return generateIndividualSegments(segments, voiceProfiles, language, onProgress)
}

/**
 * Generate conversation audio using Gemini's multi-speaker capabilities
 */
async function generateGeminiConversation(
  segments: PodcastSegment[],
  voiceProfiles: VoiceProfile[],
  language: string,
  onProgress?: (current: number, total: number, step: string) => Promise<void> | void
): Promise<PodcastSegment[]> {
  console.log(`[Audio] Starting Gemini conversation generation for ${segments.length} segments`)

  if (onProgress) {
    await onProgress(0, segments.length, 'Preparing conversation generation...')
  }

  try {
    // Prepare conversation segments
    const conversationSegments = segments.map(segment => {
      const voiceProfile = voiceProfiles.find(v => v.role === segment.speaker) || voiceProfiles[0]
      return {
        text: segment.text,
        speaker: segment.speaker,
        voiceProfile: voiceProfile,
      }
    })

    // Create conversation prompt
    const speakers = Array.from(new Set(segments.map(s => s.speaker)))
    const conversationPrompt = `Generate this as a natural, engaging educational podcast conversation between ${speakers.join(' and ')}. 

The conversation should feel authentic with:
- Natural pacing and rhythm
- Appropriate emotional responses
- Smooth transitions between speakers
- Educational yet conversational tone
- Clear pronunciation of technical terms

Each speaker has their role:
- Host: Guides the conversation, asks insightful questions
- Expert: Provides detailed explanations with authority
- Simplifier: Makes complex topics accessible with analogies`

    if (onProgress) {
      await onProgress(segments.length / 2, segments.length, 'Generating conversation audio...')
    }

    // Generate the entire conversation as one cohesive audio
    const result = await generateGeminiConversationAudio(
      conversationSegments,
      language,
      conversationPrompt
    )

    // Since Gemini generates one continuous audio for the conversation,
    // we need to split it back into segments with estimated timings
    const totalDuration = result.duration
    let currentTime = 0
    
    const processedSegments: PodcastSegment[] = segments.map((segment, index) => {
      // Estimate segment duration based on text length
      const segmentWordCount = segment.text.split(/\s+/).filter(Boolean).length
      const totalWordCount = segments.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0)
      const segmentDuration = (segmentWordCount / totalWordCount) * totalDuration
      
      const processedSegment: PodcastSegment = {
        ...segment,
        audioUrl: result.audioUrl, // Same audio URL for all segments in conversation
        duration: segmentDuration,
        timestamp: currentTime,
      }
      
      currentTime += segmentDuration
      return processedSegment
    })

    if (onProgress) {
      await onProgress(segments.length, segments.length, 'Conversation generation completed')
    }

    console.log(`[Audio] ✅ Gemini conversation completed: ${totalDuration.toFixed(1)}s total duration`)
    return processedSegments

  } catch (error: any) {
    console.error(`[Audio] ❌ Gemini conversation generation failed:`, error)
    
    // Fallback to individual segment generation
    console.log(`[Audio] Falling back to individual segment generation...`)
    return generateIndividualSegments(segments, voiceProfiles, language, onProgress)
  }
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
      
      if (voiceProfile.provider === 'gemini') {
        // Use Google Cloud Gemini TTS
        const result = await generateGeminiTTSAudio(segment.text, voiceProfile, language)
        audioUrl = result.audioUrl
        actualDuration = result.duration
      } else if (voiceProfile.provider === 'elevenlabs') {
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

      console.log(`[Audio] ✅ Segment ${segmentNumber} completed: ${actualDuration.toFixed(1)}s, audio length: ${audioUrl.length} chars`)

      // Update progress after completion
      if (onProgress) {
        const step = `Segment ${segmentNumber}/${segments.length} audio generated`
        await onProgress(segmentNumber, segments.length, step)
      }

    } catch (error: any) {
      console.error(`[Audio] ❌ Failed to generate audio for segment ${segmentNumber}:`, error)
      console.error(`[Audio] Segment details:`, {
        id: segment.id,
        speaker: segment.speaker,
        textLength: segment.text?.length || 0,
        textPreview: segment.text?.slice(0, 100) + '...'
      })
      
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
  console.log(`[Audio] Starting OpenAI TTS for ${text.length} characters`)
  
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate audio for empty text')
  }
  
  if (text.length > 4096) {
    console.warn(`[Audio] Text too long (${text.length} chars), truncating to 4096`)
    text = text.slice(0, 4096)
  }

  const openai = getOpenAI()
  let cleanedText: string
  
  try {
    cleanedText = await makeTtsReadyText(text, openai, language as any)
    console.log(`[Audio] Text cleaned, length: ${cleanedText.length}`)
  } catch (cleanError) {
    console.warn(`[Audio] Text cleaning failed, using original:`, cleanError)
    cleanedText = text
  }

  // Map role to OpenAI voice
  const voiceMap: Record<string, any> = {
    host: 'nova', // Female
    expert: 'onyx', // Male
    simplifier: 'shimmer', // Female
  }

  const voice = voiceProfile.voiceId || voiceMap[voiceProfile.role] || 'alloy'

  try {
    console.log(`[Audio] Calling OpenAI TTS with voice: ${voice}, text length: ${cleanedText.length}`)
    
    // Add timeout wrapper for the TTS call
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TTS timeout after 30 seconds')), 30000)
    })
    
    const ttsPromise = openai.audio.speech.create({
      model: 'tts-1', // Use standard model for reliability
      voice: voice as any,
      input: cleanedText,
      speed: 1.0,
    })

    const response = await Promise.race([ttsPromise, timeoutPromise]) as any
    console.log(`[Audio] OpenAI TTS response received`)

    const audioBuffer = await response.arrayBuffer()
    console.log(`[Audio] Audio buffer size: ${audioBuffer.byteLength} bytes`)
    
    const audioBase64 = Buffer.from(audioBuffer).toString('base64')
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

    // Estimate duration more accurately
    const wordCount = cleanedText.split(/\s+/).filter(Boolean).length
    const estimatedDuration = Math.max(1, (wordCount / 135) * 60) // Ensure minimum 1 second

    console.log(`[Audio] OpenAI TTS completed successfully - Words: ${wordCount}, Duration: ${estimatedDuration.toFixed(1)}s`)

    return {
      audioUrl,
      duration: estimatedDuration,
    }
  } catch (ttsError: any) {
    console.error(`[Audio] OpenAI TTS failed:`, ttsError)
    console.error(`[Audio] Error details:`, {
      message: ttsError.message,
      code: ttsError.code,
      type: ttsError.type,
      status: ttsError.status
    })
    throw new Error(`OpenAI TTS failed: ${ttsError.message || 'Unknown error'}`)
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
