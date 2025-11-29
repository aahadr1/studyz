'use client'

import { useState, useEffect, useRef } from 'react'
import { FiMic, FiMicOff, FiLoader, FiEye, FiBook, FiCheckCircle, FiHelpCircle, FiList } from 'react-icons/fi'

interface VoiceAssistantV2Props {
  documentId: string
  pageNumber: number
  lessonId: string
  getPageText?: () => Promise<string | null>
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

type AssistantFeature = 'explain' | 'summarize' | 'quiz' | 'keypoints' | 'general'

export default function VoiceAssistantV2({
  documentId,
  pageNumber,
  lessonId,
  getPageText,
}: VoiceAssistantV2Props) {
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [status, setStatus] = useState<string>('Ready')
  const [conversation, setConversation] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasPageContext, setHasPageContext] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<AssistantFeature>('general')

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const currentPageRef = useRef<number>(pageNumber)

  // Enhanced instructions based on selected feature
  const getInstructionsForFeature = (feature: AssistantFeature, pageText: string, pageNum: number): string => {
    const baseContext = `=== CURRENT PAGE CONTEXT (Page ${pageNum}) ===
${pageText}
=== END OF PAGE CONTEXT ===`

    const featureInstructions = {
      explain: `${baseContext}

You are Studyz Guy, a patient AI tutor. Your job is to EXPLAIN concepts from this page in detail.
- Break down complex ideas into simple terms
- Use analogies and examples
- Ask if the student understood before moving on
- Keep responses conversational and under 4-5 sentences
- Reference specific parts of page ${pageNum} when explaining`,

      summarize: `${baseContext}

You are Studyz Guy, a summarization expert. Your job is to SUMMARIZE content from this page.
- Create concise, clear summaries
- Highlight the most important points
- Use bullet-point style when listing multiple items
- Keep summaries brief (2-3 sentences for voice)
- Always mention this is from page ${pageNum}`,

      quiz: `${baseContext}

You are Studyz Guy, a quiz master. Your job is to QUIZ the student on this page's content.
- Ask one question at a time
- Wait for their answer before revealing if it's correct
- Give encouraging feedback
- Explain the correct answer if they're wrong
- Make questions based on key concepts from page ${pageNum}`,

      keypoints: `${baseContext}

You are Studyz Guy, a study guide creator. Your job is to identify KEY POINTS from this page.
- List the 3-5 most important concepts
- Keep each point concise
- Explain why each point matters
- Reference page ${pageNum} in your response`,

      general: `${baseContext}

You are Studyz Guy, a friendly AI study assistant. You help students understand their study materials through voice conversation.
- Answer questions about page ${pageNum}
- Explain concepts clearly
- Keep responses conversational and concise (under 4 sentences)
- Be encouraging and supportive
- Reference specific parts of the page when relevant`
    }

    return featureInstructions[feature]
  }

  // Get page text from PageViewer
  const extractPageText = async (): Promise<string> => {
    try {
      if (!getPageText) return ''
      const text = await getPageText()
      return text || ''
    } catch (error: any) {
      console.error('❌ Failed to get page text:', error)
      return ''
    }
  }

  // Send context update to Realtime API
  const sendContextUpdate = (pageText: string, pageNum: number, feature: AssistantFeature) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      console.warn('⚠️ Data channel not ready')
      return
    }

    console.log(`📤 Sending context for page ${pageNum} with ${feature} mode`)

    const sessionUpdate = {
      type: 'session.update',
      session: {
        instructions: getInstructionsForFeature(feature, pageText, pageNum),
      },
    }

    try {
      dataChannelRef.current.send(JSON.stringify(sessionUpdate))
      console.log('✅ Context updated')
      
      setHasPageContext(true)

      const systemMsg: Message = {
        role: 'system',
        content: `📄 Page ${pageNum} loaded • Mode: ${feature}`,
        timestamp: new Date(),
      }
      setConversation(prev => [...prev, systemMsg])

    } catch (error) {
      console.error('❌ Failed to send context:', error)
    }
  }

  const startRealtimeSession = async () => {
    try {
      setIsConnecting(true)
      setError(null)
      setStatus('Analyzing page...')

      // Get page text
      let pageText = ''
      if (getPageText) {
        pageText = await getPageText() || ''
      }

      setStatus('Connecting...')
      console.log('🔌 Starting Realtime session')

      // Get ephemeral token
      const tokenResponse = await fetch('/api/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageNumber,
          pageText,
          feature: selectedFeature,
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to get session token')
      }

      const tokenData = await tokenResponse.json()
      const { clientSecret, hasPageContext: hasContext } = tokenData
      
      console.log('✅ Got session token')
      setHasPageContext(hasContext)

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection()
      peerConnectionRef.current = pc

      // Audio element
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioElementRef.current = audioEl
      
      pc.ontrack = (event) => {
        console.log('🔊 Audio track received')
        audioEl.srcObject = event.streams[0]
      }

      // Add microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      })
      
      pc.addTrack(stream.getTracks()[0])
      console.log('🎤 Microphone connected')

      // Data channel
      const dc = pc.createDataChannel('oai-events')
      dataChannelRef.current = dc

      dc.onopen = () => {
        console.log('✅ Connected')
        setIsActive(true)
        setIsConnecting(false)
        setIsListening(true)
        setStatus('Listening...')
        currentPageRef.current = pageNumber

        // Configure session
        const sessionUpdate = {
          type: 'session.update',
          session: {
            turn_detection: { 
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            input_audio_transcription: { 
              model: 'whisper-1' 
            },
          },
        }
        dc.send(JSON.stringify(sessionUpdate))

        // Welcome message
        const featureNames = {
          explain: 'Explanation Mode',
          summarize: 'Summary Mode',
          quiz: 'Quiz Mode',
          keypoints: 'Key Points Mode',
          general: 'General Chat Mode',
        }

        const welcomeMsg: Message = {
          role: 'assistant',
          content: `Hi! I'm in ${featureNames[selectedFeature]}. I can see page ${pageNumber}. ${
            selectedFeature === 'quiz' ? 'Ready for a quiz?' :
            selectedFeature === 'summarize' ? 'Want a summary?' :
            selectedFeature === 'keypoints' ? 'Want the key points?' :
            selectedFeature === 'explain' ? 'What would you like me to explain?' :
            'How can I help you study?'
          }`,
          timestamp: new Date(),
        }
        setConversation([welcomeMsg])
      }

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleRealtimeEvent(message)
        } catch (error) {
          console.error('Parse error:', error)
        }
      }

      dc.onerror = (error) => {
        console.error('❌ Connection error:', error)
        setError('Connection error')
      }

      dc.onclose = () => {
        console.log('🔌 Disconnected')
        setIsActive(false)
        setIsListening(false)
        setStatus('Disconnected')
      }

      // WebRTC handshake
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
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

      console.log('✅ WebRTC established')

    } catch (error: any) {
      console.error('❌ Error:', error)
      setError(error.message || 'Failed to start session')
      setIsConnecting(false)
      setIsActive(false)
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
    }
  }

  const handleRealtimeEvent = (event: any) => {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
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

      case 'response.audio_transcript.done':
        const aiTranscript = event.transcript
        if (aiTranscript) {
          const assistantMsg: Message = {
            role: 'assistant',
            content: aiTranscript,
            timestamp: new Date(),
          }
          setConversation(prev => [...prev, assistantMsg])
        }
        break

      case 'response.audio.delta':
        if (!isSpeaking) {
          setIsSpeaking(true)
          setStatus('Speaking...')
        }
        break

      case 'response.audio.done':
        setIsSpeaking(false)
        setIsListening(true)
        setStatus('Listening...')
        break

      case 'input_audio_buffer.speech_started':
        setIsListening(true)
        setStatus('Listening...')
        break

      case 'input_audio_buffer.speech_stopped':
        setStatus('Processing...')
        break

      case 'error':
        console.error('❌ Realtime error:', event.error)
        setError(event.error.message || 'An error occurred')
        break
    }
  }

  const stopRealtimeSession = () => {
    console.log('🛑 Stopping session')
    
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
    setHasPageContext(false)
  }

  const toggleMicrophone = () => {
    if (!peerConnectionRef.current) return

    const senders = peerConnectionRef.current.getSenders()
    const audioSender = senders.find(sender => sender.track?.kind === 'audio')
    
    if (audioSender && audioSender.track) {
      audioSender.track.enabled = isMicMuted
      setIsMicMuted(!isMicMuted)
      setStatus(isMicMuted ? 'Listening...' : 'Microphone muted')
    }
  }

  // Update context when page changes
  useEffect(() => {
    const updatePageContext = async () => {
      if (!isActive || !dataChannelRef.current || currentPageRef.current === pageNumber) {
        return
      }

      console.log(`📄 Page changed: ${currentPageRef.current} → ${pageNumber}`)
      currentPageRef.current = pageNumber

      setStatus('Updating...')
      const newPageText = await extractPageText()
      
      if (newPageText) {
        sendContextUpdate(newPageText, pageNumber, selectedFeature)
      }
      setStatus('Listening...')
    }

    updatePageContext()
  }, [pageNumber, isActive, selectedFeature])

  // Cleanup
  useEffect(() => {
    return () => {
      stopRealtimeSession()
    }
  }, [])

  const featureButtons: { id: AssistantFeature; label: string; icon: any; description: string }[] = [
    { id: 'general', label: 'Chat', icon: FiMic, description: 'General conversation' },
    { id: 'explain', label: 'Explain', icon: FiHelpCircle, description: 'Detailed explanations' },
    { id: 'summarize', label: 'Summarize', icon: FiBook, description: 'Quick summaries' },
    { id: 'keypoints', label: 'Key Points', icon: FiList, description: 'Main concepts' },
    { id: 'quiz', label: 'Quiz Me', icon: FiCheckCircle, description: 'Test your knowledge' },
  ]

  return (
    <div className="flex flex-col h-full bg-dark-elevated">
      {/* Context Indicator */}
      {hasPageContext && isActive && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center space-x-2 text-xs text-green-400">
          <FiEye className="w-4 h-4" />
          <span>AI can see page {pageNumber}</span>
        </div>
      )}

      {/* Feature Selection (when not active) */}
      {!isActive && !isConnecting && (
        <div className="p-4 border-b border-dark-border">
          <h4 className="text-sm font-semibold text-gray-400 mb-3">Select Mode</h4>
          <div className="grid grid-cols-2 gap-2">
            {featureButtons.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                onClick={() => setSelectedFeature(id)}
                className={`p-3 rounded-lg text-left transition ${
                  selectedFeature === id
                    ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white'
                    : 'bg-dark-surface text-gray-400 hover:text-white hover:bg-dark-bg'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <p className="text-xs opacity-75">{description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Interface */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!isActive && !isConnecting ? (
          <>
            <div className="w-32 h-32 bg-gradient-to-br from-accent-purple to-accent-blue rounded-full flex items-center justify-center mb-6 shadow-xl">
              <FiMic className="w-16 h-16 text-white" />
            </div>
            
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">
                Voice Study Assistant
              </h3>
              <p className="text-sm text-gray-400 max-w-sm">
                Start a voice conversation about page {pageNumber} in{' '}
                {featureButtons.find(f => f.id === selectedFeature)?.label} mode.
              </p>
            </div>

            <button
              onClick={startRealtimeSession}
              className="px-8 py-4 bg-gradient-to-r from-accent-purple to-accent-blue text-white rounded-full hover:opacity-90 transition shadow-lg font-semibold"
            >
              Start Session
            </button>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm max-w-md text-center">
                {error}
              </div>
            )}
          </>
        ) : isConnecting ? (
          <>
            <div className="w-32 h-32 bg-dark-surface rounded-full flex items-center justify-center mb-6">
              <FiLoader className="w-16 h-16 text-accent-purple animate-spin" />
            </div>
            
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">{status}</h3>
              <p className="text-sm text-gray-400">Setting up...</p>
            </div>
          </>
        ) : (
          <>
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
              
              {isListening && !isSpeaking && !isMicMuted && (
                <>
                  <div className="absolute inset-0 rounded-full bg-accent-purple opacity-30 animate-ping"></div>
                  <div className="absolute inset-0 rounded-full bg-accent-blue opacity-20 animate-ping" style={{ animationDelay: '0.5s' }}></div>
                </>
              )}
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">{status}</h3>
              <p className="text-sm text-gray-400">
                Page {pageNumber} • {featureButtons.find(f => f.id === selectedFeature)?.label} Mode
              </p>
            </div>

            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={toggleMicrophone}
                className={`p-4 rounded-full transition ${
                  isMicMuted
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-dark-surface text-gray-400 hover:text-white hover:bg-dark-bg'
                }`}
                title={isMicMuted ? 'Unmute' : 'Mute'}
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

      {/* Conversation Transcript */}
      {conversation.length > 0 && (
        <div className="border-t border-dark-border p-4 max-h-80 overflow-y-auto bg-dark-bg">
          <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center space-x-2">
            <span>Conversation</span>
            {hasPageContext && <FiEye className="w-3 h-3 text-green-400" />}
          </h4>
          <div className="space-y-3">
            {conversation.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}
              >
                {msg.role === 'system' ? (
                  <div className="px-3 py-1 rounded-full bg-dark-surface text-gray-500 text-xs">
                    {msg.content}
                  </div>
                ) : (
                  <div
                    className={`px-3 py-2 rounded-lg max-w-[80%] ${
                      msg.role === 'user'
                        ? 'bg-accent-purple text-white'
                        : 'bg-dark-surface text-gray-300'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${
                      msg.role === 'user' ? 'text-purple-200' : 'text-gray-500'
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

