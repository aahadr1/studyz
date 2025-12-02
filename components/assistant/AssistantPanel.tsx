'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { FiX, FiMaximize2, FiMinimize2 } from 'react-icons/fi'
import { createClient } from '@/lib/supabase'
import AssistantHeader from './AssistantHeader'
import ContextPanel from './ContextPanel'
import MessageList from './MessageList'
import StudyToolbar from './StudyToolbar'
import InputArea from './InputArea'
import ConversationMenu from './ConversationMenu'
import type { LessonMessage } from '@/types/db'

export interface AssistantMessage extends LessonMessage {
  isStreaming?: boolean
  isBookmarked?: boolean
  isError?: boolean
}

interface AssistantPanelProps {
  lessonId: string
  lessonName: string
  currentPage: number
  totalPages: number
  pageImageUrl?: string
  onClose?: () => void
  initialMessages?: LessonMessage[]
  className?: string
}

export default function AssistantPanel({
  lessonId,
  lessonName,
  currentPage,
  totalPages,
  pageImageUrl,
  onClose,
  initialMessages = [],
  className = '',
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [showContext, setShowContext] = useState(true)
  const [showConversations, setShowConversations] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [eli5Mode, setEli5Mode] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Cancel any ongoing stream when unmounting
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    // Cancel any previous stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      lesson_id: lessonId,
      role: 'user',
      content: content.trim(),
      page_context: currentPage,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    setStreamingContent('')

    try {
      // Get auth token
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/lessons/${lessonId}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: eli5Mode ? `Explain like I'm 5: ${content}` : content,
          currentPage,
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) throw new Error('Failed to get response')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No reader available')

      let fullContent = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                fullContent += parsed.content
                setStreamingContent(fullContent)
              }
            } catch {
              // Non-JSON line, might be content directly
              if (data && data !== '[DONE]') {
                fullContent += data
                setStreamingContent(fullContent)
              }
            }
          }
        }
      }

      const assistantMessage: AssistantMessage = {
        id: `assistant-${Date.now()}`,
        lesson_id: lessonId,
        role: 'assistant',
        content: fullContent || 'I apologize, but I could not generate a response.',
        page_context: currentPage,
        created_at: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMessage])
      setStreamingContent('')

      // Auto-speak if enabled
      if (autoSpeak && fullContent) {
        // TTS will be handled by MessageBubble
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return

      const errorMessage: AssistantMessage = {
        id: `error-${Date.now()}`,
        lesson_id: lessonId,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        page_context: currentPage,
        created_at: new Date().toISOString(),
        isError: true,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      setStreamingContent('')
    }
  }, [lessonId, currentPage, isLoading, eli5Mode, autoSpeak])

  const handleQuickAction = useCallback((prompt: string) => {
    handleSendMessage(prompt)
  }, [handleSendMessage])

  const handleBookmarkMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, isBookmarked: !msg.isBookmarked } : msg
    ))
  }, [])

  const handleClearChat = useCallback(() => {
    setMessages([])
  }, [])

  const handleExportChat = useCallback(() => {
    const markdown = messages.map(msg => {
      const role = msg.role === 'user' ? '**You**' : '**Assistant**'
      const time = new Date(msg.created_at).toLocaleString()
      return `### ${role} (${time})\n\n${msg.content}\n`
    }).join('\n---\n\n')

    const blob = new Blob([`# ${lessonName} - Chat Export\n\n${markdown}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${lessonName.replace(/\s+/g, '-')}-chat.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages, lessonName])

  const filteredMessages = searchQuery
    ? messages.filter(msg => 
        msg.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages

  return (
    <div className={`flex flex-col h-full bg-background border-l border-border ${isExpanded ? 'fixed inset-0 z-50' : ''} ${className}`}>
      {/* Header */}
      <AssistantHeader
        currentPage={currentPage}
        totalPages={totalPages}
        showContext={showContext}
        onToggleContext={() => setShowContext(!showContext)}
        onShowConversations={() => setShowConversations(true)}
        onClearChat={handleClearChat}
        onExportChat={handleExportChat}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        onClose={onClose}
      />

      {/* Context Panel */}
      {showContext && (
        <ContextPanel
          pageImageUrl={pageImageUrl}
          currentPage={currentPage}
          onQuickAsk={handleQuickAction}
        />
      )}

      {/* Messages */}
      <MessageList
        messages={filteredMessages}
        streamingContent={streamingContent}
        isLoading={isLoading}
        onBookmark={handleBookmarkMessage}
        onQuickAction={handleQuickAction}
        autoSpeak={autoSpeak}
        messagesEndRef={messagesEndRef}
      />

      {/* Study Toolbar */}
      <StudyToolbar
        messages={messages}
        lessonId={lessonId}
        currentPage={currentPage}
        eli5Mode={eli5Mode}
        onToggleEli5={() => setEli5Mode(!eli5Mode)}
        autoSpeak={autoSpeak}
        onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
        onQuickAction={handleQuickAction}
      />

      {/* Input Area */}
      <InputArea
        onSend={handleSendMessage}
        isLoading={isLoading}
        currentPage={currentPage}
      />

      {/* Conversation Menu */}
      {showConversations && (
        <ConversationMenu
          lessonId={lessonId}
          onClose={() => setShowConversations(false)}
          onLoadConversation={(msgs) => setMessages(msgs)}
        />
      )}
    </div>
  )
}

