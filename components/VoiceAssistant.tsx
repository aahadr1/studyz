'use client'

import { useState, useEffect, useRef } from 'react'
import { FiMic, FiMicOff, FiVolume2, FiVolumeX, FiAlertCircle, FiLoader } from 'react-icons/fi'

interface VoiceAssistantProps {
  documentId: string
  pageNumber: number
  lessonId: string
  getPageImage?: () => Promise<string | null>
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function VoiceAssistant({
  documentId,
  pageNumber,
  lessonId,
  getPageImage,
}: VoiceAssistantProps) {
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [status, setStatus] = useState<string>('Ready to start')
  const [conversation, setConversation] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  // Extract page context when starting session
  const extractPageContext = async (): Promise<string> => {
    if (!getPageImage) {
      return ''
    }

    try {
      setStatus('Analyzing page...')
      console.log('📸 Capturing page for context...')
      
      const pageImageData = await getPageImage()
      if (!pageImageData) {
        console.warn('⚠️ No page image available')
        return ''
      }

      console.log('📄 Extracting text from page...')

      // Use GPT-4o-mini to extract text from page
      const response = await fetch('/api/voice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'EXTRACT_TEXT_ONLY',
          pageNumber,
          pageImageData,
          conversationHistory: [],
        }),
      })

      if (!response.ok) {
        console.warn('⚠️ Failed to extract page context')
        return ''
      }

      const data = await response.json()
      console.log('✅ Page context extracted')
      
      return data.pageContext || ''

    } catch (error) {
      console.error('❌ Error extracting page context:', error)
      return ''
    }
  }

  const startRealtimeSession = async () => {
    try {
      setIsConnecting(true)
      setError(null)
      setStatus('Preparing...')

      // Extract page context first
      const pageContext = await extractPageContext()

      setStatus('Connecting...')
      console.log('🔌 Starting OpenAI Realtime API session with WebRTC')

      // Get ephemeral token from our backend
      const tokenResponse = await fetch('/api/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageNumber,
          pageContext,
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to get session token')
      }

      const { clientSecret } = await tokenResponse.json()
      console.log('✅ Got ephemeral token')

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection()
      peerConnectionRef.current = pc

      // Set up audio element for playback
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioElementRef.current = audioEl
      
      pc.ontrack = (event) => {
        console.log('🔊 Received audio track')
        audioEl.srcObject = event.streams[0]
      }

      // Add microphone audio track
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      })
      
      pc.addTrack(stream.getTracks()[0])
      console.log('🎤 Microphone added to peer connection')

      // Set up data channel for events
      const dc = pc.createDataChannel('oai-events')
      dataChannelRef.current = dc

      dc.onopen = () => {
        console.log('✅ Data channel opened')
        setIsActive(true)
        setIsConnecting(false)
        setIsListening(true)
        setStatus('Listening...')

        // Send session update with instructions
        const sessionUpdate = {
          type: 'session.update',
          session: {
            turn_detection: { type: 'server_vad' },
            input_audio_transcription: { model: 'whisper-1' },
          },
        }
        dc.send(JSON.stringify(sessionUpdate))

        // Add welcome message
        const welcomeMsg: Message = {
          role: 'assistant',
          content: `Hi! I'm your voice study assistant. I can see page ${pageNumber} of your document. Ask me anything!`,
          timestamp: new Date(),
        }
        setConversation([welcomeMsg])
      }

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleRealtimeEvent(message)
        } catch (error) {
          console.error('Error parsing data channel message:', error)
        }
      }

      dc.onerror = (error) => {
        console.error('❌ Data channel error:', error)
        setError('Connection error occurred')
      }

      dc.onclose = () => {
        console.log('🔌 Data channel closed')
        setIsActive(false)
        setIsListening(false)
        setStatus('Disconnected')
      }

      // Create and set local offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Send offer to OpenAI and get answer
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpResponse.ok) {
        throw new Error('Failed to connect to Realtime API')
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      console.log('✅ WebRTC connection established')

    } catch (error: any) {
      console.error('❌ Error starting realtime session:', error)
      setError(error.message || 'Failed to start voice session')
      setIsConnecting(false)
      setIsActive(false)
      
      // Cleanup on error
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
    }
  }

  const handleRealtimeEvent = (event: any) => {
    console.log('📨 Realtime event:', event.type)

    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        const userTranscript = event.transcript
        if (userTranscript) {
          const userMsg: Message = {
            role: 'user',
            content: userTranscript,
            timestamp: new Date(),
          }
          setConversation(prev => [...prev, userMsg])
        }
        break

      case 'response.audio.delta':
        // AI is speaking (audio chunk received)
        if (!isSpeaking) {
          setIsSpeaking(true)
          setStatus('Speaking...')
        }
        break

      case 'response.audio.done':
        // AI finished speaking
        setIsSpeaking(false)
        setIsListening(true)
        setStatus('Listening...')
        break

      case 'response.text.delta':
        // AI response text chunk (for transcript)
        break

      case 'response.text.done':
        // Complete AI response text
        const aiText = event.text
        if (aiText) {
          const assistantMsg: Message = {
            role: 'assistant',
            content: aiText,
            timestamp: new Date(),
          }
          setConversation(prev => [...prev, assistantMsg])
        }
        break

      case 'error':
        console.error('❌ Realtime API error:', event.error)
        setError(event.error.message || 'An error occurred')
        break

      case 'input_audio_buffer.speech_started':
        setIsListening(true)
        setStatus('Listening...')
        break

      case 'input_audio_buffer.speech_stopped':
        setStatus('Processing...')
        break

      default:
        // Handle other events as needed
        break
    }
  }

  const stopRealtimeSession = () => {
    console.log('🛑 Stopping realtime session')
    
    if (dataChannelRef.current) {
      dataChannelRef.current.close()
      dataChannelRef.current = null
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null
      audioElementRef.current = null
    }

    setIsActive(false)
    setIsConnecting(false)
    setIsListening(false)
    setIsSpeaking(false)
    setStatus('Session ended')
  }

  const toggleMicrophone = () => {
    if (!peerConnectionRef.current) return

    const senders = peerConnectionRef.current.getSenders()
    const audioSender = senders.find(sender => sender.track?.kind === 'audio')
    
    if (audioSender && audioSender.track) {
      audioSender.track.enabled = isMicMuted
      setIsMicMuted(!isMicMuted)
      
      if (!isMicMuted) {
        setStatus('Microphone muted')
      } else {
        setStatus('Listening...')
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRealtimeSession()
    }
  }, [])

  // Update context when page changes
  useEffect(() => {
    if (isActive && dataChannelRef.current?.readyState === 'open') {
      // Notify about page change
      const pageChangeMsg: Message = {
        role: 'assistant',
        content: `[Now viewing Page ${pageNumber}]`,
        timestamp: new Date(),
      }
      setConversation(prev => [...prev, pageChangeMsg])
    }
  }, [pageNumber])

  return (
    <div className="flex flex-col h-full bg-dark-elevated">
      {/* Main Voice Interface */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!isActive && !isConnecting ? (
          <>
            {/* Inactive State */}
            <div className="w-32 h-32 bg-gradient-to-br from-accent-purple to-accent-blue rounded-full flex items-center justify-center mb-6 shadow-xl">
              <FiMic className="w-16 h-16 text-white" />
            </div>
            
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">
                Voice Study Assistant
              </h3>
              <p className="text-sm text-gray-400 max-w-sm">
                Start a real-time voice conversation about page {pageNumber}. 
                Powered by OpenAI Realtime API with WebRTC.
              </p>
            </div>

            <button
              onClick={startRealtimeSession}
              className="px-8 py-4 bg-gradient-to-r from-accent-purple to-accent-blue text-white rounded-full hover:opacity-90 transition shadow-lg font-semibold"
            >
              Start Voice Session
            </button>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm max-w-md text-center">
                {error}
              </div>
            )}
          </>
        ) : isConnecting ? (
          <>
            {/* Connecting State */}
            <div className="w-32 h-32 bg-dark-surface rounded-full flex items-center justify-center mb-6 animate-pulse">
              <FiLoader className="w-16 h-16 text-accent-purple animate-spin" />
            </div>
            
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">
                {status}
              </h3>
              <p className="text-sm text-gray-400">
                Setting up secure WebRTC connection...
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Active State */}
            <div className={`relative w-40 h-40 rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${
              isListening && !isSpeaking
                ? 'bg-gradient-to-br from-accent-purple to-accent-blue shadow-2xl scale-110'
                : isSpeaking
                ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-2xl scale-110'
                : 'bg-dark-surface'
            }`}>
              {isMicMuted ? (
                <FiMicOff className="w-20 h-20 text-white" />
              ) : (
                <FiMic className="w-20 h-20 text-white" />
              )}
              
              {/* Pulse animation when listening */}
              {isListening && !isSpeaking && !isMicMuted && (
                <>
                  <div className="absolute inset-0 rounded-full bg-accent-purple opacity-30 animate-ping"></div>
                  <div className="absolute inset-0 rounded-full bg-accent-blue opacity-20 animate-ping" style={{ animationDelay: '0.5s' }}></div>
                </>
              )}
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">
                {status}
              </h3>
              <p className="text-sm text-gray-400">
                Page {pageNumber} • WebRTC Connected
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={toggleMicrophone}
                className={`p-4 rounded-full transition ${
                  isMicMuted
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-dark-surface text-gray-400 hover:text-white hover:bg-dark-bg'
                }`}
                title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMicMuted ? <FiMicOff className="w-6 h-6" /> : <FiMic className="w-6 h-6" />}
              </button>
            </div>

            <button
              onClick={stopRealtimeSession}
              className="px-8 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition shadow-lg"
            >
              End Session
            </button>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm max-w-md text-center">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Conversation History */}
      {conversation.length > 0 && (
        <div className="border-t border-dark-border p-4 max-h-64 overflow-y-auto bg-dark-bg">
          <h4 className="text-sm font-semibold text-gray-400 mb-3">Conversation</h4>
          <div className="space-y-3">
            {conversation.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`px-3 py-2 rounded-lg max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-accent-purple text-white'
                      : 'bg-dark-surface text-gray-300'
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-purple-200' : 'text-gray-500'
                  }`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
