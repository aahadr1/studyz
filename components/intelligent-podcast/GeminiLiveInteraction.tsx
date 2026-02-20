'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GeminiLiveClient, ConversationContext } from '@/lib/intelligent-podcast/gemini-live-client'

interface GeminiLiveInteractionProps {
  podcastId: string
  currentSegmentId: string
  currentTimestamp: number
  podcastTitle: string
  language: string
  onClose: () => void
  onResume: () => void
}

interface TranscriptEntry {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  isFinal: boolean
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error'

export function GeminiLiveInteraction({
  podcastId,
  currentSegmentId,
  currentTimestamp,
  podcastTitle,
  language,
  onClose,
  onResume,
}: GeminiLiveInteractionProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showTransitionMessage, setShowTransitionMessage] = useState(false)
  const [transitionPhase, setTransitionPhase] = useState<'intro' | 'conversation' | 'outro' | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const clientRef = useRef<GeminiLiveClient | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const pendingTranscriptRef = useRef<string>('')

  const scrollToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [transcript, scrollToBottom])

  const initializeConnection = useCallback(async () => {
    setConnectionState('connecting')
    setError(null)

    try {
      // Fetch context from API
      const response = await fetch(`/api/intelligent-podcast/${podcastId}/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentSegmentId, currentTimestamp }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error('[GeminiLive] Realtime context error:', response.status, errData)
        throw new Error(errData?.details || errData?.error || `Failed to fetch podcast context (${response.status})`)
      }

      const { 
        context, 
        systemInstruction, 
        introductionPrompt,
        transitionBackPrompt,
        suggestedVoice 
      } = await response.json()

      // Get API key from environment
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('Gemini API key not configured')
      }

      // Enhance system instruction with transition prompts
      const enhancedSystemInstruction = `${systemInstruction}

IMPORTANT CONVERSATION FLOW:
- When the conversation starts, your FIRST response should be something welcoming like: "${introductionPrompt}"
- When the user seems satisfied with your answer or says they want to continue, say something like: "${transitionBackPrompt}"
- Keep the conversation natural and friendly
- You are speaking directly to the listener, not reading a script`

      // Create client
      const client = new GeminiLiveClient({
        apiKey,
        systemInstruction: enhancedSystemInstruction,
        voice: suggestedVoice,
        onTranscript: (text, role, isFinal) => {
          if (role === 'model') {
            // Handle model transcript
            if (isFinal) {
              setTranscript(prev => {
                // Remove any pending partial transcript
                const filtered = prev.filter(e => e.id !== 'pending-assistant')
                return [...filtered, {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  text,
                  isFinal: true,
                }]
              })
            } else {
              // Update or create pending transcript
              pendingTranscriptRef.current += text
              setTranscript(prev => {
                const existing = prev.find(e => e.id === 'pending-assistant')
                if (existing) {
                  return prev.map(e => 
                    e.id === 'pending-assistant' 
                      ? { ...e, text: pendingTranscriptRef.current }
                      : e
                  )
                }
                return [...prev, {
                  id: 'pending-assistant',
                  role: 'assistant',
                  text: pendingTranscriptRef.current,
                  isFinal: false,
                }]
              })
            }
          } else if (role === 'user' && isFinal) {
            setTranscript(prev => [...prev, {
              id: `user-${Date.now()}`,
              role: 'user',
              text,
              isFinal: true,
            }])
          }
        },
        onAudioChunk: () => {
          // Audio is handled internally by the client
        },
        onError: (err) => {
          console.error('[GeminiLive] Error:', err)
          if (err.message.includes('Permission denied') || err.message.includes('NotAllowedError')) {
            setPermissionDenied(true)
          }
          setError(err.message)
          setConnectionState('error')
        },
        onConnectionChange: (connected) => {
          if (connected) {
            setConnectionState('connected')
            setTransitionPhase('intro')
            // Show intro transition briefly
            setShowTransitionMessage(true)
            setTimeout(() => {
              setShowTransitionMessage(false)
              setTransitionPhase('conversation')
              setConnectionState('listening')
              
              // Send initial greeting prompt to trigger AI's introduction
              clientRef.current?.sendTextMessage(language === 'fr' 
                ? "Bonjour ! J'ai une question sur ce qu'on vient de dire."
                : "Hey! I have a question about what we just discussed."
              )
            }, 1000)
          }
        },
        onModelSpeaking: (speaking) => {
          if (speaking) {
            setConnectionState('speaking')
            pendingTranscriptRef.current = '' // Reset pending transcript
          } else {
            setConnectionState('listening')
          }
        },
      })

      clientRef.current = client

      // Connect to Gemini Live
      await client.connect({
        podcastTitle: context.podcastTitle,
        recentTranscript: context.recentTranscript || '',
        currentTopic: context.currentTopic || '',
        language: context.language,
      })

    } catch (err: any) {
      console.error('[GeminiLive] Connection error:', err)
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setPermissionDenied(true)
      }
      setError(err.message || 'Failed to connect')
      setConnectionState('error')
    }
  }, [podcastId, currentSegmentId, currentTimestamp, language])

  useEffect(() => {
    initializeConnection()

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
    }
  }, [initializeConnection])

  const handleResume = () => {
    setTransitionPhase('outro')
    setShowTransitionMessage(true)
    
    // Brief outro transition
    setTimeout(() => {
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
      onResume()
    }, 500)
  }

  const handleRetry = () => {
    setError(null)
    setPermissionDenied(false)
    setTranscript([])
    initializeConnection()
  }

  const getStateMessage = () => {
    switch (connectionState) {
      case 'connecting':
        return language === 'fr' ? 'Connexion en cours...' : 'Connecting...'
      case 'connected':
      case 'listening':
        return language === 'fr' ? 'Je t\'écoute...' : 'I\'m listening...'
      case 'speaking':
        return language === 'fr' ? 'En train de répondre...' : 'Speaking...'
      case 'error':
        return language === 'fr' ? 'Erreur de connexion' : 'Connection error'
      default:
        return ''
    }
  }

  const introMessages = {
    fr: 'On fait une petite pause pour ta question...',
    en: 'Taking a quick break for your question...',
  }

  const outroMessages = {
    fr: 'On reprend le podcast...',
    en: 'Getting back to the podcast...',
  }

  return (
    <div className="fixed inset-0 bg-background/98 z-50 flex flex-col">
      {/* Transition overlay */}
      {showTransitionMessage && (
        <div className="absolute inset-0 bg-background z-10 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-elevated border border-border flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                {transitionPhase === 'outro' ? (
                  <path d="M5 12h14M12 5l7 7-7 7" />
                ) : (
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </>
                )}
              </svg>
            </div>
            <p className="text-lg text-text-primary font-medium">
              {transitionPhase === 'outro' 
                ? (language === 'fr' ? outroMessages.fr : outroMessages.en)
                : (language === 'fr' ? introMessages.fr : introMessages.en)
              }
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 h-16 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-elevated border border-border flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              {language === 'fr' ? 'Pose ta question' : 'Ask your question'}
            </h2>
            <p className="text-xs text-text-secondary">{podcastTitle}</p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="btn-ghost p-2 hover:bg-surface transition-colors"
          title={language === 'fr' ? 'Fermer' : 'Close'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-2xl mx-auto w-full">
        {/* Connection state indicator */}
        {connectionState === 'connecting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="spinner spinner-lg mx-auto mb-4" />
              <p className="text-text-secondary">{getStateMessage()}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {connectionState === 'error' && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              {permissionDenied ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error-muted border border-error/20 flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-error">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {language === 'fr' ? 'Accès au micro refusé' : 'Microphone access denied'}
                  </h3>
                  <p className="text-sm text-text-secondary mb-4">
                    {language === 'fr' 
                      ? 'Autorise l\'accès au microphone dans les paramètres de ton navigateur pour utiliser cette fonctionnalité.'
                      : 'Please allow microphone access in your browser settings to use this feature.'
                    }
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error-muted border border-error/20 flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-error">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {language === 'fr' ? 'Erreur de connexion' : 'Connection error'}
                  </h3>
                  <p className="text-sm text-text-secondary mb-4">{error}</p>
                </>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={handleRetry} className="btn-secondary px-4 py-2">
                  {language === 'fr' ? 'Réessayer' : 'Try again'}
                </button>
                <button onClick={onClose} className="btn-ghost px-4 py-2">
                  {language === 'fr' ? 'Annuler' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active conversation */}
        {(connectionState === 'connected' || connectionState === 'listening' || connectionState === 'speaking') && (
          <>
            {/* Transcript area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {transcript.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-elevated border border-border flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p className="text-text-secondary">
                    {language === 'fr' 
                      ? 'Parle naturellement, je t\'écoute...'
                      : 'Speak naturally, I\'m listening...'
                    }
                  </p>
                </div>
              )}

              {transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                      entry.role === 'user'
                        ? 'bg-accent text-white rounded-br-sm'
                        : 'bg-elevated border border-border rounded-bl-sm'
                    } ${!entry.isFinal ? 'opacity-70' : ''}`}
                  >
                    <p className="text-sm leading-relaxed">{entry.text}</p>
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>

            {/* Status bar */}
            <div className="border-t border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Listening indicator */}
                <div className={`relative ${connectionState === 'speaking' ? 'opacity-50' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-elevated border border-border flex items-center justify-center">
                    <svg 
                      width="18" height="18" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="1.5" 
                      className={connectionState === 'listening' ? 'text-accent' : 'text-text-secondary'}
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>
                  {connectionState === 'listening' && (
                    <div className="absolute inset-0 rounded-full border-2 border-accent animate-ping opacity-30" />
                  )}
                </div>
                <span className="text-sm text-text-secondary">
                  {getStateMessage()}
                </span>
              </div>

              {/* Resume button */}
              <button
                onClick={handleResume}
                className="btn-primary px-5 py-2.5 flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                {language === 'fr' ? 'Reprendre le podcast' : 'Resume podcast'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tips (shown during active conversation) */}
      {(connectionState === 'listening' || connectionState === 'speaking') && transcript.length > 0 && (
        <div className="border-t border-border px-6 py-3 bg-surface flex-shrink-0">
          <div className="max-w-2xl mx-auto flex items-center gap-4 text-xs text-text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <span>
              {language === 'fr' 
                ? 'Parle naturellement. Dis "on peut reprendre" ou clique sur le bouton quand tu as fini.'
                : 'Speak naturally. Say "let\'s continue" or click the button when you\'re done.'
              }
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
