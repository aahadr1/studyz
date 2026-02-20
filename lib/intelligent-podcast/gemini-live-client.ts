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
const GEMINI_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025'

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
  onReady?: () => void
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
  private inputAudioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private outputQueue: ArrayBuffer[] = []
  private isPlayingAudio = false
  private nextPlayTime = 0 // For gapless scheduling
  private activeSourceNodes: AudioBufferSourceNode[] = [] // Track active sources for cleanup

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
      // Initialize audio context for playback at default sample rate
      // Use default rate and resample in pcmToAudioBuffer for better compatibility
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
        if (this.state !== 'error') {
          this.setState('disconnected')
        }
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

  private sendSetupMessage(_context: ConversationContext): void {
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
    console.log('[GeminiLive] Setup message sent with model:', GEMINI_LIVE_MODEL)
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
        this.startAudioCapture()
        this.config.onReady?.()
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
              this.scheduleAudioChunk(audioData)
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
          // State transition to listening happens after all scheduled audio finishes
          this.scheduleStateTransitionAfterAudio()
        }

        // Handle interruption (barge-in)
        if (content.interrupted) {
          console.log('[GeminiLive] Model was interrupted')
          this.stopAllAudio()
          this.setState('listening')
        }
      }

      // Handle tool calls if needed
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
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: INPUT_SAMPLE_RATE,
    })

    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream)

    // Use ScriptProcessor for audio capture
    const bufferSize = 2048 // Smaller buffer = lower latency (~128ms at 16kHz)
    this.scriptProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1)

    source.connect(this.scriptProcessor)
    this.scriptProcessor.connect(this.inputAudioContext.destination)

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (this.state !== 'ready' && this.state !== 'listening') return

      const inputData = event.inputBuffer.getChannelData(0)
      const pcm16 = this.float32ToPCM16(inputData)

      const message = {
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: this.arrayBufferToBase64(pcm16),
          },
        },
      }

      this.ws.send(JSON.stringify(message))
    }

    this.setState('listening')
    console.log('[GeminiLive] Audio capture started')
  }

  /**
   * Gapless audio scheduling: schedule chunks at precise times
   * instead of waiting for onended callbacks (which cause gaps)
   */
  private scheduleAudioChunk(pcmData: ArrayBuffer): void {
    if (!this.audioContext) return

    try {
      const audioBuffer = this.pcmToAudioBuffer(pcmData)
      const sourceNode = this.audioContext.createBufferSource()
      sourceNode.buffer = audioBuffer
      sourceNode.connect(this.audioContext.destination)

      // Schedule at the next available time slot (gapless)
      const now = this.audioContext.currentTime
      const startTime = Math.max(now, this.nextPlayTime)

      sourceNode.start(startTime)
      this.nextPlayTime = startTime + audioBuffer.duration

      // Track for cleanup
      this.activeSourceNodes.push(sourceNode)
      sourceNode.onended = () => {
        const idx = this.activeSourceNodes.indexOf(sourceNode)
        if (idx !== -1) this.activeSourceNodes.splice(idx, 1)
      }

      this.isPlayingAudio = true
    } catch (error) {
      console.error('[GeminiLive] Error scheduling audio:', error)
    }
  }

  /**
   * After model turn is complete, transition to listening
   * once all scheduled audio has finished playing
   */
  private scheduleStateTransitionAfterAudio(): void {
    if (!this.audioContext) return

    const now = this.audioContext.currentTime
    if (this.nextPlayTime <= now) {
      // All audio already finished
      this.isPlayingAudio = false
      if (this.state === 'model_speaking') {
        this.setState('listening')
      }
      return
    }

    // Wait until scheduled audio finishes
    const remainingMs = (this.nextPlayTime - now) * 1000
    setTimeout(() => {
      this.isPlayingAudio = false
      if (this.state === 'model_speaking') {
        this.setState('listening')
      }
    }, remainingMs + 50) // Small buffer to ensure audio finishes
  }

  /**
   * Stop all currently playing/scheduled audio (for barge-in)
   */
  private stopAllAudio(): void {
    for (const source of this.activeSourceNodes) {
      try { source.stop() } catch {}
    }
    this.activeSourceNodes = []
    this.outputQueue = []
    this.isPlayingAudio = false
    this.nextPlayTime = 0
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

  /**
   * Send a trigger message that will make the AI speak immediately.
   * The AI's voice response will be heard, but neither the trigger nor the response
   * will appear in the UI transcript.
   */
  sendVoiceOnlyGreeting(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[GeminiLive] Not connected')
      return
    }

    // Temporarily disable transcript callback for this exchange
    const originalCallback = this.config.onTranscript
    this.config.onTranscript = () => {} // Suppress transcript for greeting

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

    // Restore callback after AI finishes speaking (after a short delay)
    setTimeout(() => {
      this.config.onTranscript = originalCallback
    }, 3000) // 3s should be enough for a brief greeting
  }

  /**
   * Legacy method - kept for compatibility
   * @deprecated Use sendVoiceOnlyGreeting for greetings
   */
  sendSilentTrigger(text: string): void {
    this.sendVoiceOnlyGreeting(text)
  }

  /**
   * Full cleanup — stops mic, closes WebSocket, releases all audio resources.
   * Returns a Promise that resolves after audio contexts are fully closed,
   * giving the browser time to release hardware audio resources.
   */
  async disconnect(): Promise<void> {
    console.log('[GeminiLive] Disconnecting...')

    // 1. Stop audio capture first (releases microphone hardware)
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }

    // 2. Stop all microphone tracks immediately
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    // 3. Close WebSocket
    if (this.ws) {
      this.ws.onclose = null // Prevent state change callback
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }

    // 4. Stop any playing audio
    this.stopAllAudio()

    // 5. Close audio contexts and wait for them to fully release
    const closePromises: Promise<void>[] = []

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      closePromises.push(this.inputAudioContext.close())
      this.inputAudioContext = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      closePromises.push(this.audioContext.close())
      this.audioContext = null
    }

    // Wait for contexts to close — this ensures hardware audio is fully released
    if (closePromises.length > 0) {
      await Promise.all(closePromises).catch(() => {})
    }

    this.outputQueue = []
    this.isPlayingAudio = false
    this.nextPlayTime = 0
    this.setState('disconnected')

    // Extra settling time for browser audio pipeline to fully reset
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log('[GeminiLive] Fully disconnected, audio pipeline released')
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
