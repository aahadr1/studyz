'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GeminiLiveClient } from '@/lib/intelligent-podcast/gemini-live-client'

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
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
}

type ConnectionState = 'connecting' | 'listening' | 'speaking' | 'error'

export function GeminiLiveInteraction({
  podcastId,
  currentSegmentId,
  currentTimestamp,
  podcastTitle,
  language,
  onClose,
  onResume,
}: GeminiLiveInteractionProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const clientRef = useRef<GeminiLiveClient | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const pendingTranscriptRef = useRef<string>('')
  const isMountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  // Capture props once at mount
  const capturedSegmentIdRef = useRef(currentSegmentId)
  const capturedTimestampRef = useRef(currentTimestamp)

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const startConnection = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/intelligent-podcast/${podcastId}/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSegmentId: capturedSegmentIdRef.current,
          currentTimestamp: capturedTimestampRef.current,
        }),
        signal,
      })

      if (!isMountedRef.current) return

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.details || errData?.error || `Server error (${response.status})`)
      }

      const {
        context,
        systemInstruction,
        introductionPrompt,
        transitionBackPrompt,
        suggestedVoice,
      } = await response.json()

      if (!isMountedRef.current) return

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
      if (!apiKey) throw new Error('Gemini API key not configured')

      // System instruction tells the AI to immediately greet on first message
      const enhancedSystemInstruction = `${systemInstruction}

IMPORTANT CONVERSATION FLOW:
- The listener just interrupted the podcast. Immediately greet them warmly and briefly, like: "${introductionPrompt}"
- Your greeting should be SHORT (1 sentence max) then listen for their question
- When the user seems satisfied or says they want to continue, say something like: "${transitionBackPrompt}"
- You are speaking directly to the listener, not reading a script`

      const client = new GeminiLiveClient({
        apiKey,
        systemInstruction: enhancedSystemInstruction,
        voice: suggestedVoice,
        onTranscript: (text, role, isFinal) => {
          if (!isMountedRef.current) return
          if (role === 'model') {
            if (isFinal) {
              setTranscript(prev => {
                const filtered = prev.filter(e => e.id !== 'pending-assistant')
                return [...filtered, { id: `assistant-${Date.now()}`, role: 'assistant' as const, text, isFinal: true }]
              })
              pendingTranscriptRef.current = ''
            } else {
              pendingTranscriptRef.current += text
              setTranscript(prev => {
                const existing = prev.find(e => e.id === 'pending-assistant')
                if (existing) {
                  return prev.map(e => e.id === 'pending-assistant' ? { ...e, text: pendingTranscriptRef.current } : e)
                }
                return [...prev, { id: 'pending-assistant', role: 'assistant' as const, text: pendingTranscriptRef.current, isFinal: false }]
              })
            }
          } else if (role === 'user' && isFinal) {
            setTranscript(prev => [...prev, { id: `user-${Date.now()}`, role: 'user' as const, text, isFinal: true }])
          }
        },
        onAudioChunk: () => {},
        onError: (err) => {
          if (!isMountedRef.current) return
          console.error('[GeminiLive] Error:', err)
          if (err.message.includes('Permission denied') || err.message.includes('NotAllowedError')) {
            setPermissionDenied(true)
          }
          setError(err.message)
          setConnectionState('error')
        },
        onConnectionChange: (connected) => {
          if (!isMountedRef.current) return
          if (!connected && clientRef.current) {
            setConnectionState('error')
            setError(language === 'fr' ? 'Connexion perdue' : 'Connection lost')
          }
        },
        onModelSpeaking: (speaking) => {
          if (!isMountedRef.current) return
          setConnectionState(speaking ? 'speaking' : 'listening')
          if (speaking) pendingTranscriptRef.current = ''
        },
        onReady: () => {
          if (!isMountedRef.current) return
          console.log('[GeminiLive] Ready — sending silent trigger')
          setConnectionState('listening')
          // Silent trigger: not shown in UI, just kicks the AI into greeting mode instantly
          clientRef.current?.sendSilentTrigger(
            language === 'fr'
              ? '[L\'auditeur vient d\'appuyer sur le bouton pour poser une question. Accueille-le brièvement.]'
              : '[The listener just pressed the button to ask a question. Greet them briefly.]'
          )
        },
      })

      clientRef.current = client

      await client.connect({
        podcastTitle: context.podcastTitle,
        recentTranscript: context.recentTranscript || '',
        currentTopic: context.currentTopic || '',
        language: context.language,
      })
    } catch (err: any) {
      if (signal.aborted || !isMountedRef.current) return
      console.error('[GeminiLive] Connection error:', err)
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setPermissionDenied(true)
      }
      setError(err.message || 'Failed to connect')
      setConnectionState('error')
    }
  }, [podcastId, language])

  // Mount-only effect
  useEffect(() => {
    isMountedRef.current = true
    const abortController = new AbortController()
    abortRef.current = abortController

    startConnection(abortController.signal)

    return () => {
      isMountedRef.current = false
      abortController.abort()
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResume = async () => {
    if (clientRef.current) {
      await clientRef.current.disconnect()
      clientRef.current = null
    }
    onResume()
  }

  const handleRetry = () => {
    setError(null)
    setPermissionDenied(false)
    setTranscript([])
    setConnectionState('connecting')
    pendingTranscriptRef.current = ''

    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
    }
    abortRef.current?.abort()

    const abortController = new AbortController()
    abortRef.current = abortController
    startConnection(abortController.signal)
  }

  const isFr = language === 'fr'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {isFr ? 'Conversation en direct' : 'Live conversation'}
            </p>
            <p className="text-[11px] text-white/40 truncate">{podcastTitle}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-[#222] transition-colors flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Connecting */}
        {connectionState === 'connecting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                <div className="absolute inset-0 rounded-full border-2 border-t-white/60 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-white/50">
                {isFr ? 'Connexion...' : 'Connecting...'}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {connectionState === 'error' && (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center max-w-xs">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                {permissionDenied ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              <p className="text-sm font-medium text-white mb-1">
                {permissionDenied
                  ? (isFr ? 'Accès au micro refusé' : 'Microphone access denied')
                  : (isFr ? 'Erreur de connexion' : 'Connection error')
                }
              </p>
              <p className="text-xs text-white/40 mb-5">
                {permissionDenied
                  ? (isFr ? 'Autorise le micro dans les paramètres du navigateur.' : 'Allow microphone access in browser settings.')
                  : error
                }
              </p>
              <div className="flex gap-2 justify-center">
                <button onClick={handleRetry} className="px-4 py-2 text-xs font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors">
                  {isFr ? 'Réessayer' : 'Retry'}
                </button>
                <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-white/50 bg-[#1a1a1a] rounded-lg hover:bg-[#222] transition-colors">
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active conversation */}
        {(connectionState === 'listening' || connectionState === 'speaking') && (
          <>
            {/* Transcript */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {transcript.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  {/* Large pulsing mic indicator */}
                  <div className="relative mb-6">
                    <div className="w-24 h-24 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </div>
                    {connectionState === 'listening' && (
                      <>
                        <div className="absolute inset-0 rounded-full border border-white/10 animate-ping" style={{ animationDuration: '2s' }} />
                        <div className="absolute -inset-3 rounded-full border border-white/5 animate-ping" style={{ animationDuration: '2.5s' }} />
                      </>
                    )}
                  </div>
                  <p className="text-white/60 text-sm mb-1">
                    {connectionState === 'speaking'
                      ? (isFr ? 'Alex répond...' : 'Alex is speaking...')
                      : (isFr ? 'Pose ta question...' : 'Ask your question...')
                    }
                  </p>
                  <p className="text-white/25 text-xs">
                    {isFr ? 'Parle naturellement' : 'Speak naturally'}
                  </p>
                </div>
              )}

              {transcript.length > 0 && (
                <div className="space-y-3 max-w-lg mx-auto">
                  {transcript.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {entry.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-[#1a1a1a] flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                          <span className="text-[10px] font-bold text-white/50">A</span>
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] px-4 py-2.5 ${
                          entry.role === 'user'
                            ? 'bg-white text-black rounded-2xl rounded-br-md'
                            : 'bg-[#1a1a1a] text-white/90 rounded-2xl rounded-bl-md'
                        } ${!entry.isFinal ? 'opacity-60' : ''}`}
                      >
                        <p className="text-[13px] leading-relaxed">{entry.text}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="border-t border-[#1a1a1a] px-5 py-4">
              <div className="flex items-center justify-between max-w-lg mx-auto">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      connectionState === 'listening' ? 'bg-white/10' : 'bg-[#1a1a1a]'
                    }`}>
                      {connectionState === 'speaking' ? (
                        // Sound wave bars animation
                        <div className="flex items-center gap-[3px]">
                          {[0, 1, 2, 3].map(i => (
                            <div
                              key={i}
                              className="w-[3px] bg-white/60 rounded-full animate-pulse"
                              style={{
                                height: `${8 + Math.random() * 10}px`,
                                animationDelay: `${i * 0.15}s`,
                                animationDuration: '0.6s',
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        </svg>
                      )}
                    </div>
                    {connectionState === 'listening' && (
                      <div className="absolute inset-0 rounded-full border border-white/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                    )}
                  </div>
                  <span className="text-xs text-white/40">
                    {connectionState === 'speaking'
                      ? (isFr ? 'Alex répond...' : 'Alex is speaking...')
                      : (isFr ? 'Je t\'écoute...' : 'Listening...')
                    }
                  </span>
                </div>

                {/* Resume */}
                <button
                  onClick={handleResume}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-white/90 active:bg-white/80 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {isFr ? 'Reprendre' : 'Resume'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
