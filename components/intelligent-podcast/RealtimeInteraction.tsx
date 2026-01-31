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

  // Initialize Realtime API connection
  useEffect(() => {
    initializeRealtimeConnection()
    
    return () => {
      // Cleanup on unmount
      if (clientRef.current) {
        clientRef.current.disconnect()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const initializeRealtimeConnection = async () => {
    try {
      setIsConnecting(true)
      
      // Fetch context for Realtime API
      const response = await fetch(`/api/intelligent-podcast/${podcastId}/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSegmentId,
          currentTimestamp,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to fetch context')
      }

      const { context, instructions, suggestedVoice } = await response.json()

      // Get OpenAI API key (should be securely managed)
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''

      // Initialize audio context for playback
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Create Realtime client
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
    if (isFinal) {
      setTranscript((prev) => [...prev, text])
    }
  }

  const handleAudioResponse = async (audioData: ArrayBuffer) => {
    if (!audioContextRef.current) return

    try {
      // Convert PCM16 to AudioBuffer and play
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
    if (clientRef.current) {
      clientRef.current.disconnect()
    }
    onResume()
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-2xl max-w-2xl w-full p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Ask Your Question</h2>
            <p className="text-gray-400 mt-1">
              {isConnecting ? 'Connecting...' : isListening ? 'Listening...' : 'Ready'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Status */}
        {isConnecting && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-600 rounded-lg p-4 mb-6">
            <div className="text-red-200">{error}</div>
          </div>
        )}

        {/* Microphone visualization */}
        {isListening && !isConnecting && (
          <div className="flex flex-col items-center py-8">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-4xl animate-pulse">
                🎤
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
            </div>
            <p className="text-gray-300 mt-6 text-center">
              Speak naturally, I'm listening...
            </p>
          </div>
        )}

        {/* Transcript display */}
        {transcript.length > 0 && (
          <div className="mt-6 space-y-4 max-h-64 overflow-y-auto">
            {transcript.map((text, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg ${
                  idx % 2 === 0 ? 'bg-blue-900/30 ml-8' : 'bg-gray-800/50 mr-8'
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">
                  {idx % 2 === 0 ? 'You' : 'Assistant'}
                </div>
                <div className="text-white">{text}</div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
          <h4 className="font-semibold text-white mb-2">Tips:</h4>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• Ask for clarification on concepts</li>
            <li>• Request examples or analogies</li>
            <li>• Say "explain that again" for simpler terms</li>
            <li>• Say "thank you" or "resume" when you're done</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleFinish}
            disabled={isConnecting}
            className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            ↩ Resume Podcast
          </button>
        </div>
      </div>
    </div>
  )
}
