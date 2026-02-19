'use client'

import { useState, useEffect, useRef } from 'react'
import { RealtimeConversationClient } from '@/lib/intelligent-podcast/realtime-client'
import { RealtimeConversationContext } from '@/types/intelligent-podcast'

interface RealtimeInteractionProps {
  podcastId: string
  currentSegmentId: string
  currentTimestamp: number
  onClose: () => void
  onResume: () => void
}

export function RealtimeInteraction({
  podcastId,
  currentSegmentId,
  currentTimestamp,
  onClose,
  onResume,
}: RealtimeInteractionProps) {
  const [isConnecting, setIsConnecting] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const clientRef = useRef<RealtimeConversationClient | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    initializeRealtimeConnection()
    return () => {
      if (clientRef.current) clientRef.current.disconnect()
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [])

  const initializeRealtimeConnection = async () => {
    try {
      setIsConnecting(true)

      const response = await fetch(`/api/intelligent-podcast/${podcastId}/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentSegmentId, currentTimestamp }),
      })

      if (!response.ok) throw new Error('Failed to fetch context')

      const { context, instructions, suggestedVoice } = await response.json()

      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

      const client = new RealtimeConversationClient(
        apiKey,
        handleTranscript,
        handleAudioResponse,
        handleError
      )

      await client.connect(context, instructions, suggestedVoice)

      clientRef.current = client
      setIsConnecting(false)
      setIsListening(true)
    } catch (err) {
      console.error('Failed to initialize Realtime:', err)
      setError('Failed to connect. Please try again.')
      setIsConnecting(false)
    }
  }

  const handleTranscript = (text: string, isFinal: boolean) => {
    if (isFinal) setTranscript((prev) => [...prev, text])
  }

  const handleAudioResponse = async (audioData: ArrayBuffer) => {
    if (!audioContextRef.current) return
    try {
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData)
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      source.start(0)
    } catch (err) {
      console.error('Failed to play audio:', err)
    }
  }

  const handleError = (err: Error) => {
    console.error('Realtime error:', err)
    setError(err.message)
    setIsListening(false)
  }

  const handleFinish = () => {
    if (clientRef.current) clientRef.current.disconnect()
    onResume()
  }

  return (
    <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-6">
      <div className="card-elevated max-w-lg w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="heading-2">Ask a question</h2>
            <p className="caption mt-1">
              {isConnecting ? 'Connecting...' : isListening ? 'Listening...' : 'Ready'}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Connecting state */}
        {isConnecting && (
          <div className="flex items-center justify-center py-12">
            <div className="spinner spinner-lg" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3 mb-6">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {/* Listening indicator */}
        {isListening && !isConnecting && (
          <div className="flex flex-col items-center py-8">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-elevated border border-border flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-primary">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-text-tertiary animate-ping opacity-30" />
            </div>
            <p className="text-sm text-text-secondary mt-5">Speak naturally, I'm listening...</p>
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
            {transcript.map((text, idx) => (
              <div
                key={idx}
                className={`px-3 py-2.5 rounded-lg text-sm ${
                  idx % 2 === 0
                    ? 'bg-surface ml-6 text-text-primary'
                    : 'bg-elevated mr-6 text-text-secondary'
                }`}
              >
                <span className="text-xs text-text-muted block mb-1">
                  {idx % 2 === 0 ? 'You' : 'Assistant'}
                </span>
                {text}
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 p-3 bg-surface rounded-lg">
          <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wider">Tips</p>
          <ul className="text-xs text-text-tertiary space-y-1">
            <li>Ask for clarification on concepts</li>
            <li>Request examples or analogies</li>
            <li>Say "resume" when you're done</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-5">
          <button
            onClick={handleFinish}
            disabled={isConnecting}
            className="btn-primary w-full py-2.5 disabled:opacity-40"
          >
            Resume podcast
          </button>
        </div>
      </div>
    </div>
  )
}
