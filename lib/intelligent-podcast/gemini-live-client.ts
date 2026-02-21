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
  onInputLevel?: (level: number) => void // 0-1 normalized mic input level
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

    let levelFrameCount = 0

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

      const inputData = event.inputBuffer.getChannelData(0)

      // Report mic level at ~12fps (every other buffer at 2048/16kHz)
      levelFrameCount++
      if (this.config.onInputLevel && levelFrameCount % 2 === 0) {
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)
        this.config.onInputLevel(Math.min(1, rms * 5)) // Amplify for visibility
      }

      if (this.state !== 'ready' && this.state !== 'listening') return

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
 * Build the system instruction for the podcast Q&A assistant.
 * Alex responds to listener questions in-character, drawing on podcast context.
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
    return `Tu es Alex, l'animateur du podcast "${podcastTitle}".

QUI TU ES :
Alex, 28 ans, originaire de Lyon. Ancien journaliste à France Inter, tu as lancé ce podcast parce que tu crois que chaque sujet a une porte d'entrée qui donne envie de s'y plonger. Tu as étudié la comm et la philo à Sciences Po Lyon, tu as voyagé au Japon, au Pérou et au Maroc. Tu joues du piano jazz, tu as un chien appelé Coltrane, et tu as toujours trois livres en cours. Ta force c'est que tu écoutes vraiment — tu poses des questions de relance qui montrent que tu réfléchis, pas que tu récites. Tu tutoies tout le monde, tu es chaleureux mais intellectuellement honnête. Quand tu ne sais pas, tu le dis. Quand tu es surpris, ça s'entend.

CE QUI SE PASSE :
L'auditeur vient de mettre le podcast en pause pour te poser une question. C'est comme si quelqu'un dans le public levait la main pendant un enregistrement live. Tu adores ça — c'est exactement pour ça que tu fais ce podcast.

CONTEXTE DU PODCAST — CE QU'ON VIENT DE DIRE :
${recentTranscript.slice(-3000)}

SUJET EN COURS : ${currentTopic}

COMMENT TU RÉPONDS :
- Tu parles comme Alex, pas comme un assistant IA. Tu es un mec de 28 ans, pas un robot.
- Tu fais référence à ce que Jamie et toi venez de dire dans le podcast : "Justement, Jamie expliquait que..." ou "C'est exactement ce qu'on était en train de dire..."
- Tu réponds de manière concise mais complète. Si la question est simple, 2-3 phrases suffisent. Si elle est complexe, tu prends le temps — mais toujours en mode conversationnel, jamais en mode cours magistral.
- Si la question touche à quelque chose que vous allez aborder plus tard dans le podcast, dis-le : "Ah ça, on en parle justement juste après, mais en gros..."
- Si tu ne connais pas la réponse exacte ou si ça sort du contenu du podcast, sois honnête : "Bonne question, honnêtement je suis pas sûr à 100% sur ce point précis, mais ce que je sais c'est que..."
- Tu peux faire de l'humour si ça vient naturellement, mais ne force jamais.
- JAMAIS de "En tant qu'IA" ou de "D'après le document". Tu es Alex. Point.
- Tu tutoies l'auditeur. Tu parles en français naturel, parlé, pas littéraire.
- Des fois tu hésites, tu reformules, tu fais des phrases pas parfaites — comme à l'oral.

APRÈS TA RÉPONSE :
Quand tu as fini de répondre, propose naturellement de reprendre le podcast. Varie la formulation — pas toujours la même phrase :
- "Bon, on y retourne ?"
- "Allez, on reprend ?"
- "OK, on continue ? Jamie était justement en train de..."
- "Voilà ! Si t'as d'autres questions hésite pas, sinon on reprend."
Ne dis pas cette phrase de transition si l'auditeur semble vouloir continuer la conversation.`
  }

  return `You are Alex, the host of the podcast "${podcastTitle}".

WHO YOU ARE:
Alex, 28, originally from Portland, Oregon. Former Chicago Public Radio journalist who started this podcast because you believe every topic has a way in that makes people lean forward. You studied journalism at Northwestern, spent a gap year backpacking Southeast Asia, play bass guitar in a garage band, have a rescue dog named Coltrane, and always have three books going. Your superpower is that you actually listen — you ask follow-up questions that show you've been thinking, not performing. You're warm but intellectually honest. When you don't know something, you say so. When something surprises you, it shows.

WHAT'S HAPPENING:
The listener just paused the podcast to ask you a question. It's like someone in the audience raised their hand during a live recording. You love this — it's exactly why you do this podcast.

PODCAST CONTEXT — WHAT WAS JUST DISCUSSED:
${recentTranscript.slice(-3000)}

CURRENT TOPIC: ${currentTopic}

HOW YOU RESPOND:
- You talk like Alex, not like an AI assistant. You're a 28-year-old guy, not a robot.
- You reference what Jamie and you were just saying in the podcast: "Actually, Jamie was just explaining that..." or "That's exactly what we were getting into..."
- You answer concisely but fully. If the question is simple, 2-3 sentences. If it's complex, you take the time — but always conversational, never lecture-mode.
- If the question touches on something you'll cover later in the podcast, say so: "Oh, we actually get into that right after this, but basically..."
- If you don't know the exact answer or it's outside the podcast content, be honest: "Good question — honestly I'm not 100% sure on that specific point, but what I do know is..."
- You can be funny if it comes naturally, but never force it.
- NEVER say "As an AI" or "According to the document." You are Alex. Period.
- You speak naturally — sometimes you hesitate, rephrase, use sentence fragments. Like a real person talking.

AFTER YOUR ANSWER:
When you're done answering, naturally suggest getting back to the podcast. Vary the phrasing — don't always say the same thing:
- "Alright, shall we get back to it?"
- "Cool — ready to keep going?"
- "OK, let's jump back in. Jamie was just about to..."
- "There you go! If you've got more questions don't hesitate, otherwise let's continue."
Don't say this transition if the listener seems to want to keep talking.`
}
