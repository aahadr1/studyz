'use client'

import { useEffect, useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { 
  FiChevronLeft, 
  FiChevronRight, 
  FiMessageCircle, 
  FiSend,
  FiX,
  FiMaximize2,
  FiMinimize2
} from 'react-icons/fi'
import type { Lesson, LessonPage, LessonMessage } from '@/types/db'

export default function MobileLessonViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const lessonId = resolvedParams.id

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [pages, setPages] = useState<LessonPage[]>([])
  const [messages, setMessages] = useState<LessonMessage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [imageLoading, setImageLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, chatOpen])

  const loadLesson = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/m/login')
        return
      }

      const response = await fetch(`/api/lessons/${lessonId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setLesson(data.lesson)
        setPages(data.pages)
        setMessages(data.messages)
      } else {
        router.push('/m/lessons')
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

    // Optimistic update
    const tempMessage: LessonMessage = {
      id: `temp-${Date.now()}`,
      lesson_id: lessonId,
      role: 'user',
      content: userMessage,
      page_context: currentPage,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMessage])

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
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id))
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (lesson?.total_pages || 1)) {
      setImageLoading(true)
      setCurrentPage(page)
    }
  }

  // Touch handlers for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current
    const threshold = 50

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - next page
        goToPage(currentPage + 1)
      } else {
        // Swipe right - previous page
        goToPage(currentPage - 1)
      }
    }
  }

  const currentPageData = pages.find(p => p.page_number === currentPage)

  if (loading) {
    return (
      <div className="mobile-app flex items-center justify-center">
        <div className="spinner-mobile" />
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="mobile-app flex items-center justify-center">
        <p className="text-[var(--color-text-secondary)]">Lesson not found</p>
      </div>
    )
  }

  return (
    <div className="mobile-app bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <header className="mobile-header">
        <button 
          onClick={() => router.push('/m/lessons')}
          className="mobile-header-action"
        >
          <FiChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {lesson.name}
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Page {currentPage} of {lesson.total_pages}
          </p>
        </div>
        <button 
          onClick={() => setChatOpen(true)}
          className="mobile-header-action relative"
        >
          <FiMessageCircle className="w-6 h-6" />
          {messages.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--color-accent)] rounded-full" />
          )}
        </button>
      </header>

      {/* Document Viewer */}
      <div 
        className="flex-1 overflow-hidden relative"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top))' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Page Image */}
        <div className="h-full overflow-auto flex items-start justify-center p-4">
          {currentPageData ? (
            <div className="relative w-full">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-secondary)]">
                  <div className="spinner-mobile" />
                </div>
              )}
              <img
                src={currentPageData.image_url}
                alt={`Page ${currentPage}`}
                className="w-full h-auto rounded-lg shadow-lg"
                onLoad={() => setImageLoading(false)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--color-text-tertiary)]">Page not available</p>
            </div>
          )}
        </div>

        {/* Page Navigation */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 bg-gradient-to-t from-[var(--color-bg-secondary)] to-transparent">
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="doc-page-btn disabled:opacity-30"
            >
              <FiChevronLeft className="w-6 h-6" />
            </button>
            
            <div className="px-4 py-2 bg-[var(--color-bg-glass)] backdrop-blur-xl rounded-full">
              <span className="doc-page-indicator">
                {currentPage} / {lesson.total_pages}
              </span>
            </div>
            
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= lesson.total_pages}
              className="doc-page-btn disabled:opacity-30"
            >
              <FiChevronRight className="w-6 h-6" />
            </button>
          </div>
          
          {/* Swipe hint */}
          <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-3">
            Swipe to navigate pages
          </p>
        </div>
      </div>

      {/* Chat Overlay */}
      <div 
        className={`fixed inset-0 z-50 transition-all duration-300 ${
          chatOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div 
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            chatOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => !chatExpanded && setChatOpen(false)}
        />
        
        {/* Chat Panel */}
        <div 
          className={`absolute bottom-0 left-0 right-0 bg-[var(--color-bg-secondary)] rounded-t-3xl transition-transform duration-300 flex flex-col ${
            chatOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ 
            height: chatExpanded ? '100%' : '70%',
            maxHeight: chatExpanded ? '100%' : 'calc(100% - 60px)'
          }}
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center">
                <FiMessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-[var(--color-text-primary)]">AI Assistant</h2>
                <p className="text-xs text-[var(--color-text-secondary)]">Page {currentPage} context</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setChatExpanded(!chatExpanded)}
                className="p-2 text-[var(--color-text-tertiary)]"
              >
                {chatExpanded ? <FiMinimize2 className="w-5 h-5" /> : <FiMaximize2 className="w-5 h-5" />}
              </button>
              <button 
                onClick={() => setChatOpen(false)}
                className="p-2 text-[var(--color-text-tertiary)]"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-soft)] flex items-center justify-center mx-auto mb-4">
                  <FiMessageCircle className="w-8 h-8 text-[var(--color-accent)]" />
                </div>
                <p className="font-semibold text-[var(--color-text-primary)] mb-1">
                  Ask me anything!
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  I can see the current page and help explain concepts
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-bubble ${message.role}`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.page_context && message.role === 'assistant' && (
                    <p className="text-xs mt-1 opacity-70">
                      Referenced page {message.page_context}
                    </p>
                  )}
                </div>
              ))
            )}
            {sending && (
              <div className="chat-bubble assistant">
                <div className="flex items-center gap-2">
                  <div className="spinner-mobile w-4 h-4" style={{ borderWidth: '2px' }} />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-container">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Ask about this page..."
              rows={1}
              className="chat-input"
              disabled={sending}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sending}
              className="chat-send-btn"
            >
              <FiSend className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

