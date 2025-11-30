'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiSend, FiMessageSquare } from 'react-icons/fi'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Lesson, LessonPage, LessonMessage } from '@/types/db'

export default function LessonViewerPage() {
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [pages, setPages] = useState<LessonPage[]>([])
  const [messages, setMessages] = useState<LessonMessage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [imageLoading, setImageLoading] = useState(true)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadLesson = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      const response = await fetch(`/api/lessons/${lessonId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setLesson(data.lesson)
        setPages(data.pages)
        setMessages(data.messages)
      } else {
        window.location.href = '/lessons'
      }
    } catch (error) {
      console.error('Error loading lesson:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || sending) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setSending(true)

    // Optimistically add user message
    const tempUserMessage: LessonMessage = {
      id: `temp-${Date.now()}`,
      lesson_id: lessonId,
      role: 'user',
      content: userMessage,
      page_context: currentPage,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMessage])

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/lessons/${lessonId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          currentPage,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Add assistant response
        const assistantMessage: LessonMessage = {
          id: `assistant-${Date.now()}`,
          lesson_id: lessonId,
          role: 'assistant',
          content: data.response,
          page_context: data.pageContext,
          created_at: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMessage])
      } else {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id))
        console.error('Chat error:', data.error)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (lesson?.total_pages || 1)) {
      setImageLoading(true)
      setCurrentPage(page)
    }
  }

  const currentPageData = pages.find(p => p.page_number === currentPage)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-secondary">Lesson not found</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
        <Link href="/lessons" className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary truncate flex-1">
          {lesson.name}
        </h1>
        <div className="text-sm text-text-tertiary">
          Page {currentPage} of {lesson.total_pages}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Viewer - Left Side */}
        <div className="flex-1 flex flex-col bg-elevated">
          {/* Page Navigation */}
          <div className="h-12 border-b border-border flex items-center justify-center gap-4 flex-shrink-0">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FiChevronLeft className="w-5 h-5" />
              Previous
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={lesson.total_pages}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-surface border border-border rounded text-center text-sm"
              />
              <span className="text-text-tertiary text-sm">/ {lesson.total_pages}</span>
            </div>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= lesson.total_pages}
              className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
              <FiChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Page Image */}
          <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
            {currentPageData ? (
              <div className="relative">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface">
                    <div className="spinner" />
                  </div>
                )}
                <img
                  src={currentPageData.image_url}
                  alt={`Page ${currentPage}`}
                  className="max-w-full h-auto shadow-lg rounded"
                  onLoad={() => setImageLoading(false)}
                  style={{ maxHeight: 'calc(100vh - 180px)' }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-text-tertiary">
                Page not available
              </div>
            )}
          </div>
        </div>

        {/* Chat Sidebar - Right Side */}
        <div className="w-96 border-l border-border flex flex-col bg-surface">
          {/* Chat Header */}
          <div className="h-12 border-b border-border flex items-center px-4 gap-2 flex-shrink-0">
            <FiMessageSquare className="w-4 h-4 text-accent" />
            <span className="font-medium text-text-primary">AI Assistant</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-accent-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <FiMessageSquare className="w-6 h-6 text-accent" />
                </div>
                <p className="text-text-secondary text-sm">
                  Ask me anything about the content on this page!
                </p>
                <p className="text-text-tertiary text-xs mt-1">
                  I can see the current page and help explain concepts.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-elevated text-text-primary'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.page_context && (
                      <p className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-white/70' : 'text-text-tertiary'
                      }`}>
                        Page {message.page_context}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-elevated rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-text-tertiary">
                    <div className="spinner w-4 h-4" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this page..."
                rows={2}
                className="input flex-1 resize-none"
                disabled={sending}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || sending}
                className="btn-primary px-3 self-end disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiSend className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-text-tertiary mt-2">
              Currently viewing page {currentPage}. Press Enter to send.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
