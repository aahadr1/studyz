'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiMessageSquare, FiZoomIn, FiZoomOut, FiMaximize2 } from 'react-icons/fi'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { AssistantPanel } from '@/components/assistant'
import MCQInterface from '@/components/MCQInterface'
import LessonSectionDisplay, { LessonSectionSkeleton, LessonSectionEmpty } from '@/components/LessonSectionDisplay'
import { ResizableHandle, usePanelSizes } from '@/components/ResizablePanel'
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

// Default panel sizes
const DEFAULT_SIZES = {
  sidebar: 420,
  bottomPanel: 200,
  docScale: 100,
}

// Min/max constraints
const CONSTRAINTS = {
  sidebar: { min: 280, max: 600 },
  bottomPanel: { min: 100, max: 500 },
  docScale: { min: 50, max: 200 },
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
  const [showMCQ, setShowMCQ] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)

  // Section state
  const [currentSection, setCurrentSection] = useState<SectionWithAudio | null>(null)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [lessonStatus, setLessonStatus] = useState<string>('none')

  // Resizable panel sizes
  const { sizes, updateSize, loaded: sizesLoaded } = usePanelSizes(
    `interactive-lesson-${lessonId}-sizes`,
    DEFAULT_SIZES
  )

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

  // Handle sidebar resize
  const handleSidebarResize = useCallback((delta: number) => {
    const newSize = Math.max(
      CONSTRAINTS.sidebar.min,
      Math.min(CONSTRAINTS.sidebar.max, sizes.sidebar - delta)
    )
    updateSize('sidebar', newSize)
  }, [sizes.sidebar, updateSize])

  // Handle bottom panel resize
  const handleBottomPanelResize = useCallback((delta: number) => {
    const newSize = Math.max(
      CONSTRAINTS.bottomPanel.min,
      Math.min(CONSTRAINTS.bottomPanel.max, sizes.bottomPanel - delta)
    )
    updateSize('bottomPanel', newSize)
  }, [sizes.bottomPanel, updateSize])

  // Handle doc scale
  const handleZoomIn = () => {
    const newScale = Math.min(CONSTRAINTS.docScale.max, sizes.docScale + 10)
    updateSize('docScale', newScale)
  }

  const handleZoomOut = () => {
    const newScale = Math.max(CONSTRAINTS.docScale.min, sizes.docScale - 10)
    updateSize('docScale', newScale)
  }

  const handleResetZoom = () => {
    updateSize('docScale', 100)
  }

  if (loading || !sizesLoaded) {
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
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 border border-border rounded px-1">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
              title="Zoom out"
            >
              <FiZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 py-1 text-xs mono text-text-secondary hover:text-text-primary transition-colors min-w-[48px]"
              title="Reset zoom"
            >
              {sizes.docScale}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
              title="Zoom in"
            >
              <FiZoomIn className="w-4 h-4" />
            </button>
          </div>

          <span className="text-sm text-text-tertiary mono">
            {currentPage} / {totalPages}
          </span>
          
          {/* Toggle MCQ Panel */}
          <button
            onClick={() => setShowMCQ(!showMCQ)}
            className={`btn-ghost text-sm ${showMCQ ? 'text-mode-study' : ''}`}
            title={showMCQ ? 'Hide MCQ' : 'Show MCQ'}
          >
            MCQ
          </button>

          {/* Toggle Assistant */}
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
        <div className="flex-1 flex flex-col bg-elevated min-w-0">
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
            <div className="mx-auto" style={{ maxWidth: `${Math.max(400, 800 * (sizes.docScale / 100))}px` }}>
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
                      className="h-auto border border-border transition-all"
                      onLoad={() => setImageLoading(false)}
                      style={{ 
                        width: `${sizes.docScale}%`,
                        maxWidth: 'none',
                      }}
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

          {/* Resizable Bottom Panel - MCQ Interface */}
          {showMCQ && (
            <>
              <ResizableHandle 
                direction="vertical" 
                onResize={handleBottomPanelResize}
              />
              <div 
                className="flex-shrink-0 overflow-hidden"
                style={{ height: sizes.bottomPanel }}
              >
                <MCQInterface
                  lessonId={lessonId}
                  currentPage={currentPage}
                />
              </div>
            </>
          )}
        </div>

        {/* Resizable Sidebar Handle */}
        {showAssistant && (
          <ResizableHandle 
            direction="horizontal" 
            onResize={handleSidebarResize}
          />
        )}

        {/* AI Assistant Panel - Right Side */}
        {showAssistant && (
          <div 
            className="flex-shrink-0 overflow-hidden"
            style={{ width: sizes.sidebar }}
          >
            <AssistantPanel
              lessonId={lessonId}
              lessonName={lesson.name}
              currentPage={currentPage}
              totalPages={totalPages}
              pageImageUrl={currentPageImageUrl || undefined}
              initialMessages={messages}
              onClose={() => setShowAssistant(false)}
              chatEndpoint={`/api/interactive-lessons/${lessonId}/chat`}
              messagesEndpoint={`/api/interactive-lessons/${lessonId}/messages`}
              enableExplainPage={true}
            />
          </div>
        )}
      </div>
    </div>
  )
}
