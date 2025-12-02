'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiMessageSquare } from 'react-icons/fi'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { AssistantPanel } from '@/components/assistant'
import MCQInterface from '@/components/MCQInterface'
import LessonSectionDisplay, { LessonSectionSkeleton, LessonSectionEmpty } from '@/components/LessonSectionDisplay'
import type { InteractiveLesson, InteractiveLessonDocument, LessonMessage, InteractiveLessonPageSection } from '@/types/db'

interface PageImage {
  id: string
  document_id: string
  page_number: number
  image_path: string
}

interface InteractiveLessonData {
  lesson: InteractiveLesson & {
    interactive_lesson_documents: InteractiveLessonDocument[]
  }
  documentUrls: Record<string, string>
  totalPages: number
}

interface SectionWithAudio extends InteractiveLessonPageSection {
  audio_url?: string | null
}

export default function InteractiveLessonViewerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const lessonId = params.id as string
  const initialPage = parseInt(searchParams.get('page') || '1')

  const [lessonData, setLessonData] = useState<InteractiveLessonData | null>(null)
  const [pageImages, setPageImages] = useState<PageImage[]>([])
  const [messages, setMessages] = useState<LessonMessage[]>([])
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)
  const [showAssistant, setShowAssistant] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)

  // Section state
  const [currentSection, setCurrentSection] = useState<SectionWithAudio | null>(null)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [lessonStatus, setLessonStatus] = useState<string>('none')

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  // Fetch section when page changes
  useEffect(() => {
    if (authToken && lessonId) {
      fetchSection(currentPage)
    }
  }, [currentPage, authToken, lessonId])

  const loadLesson = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      setAuthToken(session.access_token)

      // Fetch lesson data
      const response = await fetch(`/api/interactive-lessons/${lessonId}/data`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setLessonData(data)
        setLessonStatus(data.lesson?.lesson_status || 'none')
        
        // Fetch page images
        const pagesResponse = await fetch(`/api/interactive-lessons/${lessonId}/page/1`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json()
          if (pagesData.allPages) {
            setPageImages(pagesData.allPages)
          }
        }

        // Fetch initial section
        await fetchSection(initialPage, session.access_token)
      } else {
        window.location.href = '/interactive-lessons'
      }
    } catch (error) {
      console.error('Error loading interactive lesson:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSection = useCallback(async (pageNumber: number, token?: string) => {
    const accessToken = token || authToken
    if (!accessToken) return

    setSectionLoading(true)
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/sections/${pageNumber}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentSection(data.section)
        if (data.lesson_status) {
          setLessonStatus(data.lesson_status)
        }
      } else {
        setCurrentSection(null)
      }
    } catch (error) {
      console.error('Error fetching section:', error)
      setCurrentSection(null)
    } finally {
      setSectionLoading(false)
    }
  }, [lessonId, authToken])

  const goToPage = (page: number) => {
    const totalPages = lessonData?.totalPages || 1
    if (page >= 1 && page <= totalPages) {
      setImageLoading(true)
      setCurrentPage(page)
    }
  }

  // Get current page image URL
  const getCurrentPageImageUrl = () => {
    const pageImage = pageImages.find(p => p.page_number === currentPage)
    if (pageImage) {
      return pageImage.image_path
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!lessonData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-secondary">Interactive lesson not found</p>
      </div>
    )
  }

  const lesson = lessonData.lesson
  const totalPages = lessonData.totalPages || pageImages.length || 1
  const currentPageImageUrl = getCurrentPageImageUrl()

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
        <Link href="/interactive-lessons" className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary truncate flex-1">
          {lesson.name}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-tertiary mono">
            {currentPage} / {totalPages}
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
                max={totalPages}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-surface border border-border text-center text-sm mono"
              />
              <span className="text-text-tertiary text-sm">/ {totalPages}</span>
            </div>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Next</span>
              <FiChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-4xl mx-auto">
              {/* Section Display - Above PDF */}
              {sectionLoading ? (
                <LessonSectionSkeleton />
              ) : currentSection ? (
                <LessonSectionDisplay
                  title={currentSection.section_title}
                  content={currentSection.section_content}
                  audioUrl={currentSection.audio_url}
                  pageNumber={currentPage}
                />
              ) : lessonStatus === 'ready' ? (
                <LessonSectionEmpty pageNumber={currentPage} />
              ) : null}

              {/* Page Image */}
              <div className="flex justify-center">
                {currentPageImageUrl ? (
                  <div className="relative">
                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-surface">
                        <div className="spinner" />
                      </div>
                    )}
                    <img
                      src={currentPageImageUrl}
                      alt={`Page ${currentPage}`}
                      className="max-w-full h-auto border border-border"
                      onLoad={() => setImageLoading(false)}
                      style={{ maxHeight: 'calc(100vh - 320px)' }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-text-tertiary">
                    Page not available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MCQ Interface */}
          <MCQInterface
            lessonId={lessonId}
            currentPage={currentPage}
          />
        </div>

        {/* AI Assistant Panel - Right Side */}
        {showAssistant && (
          <div className="w-[420px] flex-shrink-0">
            <AssistantPanel
              lessonId={lessonId}
              lessonName={lesson.name}
              currentPage={currentPage}
              totalPages={totalPages}
              pageImageUrl={currentPageImageUrl || undefined}
              initialMessages={messages}
              onClose={() => setShowAssistant(false)}
              chatEndpoint={`/api/interactive-lessons/${lessonId}/chat`}
            />
          </div>
        )}
      </div>
    </div>
  )
}
