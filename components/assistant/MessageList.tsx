'use client'

import { RefObject } from 'react'
import MessageBubble from './MessageBubble'
import type { AssistantMessage } from './AssistantPanel'
import { FiCpu } from 'react-icons/fi'

interface MessageListProps {
  messages: AssistantMessage[]
  streamingContent: string
  isLoading: boolean
  onBookmark: (messageId: string) => void
  onQuickAction: (prompt: string) => void
  autoSpeak: boolean
  messagesEndRef: RefObject<HTMLDivElement>
}

export default function MessageList({
  messages,
  streamingContent,
  isLoading,
  onBookmark,
  onQuickAction,
  autoSpeak,
  messagesEndRef,
}: MessageListProps) {
  const showWelcome = messages.length === 0 && !isLoading && !streamingContent

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Welcome Message */}
      {showWelcome && (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <div className="w-16 h-16 bg-mode-study/10 border border-mode-study/30 flex items-center justify-center mb-4">
            <FiCpu className="w-8 h-8 text-mode-study" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            AI Study Assistant
          </h3>
          <p className="text-sm text-text-secondary max-w-xs mb-6">
            I can see this page and help you understand the content. Ask me anything!
          </p>
          <div className="grid grid-cols-2 gap-2 text-left max-w-sm">
            {[
              'Explain this concept',
              'Summarize the page',
              'Define key terms',
              'Create practice questions',
            ].map((suggestion, i) => (
              <button
                key={i}
                onClick={() => onQuickAction(suggestion)}
                className="px-3 py-2 text-xs text-text-secondary border border-border hover:border-border-light hover:text-text-primary transition-colors text-left"
              >
                "{suggestion}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          onBookmark={() => onBookmark(message.id)}
          autoSpeak={autoSpeak && message.role === 'assistant' && index === messages.length - 1}
        />
      ))}

      {/* Streaming Message */}
      {streamingContent && (
        <MessageBubble
          message={{
            id: 'streaming',
            lesson_id: '',
            role: 'assistant',
            content: streamingContent,
            created_at: new Date().toISOString(),
            isStreaming: true,
          }}
          onBookmark={() => {}}
          autoSpeak={false}
        />
      )}

      {/* Loading Indicator */}
      {isLoading && !streamingContent && (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-mode-study flex-shrink-0 flex items-center justify-center">
            <FiCpu className="w-4 h-4 text-white" />
          </div>
          <div className="bg-elevated border border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-text-tertiary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-text-tertiary animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-text-tertiary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-text-tertiary">Analyzing page...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

