'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { 
  FiChevronLeft, 
  FiChevronRight, 
  FiMessageCircle, 
  FiSend,
  FiX,
  FiList
} from 'react-icons/fi'
import type { Lesson, LessonPage, LessonMessage } from '@/types/db'

export default function MobileLessonViewerPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string
  const { triggerHaptic } = useHapticFeedback()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [pages, setPages] = useState<LessonPage[]>([])
  const [messages, setMessages] = useState<LessonMessage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [imageLoading, setImageLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [showPageList, setShowPageList] = useState(false)
  
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
    triggerHaptic('light')

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
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id))
    } finally {
      setSending(false)
    }
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (lesson?.total_pages || 1)) {
      triggerHaptic('light')
      setImageLoading(true)
      setCurrentPage(page)
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToPage(currentPage + 1)
      else goToPage(currentPage - 1)
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
      <div className="mobile-app flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">Not found</p>
          <button onClick={() => router.push('/m/lessons')} className="btn-mobile btn-primary-mobile">
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-app">
      {/* Header */}
      <header className="mobile-header">
        <button onClick={() => router.push('/m/lessons')} className="mobile-header-action">
          <FiChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h1 className="text-xs font-medium uppercase tracking-wider truncate">{lesson.name}</h1>
          <p className="text-[10px] text-[var(--color-text-secondary)] mono">{currentPage}/{lesson.total_pages}</p>
        </div>
        <div className="flex items-center">
          <button onClick={() => setShowPageList(true)} className="mobile-header-action">
            <FiList className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => setChatOpen(true)} className="mobile-header-action relative">
            <FiMessageCircle className="w-5 h-5" strokeWidth={1.5} />
          {messages.length > 0 && (
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[var(--color-text)]" />
          )}
        </button>
        </div>
      </header>

      {/* Document Viewer */}
      <div 
        className="flex-1 overflow-hidden bg-[var(--color-bg-secondary)]"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top))' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
                className="w-full h-auto"
                onLoad={() => setImageLoading(false)}
              />
            </div>
          ) : (
            <p className="text-[var(--color-text-tertiary)] text-sm">Page not available</p>
          )}
        </div>

        {/* Page Navigation */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[var(--color-bg)] to-transparent">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="doc-page-btn disabled:opacity-20"
            >
              <FiChevronLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            
            <div className="px-4 py-2 border border-[var(--color-border)] bg-[var(--color-bg)]">
              <span className="doc-page-indicator mono">{currentPage} / {lesson.total_pages}</span>
            </div>
            
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= lesson.total_pages}
              className="doc-page-btn disabled:opacity-20"
            >
              <FiChevronRight className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Page List */}
      <div className={`fixed inset-0 z-50 transition-opacity ${showPageList ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/80" onClick={() => setShowPageList(false)} />
        <div className={`absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] border-t border-[var(--color-border)] transition-transform ${showPageList ? 'translate-y-0' : 'translate-y-full'}`} style={{ maxHeight: '50vh' }}>
          <div className="bottom-sheet-handle" />
          <div className="px-4 pb-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Pages</span>
          </div>
          <div className="overflow-y-auto pb-safe-bottom" style={{ maxHeight: 'calc(50vh - 40px)' }}>
            <div className="grid grid-cols-5 gap-1 p-4">
              {Array.from({ length: lesson.total_pages }, (_, i) => i + 1).map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => { goToPage(pageNum); setShowPageList(false) }}
                  className={`aspect-square flex items-center justify-center text-xs mono ${
                    pageNum === currentPage
                      ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                      : 'border border-[var(--color-border)] active:bg-[var(--color-surface)]'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className={`fixed inset-0 z-50 transition-opacity ${chatOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/80" onClick={() => setChatOpen(false)} />
        <div className={`absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] border-t border-[var(--color-border)] flex flex-col transition-transform ${chatOpen ? 'translate-y-0' : 'translate-y-full'}`} style={{ height: '70%' }}>
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <div>
              <h2 className="font-medium text-sm">AI Chat</h2>
              <p className="text-[10px] text-[var(--color-text-secondary)] mono">Page {currentPage}</p>
            </div>
            <button onClick={() => setChatOpen(false)} className="p-2">
              <FiX className="w-5 h-5" strokeWidth={1.5} />
              </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--color-text-secondary)]">Ask about this page</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`chat-bubble ${message.role}`}>
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                </div>
              ))
            )}
            {sending && (
              <div className="chat-bubble assistant">
                <div className="spinner-mobile w-4 h-4" />
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
              placeholder="Ask a question..."
              rows={1}
              className="chat-input"
              disabled={sending}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sending}
              className="chat-send-btn"
            >
              <FiSend className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
