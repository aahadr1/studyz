'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { FiSend, FiMic, FiMicOff, FiStopCircle, FiPlay, FiLoader } from 'react-icons/fi'

interface InputAreaProps {
  onSend: (message: string) => void
  isLoading: boolean
  currentPage: number
  onExplainPage?: () => void
  isExplaining?: boolean
}

export default function InputArea({
  onSend,
  isLoading,
  currentPage,
  onExplainPage,
  isExplaining = false,
}: InputAreaProps) {
  const [input, setInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return
    onSend(input.trim())
    setInput('')
    textareaRef.current?.focus()
  }, [input, isLoading, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd+Enter (or Ctrl+Enter on Windows) to toggle recording
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (isRecording) {
        stopRecording()
      } else {
        startRecording()
      }
      return
    }
    
    // Regular Enter to submit (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const startRecording = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'fr-FR'

    recognition.onstart = () => {
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    }

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      if (finalTranscript) {
        setInput(prev => prev + finalTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      stopRecording()
    }

    recognition.onend = () => {
      stopRecording()
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)
    setRecordingTime(0)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex-shrink-0 border-t border-border bg-background p-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        {/* Voice Recording Button */}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isLoading}
          className={`flex-shrink-0 w-10 h-10 flex items-center justify-center transition-colors disabled:opacity-40 ${
            isRecording 
              ? 'bg-error text-white animate-pulse' 
              : 'bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-border-light'
          }`}
          title={isRecording ? 'Stop recording' : 'Voice input'}
        >
          {isRecording ? (
            <FiStopCircle className="w-5 h-5" />
          ) : (
            <FiMic className="w-5 h-5" />
          )}
        </button>

        {/* Input Area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? 'Listening...' : 'Ask about this page...'}
            rows={1}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-elevated border border-border text-text-primary placeholder-text-tertiary text-sm resize-none focus:outline-none focus:border-text-secondary disabled:opacity-50 transition-colors"
            style={{ minHeight: '44px', maxHeight: '150px' }}
          />
          
          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="w-2 h-2 bg-error animate-pulse" />
              <span className="text-xs mono text-error">{formatTime(recordingTime)}</span>
            </div>
          )}

          {/* Character count */}
          {!isRecording && input.length > 0 && (
            <div className="absolute right-3 bottom-2 text-xs mono text-text-tertiary">
              {input.length}/2000
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 w-10 h-10 bg-mode-study text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          title="Send message"
        >
          <FiSend className="w-5 h-5" />
        </button>
      </form>

      {/* Explain This Page Button */}
      {onExplainPage && (
        <button
          type="button"
          onClick={onExplainPage}
          disabled={isLoading || isExplaining}
          className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isExplaining ? (
            <>
              <FiLoader className="w-4 h-4 animate-spin" />
              <span>Explication en cours...</span>
            </>
          ) : (
            <>
              <FiPlay className="w-4 h-4" />
              <span>Explique cette page</span>
            </>
          )}
        </button>
      )}

      {/* Helper text */}
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-xs text-text-tertiary">
          Viewing page {currentPage}
        </span>
        <span className="text-xs text-text-tertiary">
          Enter: send • Shift+Enter: new line • Cmd+Enter: voice
        </span>
      </div>
    </div>
  )
}

