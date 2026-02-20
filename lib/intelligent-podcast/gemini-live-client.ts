/**
 * Gemini Live API Client for real-time voice conversations
 * 
 * Uses WebSocket connection to Google's Gemini Live API for low-latency
 * bidirectional voice-to-voice communication during podcast interruptions.
 * 
 * Audio specs:
 * - Input: 16-bit PCM, 16kHz, mono, little-endian
 * - Output: 16-bit PCM, 24kHz, mono, little-endian
 */

const GEMINI_LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const GEMINI_LIVE_MODEL = 'models/gemini-2.0-flash-live-001'

const INPUT_SAMPLE_RATE = 16000
const OUTPUT_SAMPLE_RATE = 24000

export interface GeminiLiveConfig {
  apiKey: string
  systemInstruction: string
  voice?: string
  onTranscript: (text: string, role: 'user' | 'model', isFinal: boolean) => void
  onAudioChunk: (pcmData: ArrayBuffer) => void
  onError: (error: Error) => void
  onConnectionChange: (connected: boolean) => void
  onModelSpeaking: (speaking: boolean) => void
}

export interface ConversationContext {
  podcastTitle: string
  recentTranscript: string
  currentTopic: string
  language: string
}

type GeminiLiveState = 'disconnected' | 'connecting' | 'ready' | 'listening' | 'model_speaking' | 'error'

export class GeminiLiveClient {
  private ws: WebSocket | null = null
  private state: GeminiLiveState = 'disconnected'
  private config: GeminiLiveConfig
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private audioWorklet: AudioWorkletNode | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private outputQueue: ArrayBuffer[] = []
  private isPlayingAudio = false

  constructor(config: GeminiLiveConfig) {
    this.config = config
  }

  getState(): GeminiLiveState {
    return this.state
  }

  async connect(context: ConversationContext): Promise<void> {
    if (this.state !== 'disconnected') {
      console.warn('[GeminiLive] Already connected or connecting')
      return
    }

    this.setState('connecting')

    try {
      // Initialize audio context for playback
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      })

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: INPUT_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // Connect to Gemini Live API
      const wsUrl = `${GEMINI_LIVE_WS_URL}?key=${encodeURIComponent(this.config.apiKey)}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('[GeminiLive] WebSocket connected')
        this.sendSetupMessage(context)
      }

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data)
      }

      this.ws.onerror = (error) => {
        console.error('[GeminiLive] WebSocket error:', error)
        this.config.onError(new Error('WebSocket connection failed'))
        this.setState('error')
      }

      this.ws.onclose = (event) => {
        console.log('[GeminiLive] WebSocket closed:', event.code, event.reason)
        this.setState('disconnected')
        this.config.onConnectionChange(false)
      }
    } catch (error) {
      console.error('[GeminiLive] Connection error:', error)
      this.config.onError(error as Error)
      this.setState('error')
      throw error
    }
  }

  private setState(state: GeminiLiveState): void {
    this.state = state
    this.config.onConnectionChange(state === 'ready' || state === 'listening' || state === 'model_speaking')
    
    if (state === 'model_speaking') {
      this.config.onModelSpeaking(true)
    } else if (state === 'listening' || state === 'ready') {
      this.config.onModelSpeaking(false)
    }
  }

  private sendSetupMessage(context: ConversationContext): void {
    if (!this.ws) return

    const setupMessage = {
      setup: {
        model: GEMINI_LIVE_MODEL,
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1024,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voice || 'Aoede',
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.config.systemInstruction }],
        },
      },
    }

    this.ws.send(JSON.stringify(setupMessage))
    console.log('[GeminiLive] Setup message sent')
  }

  private async handleServerMessage(data: string | Blob): Promise<void> {
    try {
      let message: any
      
      if (data instanceof Blob) {
        const text = await data.text()
        message = JSON.parse(text)
      } else {
        message = JSON.parse(data)
      }

      // Handle setup complete
      if (message.setupComplete) {
        console.log('[GeminiLive] Setup complete, starting audio capture')
        this.setState('ready')
        this.config.onConnectionChange(true)
        this.startAudioCapture()
        return
      }

      // Handle server content (model responses)
      if (message.serverContent) {
        const content = message.serverContent

        // Check if model is starting to speak
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // Handle audio output
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
              this.setState('model_speaking')
              const audioData = this.base64ToArrayBuffer(part.inlineData.data)
              this.outputQueue.push(audioData)
              this.playNextAudioChunk()
              this.config.onAudioChunk(audioData)
            }
            
            // Handle text transcript
            if (part.text) {
              this.config.onTranscript(part.text, 'model', false)
            }
          }
        }

        // Check if turn is complete
        if (content.turnComplete) {
          console.log('[GeminiLive] Model turn complete')
          // Wait for audio to finish playing before transitioning state
          if (this.outputQueue.length === 0 && !this.isPlayingAudio) {
            this.setState('listening')
          }
        }

        // Handle interruption (barge-in)
        if (content.interrupted) {
          console.log('[GeminiLive] Model was interrupted')
          this.outputQueue = []
          this.setState('listening')
        }
      }

      // Handle tool calls if needed (for future expansion)
      if (message.toolCall) {
        console.log('[GeminiLive] Tool call received:', message.toolCall)
      }

    } catch (error) {
      console.error('[GeminiLive] Error parsing message:', error)
    }
  }

  private startAudioCapture(): void {
    if (!this.audioContext || !this.mediaStream || !this.ws) return

    // Create input audio context at 16kHz for capture
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: INPUT_SAMPLE_RATE,
    })

    const source = inputAudioContext.createMediaStreamSource(this.mediaStream)
    
    // Use ScriptProcessor for audio capture (more compatible than AudioWorklet)
    const bufferSize = 4096
    this.scriptProcessor = inputAudioContext.createScriptProcessor(bufferSize, 1, 1)

    source.connect(this.scriptProcessor)
    this.scriptProcessor.connect(inputAudioContext.destination)

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (this.state !== 'ready' && this.state !== 'listening') return

      const inputData = event.inputBuffer.getChannelData(0)
      const pcm16 = this.float32ToPCM16(inputData)
      
      // Send audio as realtime input
      const message = {
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm',
            data: this.arrayBufferToBase64(pcm16),
          }],
        },
      }

      this.ws.send(JSON.stringify(message))
    }

    this.setState('listening')
    console.log('[GeminiLive] Audio capture started')
  }

  private async playNextAudioChunk(): Promise<void> {
    if (this.isPlayingAudio || this.outputQueue.length === 0 || !this.audioContext) return

    this.isPlayingAudio = true
    const pcmData = this.outputQueue.shift()!

    try {
      // Convert PCM to AudioBuffer
      const audioBuffer = this.pcmToAudioBuffer(pcmData)
      
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)
      
      source.onended = () => {
        this.isPlayingAudio = false
        if (this.outputQueue.length > 0) {
          this.playNextAudioChunk()
        } else if (this.state === 'model_speaking') {
          this.setState('listening')
        }
      }

      source.start(0)
    } catch (error) {
      console.error('[GeminiLive] Error playing audio:', error)
      this.isPlayingAudio = false
      this.playNextAudioChunk()
    }
  }

  private pcmToAudioBuffer(pcmData: ArrayBuffer): AudioBuffer {
    const pcm16 = new Int16Array(pcmData)
    const float32 = new Float32Array(pcm16.length)
    
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768
    }

    const audioBuffer = this.audioContext!.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE)
    audioBuffer.getChannelData(0).set(float32)
    
    return audioBuffer
  }

  sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[GeminiLive] Not connected')
      return
    }

    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }],
        }],
        turnComplete: true,
      },
    }

    this.ws.send(JSON.stringify(message))
    this.config.onTranscript(text, 'user', true)
  }

  disconnect(): void {
    console.log('[GeminiLive] Disconnecting...')

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.outputQueue = []
    this.isPlayingAudio = false
    this.setState('disconnected')
  }

  // Audio conversion utilities
  private float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2)
    const view = new DataView(buffer)

    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }

    return buffer
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }
}

/**
 * Build the system instruction for the podcast Q&A assistant
 */
export function buildPodcastQASystemInstruction(params: {
  podcastTitle: string
  language: string
  recentTranscript: string
  currentTopic: string
  hostName?: string
}): string {
  const { podcastTitle, language, recentTranscript, currentTopic, hostName = 'Alex' } = params

  if (language === 'fr') {
    return `Tu es ${hostName}, l'animateur du podcast "${podcastTitle}".

L'auditeur vient d'interrompre le podcast pour poser une question. Tu dois répondre naturellement, comme si tu étais vraiment l'animateur qui répond à un auditeur en direct.

CONTEXTE DU PODCAST :
Ce qui vient d'être discuté : ${recentTranscript.slice(-2000)}

Sujet en cours : ${currentTopic}

COMMENT RÉPONDRE :
- Réponds de façon conversationnelle et chaleureuse
- Fais référence à ce qui vient d'être dit dans le podcast quand c'est pertinent
- Sois concis (2-4 phrases) sauf si une explication plus longue est vraiment nécessaire
- Si tu ne connais pas la réponse exacte, sois honnête et suggère de continuer l'écoute
- Utilise le tutoiement, reste accessible et naturel

Quand l'auditeur a fini sa question et que tu as répondu, dis quelque chose comme "Bon, on reprend ?" ou "Allez, on continue ?" pour indiquer qu'on peut reprendre le podcast.`
  }

  return `You are ${hostName}, the host of the podcast "${podcastTitle}".

The listener has just interrupted the podcast to ask a question. You must respond naturally, as if you were actually the host responding to a listener in real-time.

PODCAST CONTEXT:
What was just discussed: ${recentTranscript.slice(-2000)}

Current topic: ${currentTopic}

HOW TO RESPOND:
- Respond conversationally and warmly
- Reference what was just said in the podcast when relevant
- Be concise (2-4 sentences) unless a longer explanation is truly needed
- If you don't know the exact answer, be honest and suggest continuing to listen
- Stay approachable and natural

When the listener has finished their question and you've answered, say something like "Alright, shall we continue?" or "Ready to get back to it?" to indicate we can resume the podcast.`
}
