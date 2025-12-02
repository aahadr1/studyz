'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiMessageSquare, FiX } from 'react-icons/fi'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AssistantPanel } from '@/components/assistant'
import type { Lesson, LessonPage, LessonMessage } from '@/types/db'

export default function LessonViewerPage() {
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [pages, setPages] = useState<LessonPage[]>([])
  const [messages, setMessages] = useState<LessonMessage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)
  const [showAssistant, setShowAssistant] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  const loadLesson = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      setAuthToken(session.access_token)

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-tertiary mono">
            {currentPage} / {lesson.total_pages}
          </span>
          {!showAssistant && (
            <button
              onClick={() => setShowAssistant(true)}
              className="btn-ghost flex items-center gap-2"
              title="Open AI Assistant"
            >
              <FiMessageSquare className="w-4 h-4" />
              <span className="text-sm">Assistant</span>
            </button>
          )}
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
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={lesson.total_pages}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-surface border border-border text-center text-sm mono"
              />
              <span className="text-text-tertiary text-sm">/ {lesson.total_pages}</span>
            </div>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= lesson.total_pages}
              className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Next</span>
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
                  className="max-w-full h-auto border border-border"
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

        {/* AI Assistant Panel - Right Side */}
        {showAssistant && (
          <div className="w-[420px] flex-shrink-0">
            <AssistantPanel
              lessonId={lessonId}
              lessonName={lesson.name}
              currentPage={currentPage}
              totalPages={lesson.total_pages}
              pageImageUrl={currentPageData?.image_url}
              initialMessages={messages}
              onClose={() => setShowAssistant(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
