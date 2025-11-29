'use client'

import { useState, useEffect, useRef } from 'react'
import { FiMic, FiMicOff, FiVolume2, FiVolumeX, FiSettings, FiActivity } from 'react-icons/fi'

interface VoiceAssistantNextProps {
  documentId: string
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  onDocumentChange?: (direction: 'next' | 'previous') => void
  getPageContent?: () => Promise<string | null>
  className?: string
}

interface VoiceCommand {
  pattern: RegExp
  action: (matches: RegExpMatchArray) => void
  description: string
}

export default function VoiceAssistantNext({
  documentId,
  currentPage,
  totalPages,
  onPageChange,
  onDocumentChange,
  getPageContent,
  className = '',
}: VoiceAssistantNextProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastCommand, setLastCommand] = useState<string>('')
  const [transcript, setTranscript] = useState<string>('')
  const [isEnabled, setIsEnabled] = useState(true)
  const [volume, setVolume] = useState(0.8)
  const [showSettings, setShowSettings] = useState(false)
  const [activityLog, setActivityLog] = useState<string[]>([])
  
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const isProcessingRef = useRef(false)

  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        console.log('🎤 Voice recognition started')
        setIsListening(true)
        addToActivityLog('Voice recognition activated')
      }

      recognition.onend = () => {
        console.log('🎤 Voice recognition ended')
        setIsListening(false)
        if (isEnabled) {
          // Auto-restart if enabled
          setTimeout(() => {
            if (isEnabled && !isProcessingRef.current) {
              try {
                recognition.start()
              } catch (e) {
                console.log('Recognition restart failed:', e)
              }
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
          console.log('🗣️ Final transcript:', finalTranscript)
          processVoiceCommand(finalTranscript.trim())
        }
      }

      recognition.onerror = (event) => {
        console.error('🎤 Speech recognition error:', event.error)
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }

    // Initialize speech synthesis
    if (window.speechSynthesis) {
      synthRef.current = window.speechSynthesis
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [isEnabled])

  const addToActivityLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setActivityLog(prev => [`${timestamp}: ${message}`, ...prev.slice(0, 9)])
  }

  const speak = (text: string) => {
    if (!synthRef.current || !isEnabled) return

    synthRef.current.cancel()
    setIsSpeaking(true)

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = volume
    utterance.rate = 0.9
    utterance.pitch = 1.0

    utterance.onstart = () => {
      console.log('🔊 Speaking:', text)
      addToActivityLog(`Speaking: ${text.slice(0, 50)}...`)
    }

    utterance.onend = () => {
      setIsSpeaking(false)
    }

    utterance.onerror = () => {
      setIsSpeaking(false)
    }

    synthRef.current.speak(utterance)
  }

  // Voice commands configuration
  const voiceCommands: VoiceCommand[] = [
    {
      pattern: /^(next page|page forward|forward)$/i,
      action: () => {
        if (currentPage < totalPages) {
          onPageChange(currentPage + 1)
          speak(`Moving to page ${currentPage + 1}`)
        } else {
          speak('You are already on the last page')
        }
      },
      description: 'Go to next page',
    },
    {
      pattern: /^(previous page|page back|back|go back)$/i,
      action: () => {
        if (currentPage > 1) {
          onPageChange(currentPage - 1)
          speak(`Moving to page ${currentPage - 1}`)
        } else {
          speak('You are already on the first page')
        }
      },
      description: 'Go to previous page',
    },
    {
      pattern: /^(go to page|page) (\d+)$/i,
      action: (matches) => {
        const page = parseInt(matches[2])
        if (page >= 1 && page <= totalPages) {
          onPageChange(page)
          speak(`Moving to page ${page}`)
        } else {
          speak(`Invalid page number. Please choose between 1 and ${totalPages}`)
        }
      },
      description: 'Go to specific page (e.g., "go to page 5")',
    },
    {
      pattern: /^(first page|beginning|start)$/i,
      action: () => {
        onPageChange(1)
        speak('Moving to the first page')
      },
      description: 'Go to first page',
    },
    {
      pattern: /^(last page|end)$/i,
      action: () => {
        onPageChange(totalPages)
        speak(`Moving to the last page, page ${totalPages}`)
      },
      description: 'Go to last page',
    },
    {
      pattern: /^(what page|current page)$/i,
      action: () => {
        speak(`You are currently on page ${currentPage} of ${totalPages}`)
      },
      description: 'Get current page information',
    },
    {
      pattern: /^(how many pages|total pages)$/i,
      action: () => {
        speak(`This document has ${totalPages} pages`)
      },
      description: 'Get total page count',
    },
    {
      pattern: /^(summarize|summary|what is this about|read this page)$/i,
      action: async () => {
        speak('Let me analyze this page for you')
        try {
          const content = await getPageContent?.()
          if (content && content.trim().length > 0) {
            console.log('📄 Page content received for AI:', content.slice(0, 200) + '...')
            addToActivityLog(`Page content: ${content.length} characters`)
            
            // Basic content summary
            const words = content.split(' ').length
            const sentences = content.split(/[.!?]+/).length
            
            if (words < 10) {
              speak('This page has very little text content')
            } else if (words < 50) {
              speak(`This page contains about ${words} words of text content`)
            } else {
              speak(`This page contains about ${words} words in approximately ${sentences} sentences. The text has been extracted successfully for analysis.`)
            }
          } else {
            speak('This page appears to have no text content, or the content could not be extracted')
          }
        } catch (error) {
          console.error('Error analyzing page:', error)
          speak('Sorry, I encountered an error while analyzing the page')
        }
      },
      description: 'Analyze and summarize current page content',
    },
    {
      pattern: /^(next document|switch document)$/i,
      action: () => {
        if (onDocumentChange) {
          onDocumentChange('next')
          speak('Switching to the next document')
        } else {
          speak('Document switching is not available')
        }
      },
      description: 'Switch to next document',
    },
    {
      pattern: /^(previous document)$/i,
      action: () => {
        if (onDocumentChange) {
          onDocumentChange('previous')
          speak('Switching to the previous document')
        } else {
          speak('Document switching is not available')
        }
      },
      description: 'Switch to previous document',
    },
    {
      pattern: /^(read (this )?page|read aloud|read content)$/i,
      action: async () => {
        try {
          const content = await getPageContent?.()
          if (content && content.trim().length > 0) {
            addToActivityLog(`Reading page content: ${content.length} chars`)
            // Read first 200 words to avoid overly long speech
            const words = content.split(' ').slice(0, 200).join(' ')
            speak(words.length < content.length ? words + '... and more content on this page' : words)
          } else {
            speak('This page has no readable text content')
          }
        } catch (error) {
          speak('Sorry, I cannot read the page content right now')
        }
      },
      description: 'Read page content aloud',
    },
    {
      pattern: /^(help|what can you do|commands)$/i,
      action: () => {
        const helpText = 'I can help you navigate and read documents. Say "next page", "go to page 5", "summarize", "read this page", "next document", or "help" for all commands.'
        speak(helpText)
      },
      description: 'Show available commands',
    },
  ]

  const processVoiceCommand = (command: string) => {
    if (isProcessingRef.current) return
    
    isProcessingRef.current = true
    setLastCommand(command)
    addToActivityLog(`Recognized: "${command}"`)

    const normalizedCommand = command.toLowerCase().trim()
    let commandFound = false

    for (const voiceCommand of voiceCommands) {
      const matches = normalizedCommand.match(voiceCommand.pattern)
      if (matches) {
        commandFound = true
        try {
          voiceCommand.action(matches)
        } catch (error) {
          console.error('Error executing command:', error)
          speak('Sorry, I encountered an error executing that command')
        }
        break
      }
    }

    if (!commandFound) {
      speak("Sorry, I didn't understand that command. Say 'help' for available commands.")
      addToActivityLog('Command not recognized')
    }

    setTimeout(() => {
      isProcessingRef.current = false
    }, 1000)
  }

  const toggleListening = () => {
    if (!recognitionRef.current) {
      speak('Voice recognition is not supported in this browser')
      return
    }

    if (isEnabled) {
      setIsEnabled(false)
      recognitionRef.current.stop()
      synthRef.current?.cancel()
      addToActivityLog('Voice assistant disabled')
    } else {
      setIsEnabled(true)
      try {
        recognitionRef.current.start()
        addToActivityLog('Voice assistant enabled')
      } catch (error) {
        console.error('Failed to start recognition:', error)
      }
    }
  }

  const toggleMute = () => {
    if (volume > 0) {
      setVolume(0)
    } else {
      setVolume(0.8)
    }
  }

  return (
    <div className={`bg-dark-elevated border border-dark-border rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FiMic className="w-5 h-5 mr-2" />
          Voice Assistant
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
            {isListening ? 'Listening...' : isEnabled ? 'Ready' : 'Disabled'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={toggleMute}
            className="p-1 glass-button rounded hover:bg-dark-surface transition"
          >
            {volume > 0 ? <FiVolume2 className="w-4 h-4" /> : <FiVolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setActivityLog([])}
            className="p-1 glass-button rounded hover:bg-dark-surface transition"
            title="Clear activity log"
          >
            <FiActivity className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-3 mb-4">
        <button
          onClick={toggleListening}
          className={`w-full py-3 px-4 rounded-lg font-medium transition ${
            isEnabled
              ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
              : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
          }`}
        >
          {isEnabled ? (
            <>
              <FiMicOff className="w-5 h-5 inline mr-2" />
              Stop Listening
            </>
          ) : (
            <>
              <FiMic className="w-5 h-5 inline mr-2" />
              Start Listening
            </>
          )}
        </button>

        {transcript && (
          <div className="p-3 bg-dark-surface rounded-lg">
            <div className="text-xs text-gray-400 mb-1">Hearing...</div>
            <div className="text-white">{transcript}</div>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-4 p-3 bg-dark-surface rounded-lg space-y-3">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Voice Volume: {Math.round(volume * 100)}%
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
        </div>
      )}

      {/* Activity Log */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Recent Activity</h4>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {activityLog.length > 0 ? (
            activityLog.map((log, index) => (
              <div key={index} className="text-xs text-gray-500 p-2 bg-dark-surface rounded">
                {log}
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 p-2 bg-dark-surface rounded">
              No recent activity
            </div>
          )}
        </div>
      </div>

      {/* Command Hints */}
      <div className="mt-4 p-3 bg-dark-surface rounded-lg">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Try saying:</h4>
        <div className="grid grid-cols-1 gap-1 text-xs text-gray-500">
          <div>"Next page" / "Go to page 5"</div>
          <div>"First page" / "Last page"</div>
          <div>"Summarize this page"</div>
          <div>"Read this page" / "Help"</div>
        </div>
      </div>
    </div>
  )
}
