'use client'

import { useState, useEffect, useRef } from 'react'
import { FiMic, FiMicOff, FiVolume2, FiVolumeX, FiAlertCircle } from 'react-icons/fi'

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
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [status, setStatus] = useState<string>('Tap the button to start')
  const [transcript, setTranscript] = useState<string>('')
  const [conversation, setConversation] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [browserSupported, setBrowserSupported] = useState(true)

  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const speechSynthesis = window.speechSynthesis

    if (!SpeechRecognition) {
      setBrowserSupported(false)
      setError('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.')
      return
    }

    if (!speechSynthesis) {
      setBrowserSupported(false)
      setError('Your browser does not support speech synthesis.')
      return
    }

    synthRef.current = speechSynthesis

    // Initialize Speech Recognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      console.log('🎤 Speech recognition started')
      setIsListening(true)
      setStatus('Listening...')
      setError(null)
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }

      if (finalTranscript) {
        console.log('✅ Final transcript:', finalTranscript)
        setTranscript(finalTranscript.trim())
        setStatus('Processing...')
        handleVoiceMessage(finalTranscript.trim())
      } else if (interimTranscript) {
        setTranscript(interimTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error)
      setIsListening(false)
      
      if (event.error === 'no-speech') {
        setStatus('No speech detected. Try again.')
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access.')
        setIsActive(false)
      } else {
        setStatus('Error: ' + event.error)
      }
    }

    recognition.onend = () => {
      console.log('🎤 Speech recognition ended')
      setIsListening(false)
      
      if (isActive) {
        // Restart if still active
        setTimeout(() => {
          if (recognitionRef.current && isActive) {
            try {
              recognitionRef.current.start()
            } catch (e) {
              console.log('Recognition already started')
            }
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [isActive])

  const handleVoiceMessage = async (message: string) => {
    if (!message.trim()) {
      setStatus('Listening...')
      return
    }

    // Add user message to conversation
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    }

    const updatedConversation = [...conversation, userMessage]
    setConversation(updatedConversation)

    try {
      // Get page image for context
      let pageImageData = null
      if (getPageImage) {
        console.log('📸 Capturing page for context...')
        pageImageData = await getPageImage()
      }

      // Prepare conversation history
      const history = updatedConversation.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))

      // Call voice chat API
      const response = await fetch('/api/voice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          pageNumber,
          pageImageData,
          conversationHistory: history,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to get response' }))
        throw new Error(errorData.error || 'Failed to get response')
      }

      const data = await response.json()

      // Add assistant response to conversation
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      }

      setConversation([...updatedConversation, assistantMessage])

      // Speak the response
      if (!isSpeakerMuted) {
        speakText(data.response)
      }

      setStatus('Listening...')
      setTranscript('')

    } catch (err: any) {
      console.error('❌ Error processing voice message:', err)
      setStatus('Error occurred')
      setError(err.message || 'Failed to process your message')
      
      // Optionally speak the error
      if (!isSpeakerMuted) {
        speakText('Sorry, I encountered an error. Please try again.')
      }
    }
  }

  const speakText = (text: string) => {
    if (!synthRef.current) return

    // Cancel any ongoing speech
    synthRef.current.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onstart = () => {
      setIsSpeaking(true)
      setStatus('Speaking...')
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      if (isActive) {
        setStatus('Listening...')
      }
    }

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event)
      setIsSpeaking(false)
    }

    synthRef.current.speak(utterance)
  }

  const startVoiceSession = () => {
    if (!recognitionRef.current) return

    setIsActive(true)
    setError(null)
    setConversation([])
    setStatus('Starting...')

    // Add welcome message
    const welcomeMessage: Message = {
      role: 'assistant',
      content: `Hi! I'm your voice study assistant. I can see page ${pageNumber} of your document. Ask me anything about what you're studying!`,
      timestamp: new Date(),
    }
    setConversation([welcomeMessage])

    if (!isSpeakerMuted) {
      speakText(welcomeMessage.content)
    }

    try {
      recognitionRef.current.start()
    } catch (e) {
      console.log('Recognition already started')
    }
  }

  const stopVoiceSession = () => {
    setIsActive(false)
    setIsListening(false)
    setIsSpeaking(false)
    setStatus('Session ended')

    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    if (synthRef.current) {
      synthRef.current.cancel()
    }
  }

  const toggleSpeaker = () => {
    const newMuted = !isSpeakerMuted
    setIsSpeakerMuted(newMuted)

    if (newMuted && synthRef.current) {
      synthRef.current.cancel()
      setIsSpeaking(false)
    }
  }

  if (!browserSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <FiAlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Browser Not Supported
        </h3>
        <p className="text-sm text-gray-400 max-w-md">
          {error || 'Your browser does not support voice features. Please use Chrome, Edge, or Safari.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main Voice Interface */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!isActive ? (
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
                Start a voice conversation about page {pageNumber}. 
                The AI can understand the page content and help you study.
              </p>
            </div>

            <button
              onClick={startVoiceSession}
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
        ) : (
          <>
            {/* Active State */}
            <div className={`relative w-40 h-40 rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${
              isListening && !isSpeaking
                ? 'bg-gradient-to-br from-accent-purple to-accent-blue shadow-2xl scale-110 animate-pulse'
                : isSpeaking
                ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-2xl'
                : 'bg-gray-700'
            }`}>
              <FiMic className="w-20 h-20 text-white" />
              
              {/* Pulse animation when listening */}
              {isListening && !isSpeaking && (
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
                Page {pageNumber}
              </p>
              
              {/* Live transcript */}
              {transcript && (
                <div className="mt-4 px-4 py-2 bg-dark-elevated rounded-lg max-w-md">
                  <p className="text-sm text-gray-300 italic">
                    "{transcript}"
                  </p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={toggleSpeaker}
                className={`p-4 rounded-full transition ${
                  isSpeakerMuted
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-dark-elevated text-gray-400 hover:text-white hover:bg-dark-surface'
                }`}
                title={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
              >
                {isSpeakerMuted ? <FiVolumeX className="w-6 h-6" /> : <FiVolume2 className="w-6 h-6" />}
              </button>
            </div>

            <button
              onClick={stopVoiceSession}
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
        <div className="border-t border-dark-border p-4 max-h-64 overflow-y-auto bg-dark-elevated">
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
