import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech'
import type { VoiceProfile } from '@/types/intelligent-podcast'

// Types for Google Cloud TTS
type AudioEncoding = protos.google.cloud.texttospeech.v1.AudioEncoding
type SynthesisInput = protos.google.cloud.texttospeech.v1.ISynthesisInput
type VoiceSelectionParams = protos.google.cloud.texttospeech.v1.IVoiceSelectionParams
type AudioConfig = protos.google.cloud.texttospeech.v1.IAudioConfig

/**
 * Singleton Google Cloud TTS client for podcast generation
 */
let googleTTSInstance: TextToSpeechClient | null = null

export function getGoogleTTS(): TextToSpeechClient {
  if (!googleTTSInstance) {
    // Check for API key or service account
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set')
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_API_KEY) {
      throw new Error('Either GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_API_KEY must be set')
    }

    // Initialize client with appropriate credentials
    const clientOptions: any = {}
    
    if (process.env.GOOGLE_CLOUD_API_KEY) {
      clientOptions.apiKey = process.env.GOOGLE_CLOUD_API_KEY
    }

    googleTTSInstance = new TextToSpeechClient(clientOptions)
    console.log('[Google TTS] Client initialized successfully')
  }

  return googleTTSInstance
}

/**
 * Generate audio using Google Cloud Gemini TTS
 */
export async function generateGeminiTTSAudio(
  text: string,
  voiceProfile: VoiceProfile,
  language: string,
  prompt?: string
): Promise<{ audioUrl: string; duration: number }> {
  console.log(`[Gemini TTS] Starting generation for ${text.length} characters`)

  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate audio for empty text')
  }

  // Gemini TTS has limits
  if (text.length > 4000) {
    console.warn(`[Gemini TTS] Text too long (${text.length} chars), truncating to 4000`)
    text = text.slice(0, 4000)
  }

  const client = getGoogleTTS()

  // Map our voice profile to Gemini TTS voice
  const geminiVoice = mapVoiceProfileToGemini(voiceProfile, language)
  
  // Create style prompt based on speaker role and context
  const stylePrompt = createStylePrompt(voiceProfile, prompt)
  
  try {
    console.log(`[Gemini TTS] Using voice: ${geminiVoice.name}, model: ${geminiVoice.modelName}`)
    console.log(`[Gemini TTS] Style prompt: "${stylePrompt}"`)

    const synthesisInput: SynthesisInput = {
      text: text,
      prompt: stylePrompt,
    }

    const voice: VoiceSelectionParams = {
      languageCode: geminiVoice.languageCode,
      name: geminiVoice.name,
      modelName: geminiVoice.modelName,
    }

    const audioConfig: AudioConfig = {
      audioEncoding: 'MP3' as AudioEncoding,
      sampleRateHertz: 24000,
    }

    const [response] = await client.synthesizeSpeech({
      input: synthesisInput,
      voice: voice,
      audioConfig: audioConfig,
    })

    if (!response.audioContent) {
      throw new Error('No audio content received from Gemini TTS')
    }

    console.log(`[Gemini TTS] Audio generated, size: ${response.audioContent.length} bytes`)

    // Convert audio to base64 data URL
    const audioBase64 = Buffer.from(response.audioContent).toString('base64')
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

    // Estimate duration more accurately for TTS
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const estimatedDuration = Math.max(1, (wordCount / 135) * 60) // ~135 WPM for natural speech

    console.log(`[Gemini TTS] Generation completed - Words: ${wordCount}, Duration: ${estimatedDuration.toFixed(1)}s`)

    return {
      audioUrl,
      duration: estimatedDuration,
    }
  } catch (error: any) {
    console.error(`[Gemini TTS] Generation failed:`, error)
    console.error(`[Gemini TTS] Error details:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      status: error.status,
    })
    throw new Error(`Gemini TTS failed: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Generate multi-speaker conversation audio using Gemini TTS
 */
export async function generateGeminiConversationAudio(
  segments: Array<{ text: string; speaker: string; voiceProfile: VoiceProfile }>,
  language: string,
  conversationPrompt?: string
): Promise<{ audioUrl: string; duration: number }> {
  console.log(`[Gemini TTS] Starting multi-speaker conversation for ${segments.length} segments`)

  if (segments.length === 0) {
    throw new Error('No segments provided for conversation generation')
  }

  const client = getGoogleTTS()

  // Build conversation text with speaker labels
  const conversationText = segments
    .map(seg => `${seg.speaker}: ${seg.text}`)
    .join('\n')

  // Create conversation style prompt
  const stylePrompt = conversationPrompt || 
    `Generate this as a natural, engaging conversation between ${Array.from(new Set(segments.map(s => s.speaker))).join(' and ')}. Make it sound like real people having a friendly, educational discussion with natural pacing and appropriate emotions.`

  try {
    // Get unique speakers and map to Gemini voices
    const uniqueSpeakers = Array.from(new Set(segments.map(s => s.speaker)))
    const speakerVoiceConfigs = uniqueSpeakers.map((speaker, index) => {
      const segment = segments.find(s => s.speaker === speaker)!
      const geminiVoice = mapVoiceProfileToGemini(segment.voiceProfile, language)
      
      return {
        speakerAlias: speaker,
        speakerId: geminiVoice.name,
      }
    })

    console.log(`[Gemini TTS] Multi-speaker config:`, speakerVoiceConfigs)

    const synthesisInput: SynthesisInput = {
      text: conversationText,
      prompt: stylePrompt,
    }

    const voice: VoiceSelectionParams = {
      languageCode: mapLanguageToGeminiCode(language),
      modelName: 'gemini-2.5-flash-tts',
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: speakerVoiceConfigs.map(config => ({
          speakerAlias: config.speakerAlias,
          speakerId: config.speakerId,
        })),
      },
    }

    const audioConfig: AudioConfig = {
      audioEncoding: 'MP3' as AudioEncoding,
      sampleRateHertz: 24000,
    }

    const [response] = await client.synthesizeSpeech({
      input: synthesisInput,
      voice: voice,
      audioConfig: audioConfig,
    })

    if (!response.audioContent) {
      throw new Error('No audio content received from Gemini TTS conversation')
    }

    console.log(`[Gemini TTS] Conversation audio generated, size: ${response.audioContent.length} bytes`)

    const audioBase64 = Buffer.from(response.audioContent).toString('base64')
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

    // Estimate total duration for conversation
    const totalWordCount = segments.reduce((sum, seg) => 
      sum + seg.text.split(/\s+/).filter(Boolean).length, 0
    )
    const estimatedDuration = Math.max(1, (totalWordCount / 135) * 60)

    console.log(`[Gemini TTS] Conversation completed - Total words: ${totalWordCount}, Duration: ${estimatedDuration.toFixed(1)}s`)

    return {
      audioUrl,
      duration: estimatedDuration,
    }
  } catch (error: any) {
    console.error(`[Gemini TTS] Conversation generation failed:`, error)
    throw new Error(`Gemini TTS conversation failed: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Map our voice profile to Gemini TTS voice selection
 */
function mapVoiceProfileToGemini(voiceProfile: VoiceProfile, language: string): {
  name: string
  languageCode: string
  modelName: string
} {
  const languageCode = mapLanguageToGeminiCode(language)
  
  // Map speaker roles to appropriate Gemini voices
  const voiceMap: Record<string, string> = {
    'host': 'Kore',        // Female, clear and engaging
    'expert': 'Charon',    // Male, authoritative
    'simplifier': 'Aoede', // Female, friendly and approachable
  }

  const voiceName = voiceProfile.voiceId || voiceMap[voiceProfile.role] || 'Kore'

  return {
    name: voiceName,
    languageCode: languageCode,
    modelName: 'gemini-2.5-flash-tts',
  }
}

/**
 * Create style prompt based on voice profile and context
 */
function createStylePrompt(voiceProfile: VoiceProfile, customPrompt?: string): string {
  if (customPrompt) {
    return customPrompt
  }

  const rolePrompts: Record<string, string> = {
    'host': 'Speak as a friendly, curious podcast host who guides the conversation with engaging questions and smooth transitions. Use a warm, conversational tone.',
    'expert': 'Speak as a knowledgeable expert sharing detailed insights. Use a confident, authoritative tone while remaining approachable and clear.',
    'simplifier': 'Speak as someone who excels at making complex topics easy to understand. Use a patient, encouraging tone with clear explanations and helpful analogies.',
  }

  return rolePrompts[voiceProfile.role] || rolePrompts['host']
}

/**
 * Map language codes to Gemini TTS supported codes
 */
function mapLanguageToGeminiCode(language: string): string {
  const languageMap: Record<string, string> = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt': 'pt-BR',
    'ru': 'ru-RU',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'cmn-CN',
    'ar': 'ar-EG',
    'hi': 'hi-IN',
    'auto': 'en-US',
  }

  return languageMap[language] || 'en-US'
}

/**
 * Reset the Google TTS client instance (useful for testing)
 */
export function resetGoogleTTS(): void {
  googleTTSInstance = null
}