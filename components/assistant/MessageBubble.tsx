'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  FiUser, 
  FiCpu, 
  FiCopy, 
  FiCheck, 
  FiBookmark,
  FiVolume2,
  FiVolumeX,
  FiRefreshCw,
  FiThumbsUp,
  FiThumbsDown
} from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import type { AssistantMessage } from './AssistantPanel'

// Import KaTeX CSS via Next.js head or global CSS
// We'll add it to globals.css

interface MessageBubbleProps {
  message: AssistantMessage
  onBookmark: () => void
  autoSpeak: boolean
}

export default function MessageBubble({
  message,
  onBookmark,
  autoSpeak,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isUser = message.role === 'user'
  const isStreaming = message.isStreaming

  // Auto-speak effect
  useEffect(() => {
    if (autoSpeak && !isUser && !isStreaming && message.content) {
      handleSpeak()
    }
  }, [autoSpeak, message.content, isUser, isStreaming])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      // Also cancel browser speech synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSpeak = async () => {
    if (isSpeaking && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsSpeaking(false)
      return
    }

    try {
      setIsSpeaking(true)
      
      // Try browser TTS first (faster)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(message.content)
        utterance.rate = 1
        utterance.pitch = 1
        utterance.volume = 1
        
        utterance.onend = () => {
          setIsSpeaking(false)
        }
        
        utterance.onerror = () => {
          setIsSpeaking(false)
        }
        
        window.speechSynthesis.speak(utterance)
        return
      }
      
      // Fallback to API TTS
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content }),
      })

      if (!response.ok) throw new Error('TTS failed')

      const data = await response.json()
      
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl)
        audioRef.current = audio

        audio.onended = () => {
          setIsSpeaking(false)
          audioRef.current = null
        }

        audio.onerror = () => {
          setIsSpeaking(false)
          audioRef.current = null
        }

        await audio.play()
      } else {
        throw new Error('No audio URL returned')
      }
    } catch (err) {
      console.error('TTS error:', err)
      setIsSpeaking(false)
    }
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className={`flex items-start gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center ${
        isUser ? 'bg-text-primary' : 'bg-mode-study'
      }`}>
        {isUser ? (
          <FiUser className="w-4 h-4 text-background" />
        ) : (
          <FiCpu className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Metadata */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs mono text-text-tertiary">
            {formatTime(message.created_at)}
          </span>
          {message.page_context && (
            <span className="text-xs mono text-text-tertiary">
              Page {message.page_context}
            </span>
          )}
          {message.isBookmarked && (
            <FiBookmark className="w-3 h-3 text-warning fill-current" />
          )}
        </div>

        {/* Bubble */}
        <div className={`relative max-w-full ${isUser ? 'ml-8' : 'mr-8'}`}>
          <div className={`px-4 py-3 ${
            isUser 
              ? 'bg-text-primary text-background' 
              : message.isError
                ? 'bg-error-muted border border-error/30'
                : 'bg-elevated border border-border'
          }`}>
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  components={{
                    // Custom code block with copy button
                    pre: ({ children, ...props }) => (
                      <div className="relative group/code">
                        <pre className="!bg-background !border !border-border !p-3 overflow-x-auto" {...props}>
                          {children}
                        </pre>
                        <button
                          onClick={handleCopy}
                          className="absolute top-2 right-2 p-1.5 bg-elevated border border-border opacity-0 group-hover/code:opacity-100 transition-opacity"
                          title="Copy code"
                        >
                          {copied ? (
                            <FiCheck className="w-3 h-3 text-success" />
                          ) : (
                            <FiCopy className="w-3 h-3 text-text-tertiary" />
                          )}
                        </button>
                      </div>
                    ),
                    code: ({ inline, className, children, ...props }: any) => (
                      inline ? (
                        <code className="!bg-background !px-1.5 !py-0.5 !text-text-primary mono text-xs" {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className={className} {...props}>{children}</code>
                      )
                    ),
                    // Style links
                    a: ({ children, ...props }) => (
                      <a className="!text-mode-study hover:underline" target="_blank" rel="noopener noreferrer" {...props}>
                        {children}
                      </a>
                    ),
                    // Style lists
                    ul: ({ children, ...props }) => (
                      <ul className="!list-disc !pl-4 space-y-1" {...props}>{children}</ul>
                    ),
                    ol: ({ children, ...props }) => (
                      <ol className="!list-decimal !pl-4 space-y-1" {...props}>{children}</ol>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                
                {/* Streaming cursor */}
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-mode-study animate-pulse ml-0.5" />
                )}
              </div>
            )}
          </div>

          {/* Action Buttons (for assistant messages) */}
          {!isUser && !isStreaming && (
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Copy */}
              <button
                onClick={handleCopy}
                className="p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-elevated transition-colors"
                title="Copy message"
              >
                {copied ? <FiCheck className="w-3.5 h-3.5 text-success" /> : <FiCopy className="w-3.5 h-3.5" />}
              </button>

              {/* Speak */}
              <button
                onClick={handleSpeak}
                className={`p-1.5 transition-colors ${isSpeaking ? 'text-mode-study bg-mode-study/10' : 'text-text-tertiary hover:text-text-secondary hover:bg-elevated'}`}
                title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
              >
                {isSpeaking ? <FiVolumeX className="w-3.5 h-3.5" /> : <FiVolume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Bookmark */}
              <button
                onClick={onBookmark}
                className={`p-1.5 transition-colors ${message.isBookmarked ? 'text-warning' : 'text-text-tertiary hover:text-text-secondary hover:bg-elevated'}`}
                title={message.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              >
                <FiBookmark className={`w-3.5 h-3.5 ${message.isBookmarked ? 'fill-current' : ''}`} />
              </button>

              {/* Reactions */}
              <div className="flex items-center gap-0.5 ml-2 border-l border-border pl-2">
                <button
                  onClick={() => setReaction(reaction === 'up' ? null : 'up')}
                  className={`p-1.5 transition-colors ${reaction === 'up' ? 'text-success bg-success-muted' : 'text-text-tertiary hover:text-text-secondary hover:bg-elevated'}`}
                  title="Helpful"
                >
                  <FiThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setReaction(reaction === 'down' ? null : 'down')}
                  className={`p-1.5 transition-colors ${reaction === 'down' ? 'text-error bg-error-muted' : 'text-text-tertiary hover:text-text-secondary hover:bg-elevated'}`}
                  title="Not helpful"
                >
                  <FiThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Error retry */}
          {message.isError && (
            <button className="flex items-center gap-1.5 mt-2 text-xs text-error hover:underline">
              <FiRefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

