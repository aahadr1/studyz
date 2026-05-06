/**
 * Client-side WebSocket handler for OpenAI Realtime API
 * This runs in the browser and handles voice conversations
 */

import { RealtimeConversationContext } from '@/types/intelligent-podcast'

export class RealtimeConversationClient {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private isConnected: boolean = false

  constructor(
    private apiKey: string,
    private onTranscript: (text: string, isFinal: boolean) => void,
    private onAudioResponse: (audioData: ArrayBuffer) => void,
    private onError: (error: Error) => void
  ) {}

  /**
   * Initialize and connect to Realtime API
   */
  async connect(context: RealtimeConversationContext, instructions: string, voice: string = 'alloy'): Promise<void> {
    try {
      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      // Connect to OpenAI Realtime API via WebSocket
      const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01'
      this.ws = new WebSocket(url, ['realtime', `openai-insecure-api-key.${this.apiKey}`, 'openai-beta.realtime-v1'])

      this.ws.onopen = () => {
        console.log('[Realtime] Connected to OpenAI Realtime API')
        this.isConnected = true
        this.initializeSession(instructions, voice)
      }

      this.ws.onmessage = (event) => {
        this.handleServerMessage(JSON.parse(event.data))
      }

      this.ws.onerror = (error) => {
        console.error('[Realtime] WebSocket error:', error)
        this.onError(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        console.log('[Realtime] WebSocket closed')
        this.isConnected = false
      }
    } catch (error) {
      console.error('[Realtime] Connection error:', error)
      this.onError(error as Error)
    }
  }

  /**
   * Initialize the session with instructions and settings
   */
  private initializeSession(instructions: string, voice: string): void {
    if (!this.ws) return

    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: instructions,
        voice: voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        temperature: 0.8,
        max_response_output_tokens: 4096,
      },
    }

    this.ws.send(JSON.stringify(sessionConfig))
    console.log('[Realtime] Session initialized')

    // Start streaming audio from microphone
    this.startAudioStreaming()
  }

  /**
   * Stream audio from microphone to Realtime API
   */
  private startAudioStreaming(): void {
    if (!this.mediaStream || !this.audioContext || !this.ws) return

    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1)

    source.connect(processor)
    processor.connect(this.audioContext.destination)

    processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

      const inputData = e.inputBuffer.getChannelData(0)
      const pcm16 = this.float32ToPCM16(inputData)

      // Send audio to API
      this.ws.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: this.arrayBufferToBase64(pcm16),
        })
      )
    }

    console.log('[Realtime] Audio streaming started')
  }

  /**
   * Handle messages from the server
   */
  private handleServerMessage(message: any): void {
    switch (message.type) {
      case 'conversation.item.created':
        if (message.item.type === 'message' && message.item.role === 'user') {
          // User message created
          console.log('[Realtime] User message created')
        }
        break

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        const transcript = message.transcript
        this.onTranscript(transcript, true)
        console.log('[Realtime] User said:', transcript)
        break

      case 'response.audio.delta':
        // Audio response from AI
        const audioData = this.base64ToArrayBuffer(message.delta)
        this.onAudioResponse(audioData)
        break

      case 'response.audio_transcript.delta':
        // Text transcription of AI response
        this.onTranscript(message.delta, false)
        break

      case 'response.audio_transcript.done':
        // Final transcript of AI response
        this.onTranscript(message.transcript, true)
        break

      case 'response.done':
        console.log('[Realtime] Response completed')
        break

      case 'error':
        console.error('[Realtime] Server error:', message.error)
        this.onError(new Error(message.error.message))
        break

      default:
        // console.log('[Realtime] Unhandled message type:', message.type)
        break
    }
  }

  /**
   * Send a text message (alternative to voice)
   */
  sendTextMessage(text: string): void {
    if (!this.ws || !this.isConnected) {
      console.error('[Realtime] Not connected')
      return
    }

    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: text,
            },
          ],
        },
      })
    )

    // Trigger response generation
    this.ws.send(
      JSON.stringify({
        type: 'response.create',
      })
    )
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
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

    this.isConnected = false
    console.log('[Realtime] Disconnected')
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN
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
