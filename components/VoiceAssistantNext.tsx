'use client'

import { useState, useEffect, useRef } from 'react'
import { FiMic, FiMicOff, FiVolume2, FiVolumeX, FiSettings, FiActivity } from 'react-icons/fi'

interface VoiceAssistantNextProps {
  documentId: string
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  onDocumentChange?: (direction: 'next' | 'previous') => void
  className?: string
}

interface VoiceCommand {
  pattern: RegExp
  action: (matches: RegExpMatchArray) => void
  description: string
}

export default function VoiceAssistantNext({
  currentPage,
  totalPages,
  onPageChange,
  onDocumentChange,
  className = '',
}: VoiceAssistantNextProps) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState<string>('')
  const [isEnabled, setIsEnabled] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [showSettings, setShowSettings] = useState(false)
  const [activityLog, setActivityLog] = useState<string[]>([])
  
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const isProcessingRef = useRef(false)

  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsListening(true)
        addToActivityLog('Listening...')
      }

      recognition.onend = () => {
        setIsListening(false)
        if (isEnabled) {
          setTimeout(() => {
            if (isEnabled && !isProcessingRef.current) {
              try { recognition.start() } catch (e) {}
            }
          }, 1000)
        }
      }

      recognition.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        setTranscript(interimTranscript)

        if (finalTranscript) {
          processVoiceCommand(finalTranscript.trim())
        }
      }

      recognition.onerror = () => setIsListening(false)
      recognitionRef.current = recognition
    }

    if (window.speechSynthesis) {
      synthRef.current = window.speechSynthesis
    }

    return () => {
      recognitionRef.current?.stop()
      synthRef.current?.cancel()
    }
  }, [isEnabled])

  const addToActivityLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setActivityLog(prev => [`${timestamp}: ${message}`, ...prev.slice(0, 9)])
  }

  const speak = (text: string) => {
    if (!synthRef.current || !isEnabled) return
    synthRef.current.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = volume
    utterance.rate = 0.9
    addToActivityLog(`Speaking: ${text.slice(0, 40)}...`)
    synthRef.current.speak(utterance)
  }

  // Voice commands - Navigation only
  const voiceCommands: VoiceCommand[] = [
    {
      pattern: /^(next page|page forward|forward)$/i,
      action: () => {
        if (currentPage < totalPages) {
          onPageChange(currentPage + 1)
          speak(`Page ${currentPage + 1}`)
        } else {
          speak('Last page')
        }
      },
      description: 'Next page',
    },
    {
      pattern: /^(previous page|page back|back|go back)$/i,
      action: () => {
        if (currentPage > 1) {
          onPageChange(currentPage - 1)
          speak(`Page ${currentPage - 1}`)
        } else {
          speak('First page')
        }
      },
      description: 'Previous page',
    },
    {
      pattern: /^(go to page|page) (\d+)$/i,
      action: (matches) => {
        const page = parseInt(matches[2])
        if (page >= 1 && page <= totalPages) {
          onPageChange(page)
          speak(`Page ${page}`)
        } else {
          speak(`Invalid page. Choose between 1 and ${totalPages}`)
        }
      },
      description: 'Go to page X',
    },
    {
      pattern: /^(first page|beginning|start)$/i,
      action: () => {
        onPageChange(1)
        speak('First page')
      },
      description: 'First page',
    },
    {
      pattern: /^(last page|end)$/i,
      action: () => {
        onPageChange(totalPages)
        speak(`Last page, page ${totalPages}`)
      },
      description: 'Last page',
    },
    {
      pattern: /^(what page|current page)$/i,
      action: () => {
        speak(`Page ${currentPage} of ${totalPages}`)
      },
      description: 'Current page',
    },
    {
      pattern: /^(next document|switch document)$/i,
      action: () => {
        if (onDocumentChange) {
          onDocumentChange('next')
          speak('Next document')
        }
      },
      description: 'Next document',
    },
    {
      pattern: /^(previous document)$/i,
      action: () => {
        if (onDocumentChange) {
          onDocumentChange('previous')
          speak('Previous document')
        }
      },
      description: 'Previous document',
    },
    {
      pattern: /^(help|what can you do|commands)$/i,
      action: () => {
        speak('Say next page, previous page, go to page 5, first page, last page, or help')
      },
      description: 'Help',
    },
  ]

  const processVoiceCommand = (command: string) => {
    if (isProcessingRef.current) return
    
    isProcessingRef.current = true
    addToActivityLog(`"${command}"`)

    const normalizedCommand = command.toLowerCase().trim()
    let commandFound = false

    for (const voiceCommand of voiceCommands) {
      const matches = normalizedCommand.match(voiceCommand.pattern)
      if (matches) {
        commandFound = true
        try { voiceCommand.action(matches) } catch (e) {}
        break
      }
    }

    if (!commandFound) {
      speak("Say help for commands")
    }

    setTimeout(() => { isProcessingRef.current = false }, 1000)
  }

  const toggleListening = () => {
    if (!recognitionRef.current) {
      speak('Voice not supported')
      return
    }

    if (isEnabled) {
      setIsEnabled(false)
      recognitionRef.current.stop()
      synthRef.current?.cancel()
      addToActivityLog('Stopped')
    } else {
      setIsEnabled(true)
      try {
        recognitionRef.current.start()
        addToActivityLog('Started')
      } catch (e) {}
    }
  }

  return (
    <div className={`bg-dark-elevated border border-dark-border rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FiMic className="w-5 h-5 mr-2" />
          Voice Navigation
        </h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
        >
          <FiSettings className="w-4 h-4" />
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-400 animate-pulse' : isEnabled ? 'bg-green-400' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-gray-400">
            {isListening ? 'Listening...' : isEnabled ? 'Ready' : 'Off'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setVolume(v => v > 0 ? 0 : 0.8)}
            className="p-1 glass-button rounded hover:bg-dark-surface transition"
          >
            {volume > 0 ? <FiVolume2 className="w-4 h-4" /> : <FiVolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setActivityLog([])}
            className="p-1 glass-button rounded hover:bg-dark-surface transition"
          >
            <FiActivity className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Start/Stop Button */}
      <button
        onClick={toggleListening}
        className={`w-full py-3 px-4 rounded-lg font-medium transition mb-4 ${
          isEnabled
            ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
            : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
        }`}
      >
        {isEnabled ? (
          <><FiMicOff className="w-5 h-5 inline mr-2" />Stop</>
        ) : (
          <><FiMic className="w-5 h-5 inline mr-2" />Start Voice</>
        )}
      </button>

      {/* Transcript */}
      {transcript && (
        <div className="p-3 bg-dark-surface rounded-lg mb-4">
          <div className="text-xs text-gray-400 mb-1">Hearing...</div>
          <div className="text-white">{transcript}</div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="mb-4 p-3 bg-dark-surface rounded-lg">
          <label className="text-sm text-gray-400 mb-2 block">
            Volume: {Math.round(volume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {/* Activity Log */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Activity</h4>
        <div className="max-h-24 overflow-y-auto space-y-1">
          {activityLog.length > 0 ? (
            activityLog.map((log, index) => (
              <div key={index} className="text-xs text-gray-500 p-2 bg-dark-surface rounded">
                {log}
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 p-2 bg-dark-surface rounded">
              No activity
            </div>
          )}
        </div>
      </div>

      {/* Commands */}
      <div className="mt-4 p-3 bg-dark-surface rounded-lg">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Commands:</h4>
        <div className="grid grid-cols-1 gap-1 text-xs text-gray-500">
          <div>"Next page" / "Previous page"</div>
          <div>"Go to page 5"</div>
          <div>"First page" / "Last page"</div>
        </div>
      </div>
    </div>
  )
}