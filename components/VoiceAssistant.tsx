'use client'

import { useState, useEffect, useRef } from 'react'
import { FiMic, FiMicOff, FiVolume2, FiVolumeX } from 'react-icons/fi'

interface VoiceAssistantProps {
  documentId: string
  pageNumber: number
  lessonId: string
}

export default function VoiceAssistant({
  documentId,
  pageNumber,
  lessonId,
}: VoiceAssistantProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [status, setStatus] = useState<string>('Disconnected')
  const [transcript, setTranscript] = useState<string[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const connectToRealtimeAPI = async () => {
    try {
      setStatus('Connecting...')
      
      // In production, this would connect to OpenAI's Realtime API
      // For now, we'll create a mock connection
      
      // Voice assistant WebSocket connection would go here
      // For now, this is disabled until you set up the WebSocket server
      setStatus('Voice mode not yet available. Please use Chat mode.')
      console.log('Voice assistant requires WebSocket server setup. Use Chat mode for now.')
      
      // WebSocket setup would go here when backend is ready
      // Example implementation (commented out):
      /*
      const ws = new WebSocket('wss://your-backend.com/realtime')
      
      ws.onopen = () => {
        setIsConnected(true)
        setStatus('Connected')
        ws.send(JSON.stringify({
          type: 'context',
          documentId,
          pageNumber,
          lessonId,
        }))
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'transcript') {
          setTranscript((prev) => [...prev, data.text])
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setStatus('Error connecting')
        setIsConnected(false)
      }

      ws.onclose = () => {
        setIsConnected(false)
        setStatus('Disconnected')
      }

      wsRef.current = ws
      */
    } catch (error) {
      console.error('Error connecting to Realtime API:', error)
      setStatus('Failed to connect')
    }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
    setStatus('Disconnected')
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    // Send mute status to WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mute',
        muted: !isMuted,
      }))
    }
  }

  const toggleSpeaker = () => {
    setIsSpeakerMuted(!isSpeakerMuted)
    // Send speaker mute status to WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'speaker_mute',
        muted: !isSpeakerMuted,
      }))
    }
  }

  useEffect(() => {
    // Update context when page changes
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'context',
        documentId,
        pageNumber,
        lessonId,
      }))
      
      setTranscript((prev) => [
        ...prev,
        `[System: Now viewing Page ${pageNumber}]`,
      ])
    }
  }, [pageNumber, documentId, lessonId])

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        {!isConnected ? (
          <>
            <div className="w-32 h-32 bg-gradient-to-br from-purple-100 to-primary-100 rounded-full flex items-center justify-center">
              <FiMic className="w-16 h-16 text-primary-600" />
            </div>
            
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Voice Assistant Ready
              </h3>
              <p className="text-sm text-gray-600 max-w-sm">
                Connect to start a voice conversation about the current page. 
                The AI can see what you're viewing and will help you understand it.
              </p>
            </div>

            <button
              onClick={connectToRealtimeAPI}
              className="px-8 py-4 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition shadow-lg font-semibold"
            >
              Start Voice Session
            </button>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-sm">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Voice assistant requires OpenAI Realtime API setup 
                and a WebSocket server. This is a placeholder UI.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className={`w-32 h-32 rounded-full flex items-center justify-center relative ${
              isMuted ? 'bg-gray-200' : 'bg-gradient-to-br from-purple-400 to-primary-400 animate-pulse'
            }`}>
              <FiMic className={`w-16 h-16 ${isMuted ? 'text-gray-500' : 'text-white'}`} />
              {isMuted && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1 h-24 bg-red-500 rotate-45 rounded-full"></div>
                </div>
              )}
            </div>

            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {status}
              </h3>
              <p className="text-sm text-gray-600">
                Viewing Page {pageNumber}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition ${
                  isMuted
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                }`}
              >
                {isMuted ? <FiMicOff className="w-6 h-6" /> : <FiMic className="w-6 h-6" />}
              </button>

              <button
                onClick={toggleSpeaker}
                className={`p-4 rounded-full transition ${
                  isSpeakerMuted
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                }`}
              >
                {isSpeakerMuted ? <FiVolumeX className="w-6 h-6" /> : <FiVolume2 className="w-6 h-6" />}
              </button>
            </div>

            <button
              onClick={disconnect}
              className="px-8 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition"
            >
              End Session
            </button>
          </>
        )}
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Transcript</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {transcript.map((text, index) => (
              <p key={index} className="text-sm text-gray-600">
                {text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

