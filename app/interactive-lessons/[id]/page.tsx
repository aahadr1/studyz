'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiMessageSquare, FiZoomIn, FiZoomOut, FiBookOpen, FiEye, FiEyeOff } from 'react-icons/fi'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { AssistantPanel } from '@/components/assistant'
import MCQInterface from '@/components/MCQInterface'
import { ResizableHandle, usePanelSizes } from '@/components/ResizablePanel'
import AudioPlayer from '@/components/assistant/AudioPlayer'
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
  sidebar: 380,
  sectionPanel: 340,
  bottomPanel: 180,
  docScale: 100,
}

// Min/max constraints
const CONSTRAINTS = {
  sidebar: { min: 280, max: 500 },
  sectionPanel: { min: 240, max: 500 },
  bottomPanel: { min: 100, max: 400 },
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
  const [showSection, setShowSection] = useState(true)
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

  // Handle panel resizes
  const handleSidebarResize = useCallback((delta: number) => {
    const newSize = Math.max(
      CONSTRAINTS.sidebar.min,
      Math.min(CONSTRAINTS.sidebar.max, sizes.sidebar - delta)
    )
    updateSize('sidebar', newSize)
  }, [sizes.sidebar, updateSize])

  const handleSectionPanelResize = useCallback((delta: number) => {
    const newSize = Math.max(
      CONSTRAINTS.sectionPanel.min,
      Math.min(CONSTRAINTS.sectionPanel.max, sizes.sectionPanel + delta)
    )
    updateSize('sectionPanel', newSize)
  }, [sizes.sectionPanel, updateSize])

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
  const hasSection = currentSection || sectionLoading || lessonStatus === 'ready'

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
          
          {/* Toggle Section Panel */}
          {hasSection && (
            <button
              onClick={() => setShowSection(!showSection)}
              className={`btn-ghost flex items-center gap-1.5 text-sm ${showSection ? 'text-mode-study' : ''}`}
              title={showSection ? 'Hide lesson' : 'Show lesson'}
            >
              <FiBookOpen className="w-4 h-4" />
              <span className="hidden md:inline">Cours</span>
            </button>
          )}
          
          {/* Toggle MCQ Panel */}
          <button
            onClick={() => setShowMCQ(!showMCQ)}
            className={`btn-ghost text-sm ${showMCQ ? 'text-mode-study' : ''}`}
            title={showMCQ ? 'Hide MCQ' : 'Show MCQ'}
          >
            MCQ
          </button>

          {/* Toggle Assistant */}
          <button
            onClick={() => setShowAssistant(!showAssistant)}
            className={`btn-ghost flex items-center gap-1.5 ${showAssistant ? 'text-mode-study' : ''}`}
            title={showAssistant ? 'Hide Assistant' : 'Show Assistant'}
          >
            <FiMessageSquare className="w-4 h-4" />
            <span className="hidden md:inline text-sm">Assistant</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Lesson Section Panel */}
        {showSection && hasSection && (
          <>
            <div 
              className="flex-shrink-0 bg-background border-r border-border flex flex-col"
              style={{ width: sizes.sectionPanel }}
            >
              {/* Section Header */}
              <div className="h-12 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <FiBookOpen className="w-4 h-4 text-mode-study" />
                  <span className="text-sm font-medium text-text-primary">Page {currentPage}</span>
                </div>
                <button
                  onClick={() => setShowSection(false)}
                  className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                  title="Hide lesson panel"
                >
                  <FiEyeOff className="w-4 h-4" />
                </button>
              </div>

              {/* Section Content - Scrollable */}
              <div className="flex-1 overflow-auto p-4">
                {sectionLoading ? (
                  <div className="space-y-4">
                    <div className="h-6 bg-elevated rounded animate-pulse w-3/4" />
                    <div className="space-y-2">
                      <div className="h-4 bg-elevated rounded animate-pulse" />
                      <div className="h-4 bg-elevated rounded animate-pulse w-5/6" />
                      <div className="h-4 bg-elevated rounded animate-pulse w-4/5" />
                    </div>
                  </div>
                ) : currentSection ? (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-text-primary leading-tight">
                      {currentSection.section_title}
                    </h2>
                    <div className="prose prose-sm prose-invert max-w-none">
                      <p className="text-text-secondary whitespace-pre-wrap leading-relaxed">
                        {currentSection.section_content}
                      </p>
                    </div>
                  </div>
                ) : lessonStatus === 'ready' ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <FiBookOpen className="w-8 h-8 text-text-tertiary mb-3" />
                    <p className="text-text-tertiary text-sm">
                      No lesson section available for this page
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Audio Player - Fixed at bottom */}
              {currentSection?.audio_url && (
                <div className="flex-shrink-0 border-t border-border p-3 bg-surface">
                  <AudioPlayer
                    src={currentSection.audio_url}
                    downloadFilename={`cours-page-${currentPage}.mp3`}
                  />
                </div>
              )}
            </div>

            {/* Section Panel Resize Handle */}
            <ResizableHandle 
              direction="horizontal" 
              onResize={handleSectionPanelResize}
            />
          </>
        )}

        {/* Center: Document Viewer */}
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

          {/* Document Scrollable Area */}
          <div className="flex-1 overflow-auto p-4">
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
                    className="h-auto border border-border transition-all shadow-lg"
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

        {/* Right: AI Assistant Sidebar */}
        {showAssistant && (
          <>
            <ResizableHandle 
              direction="horizontal" 
              onResize={handleSidebarResize}
            />
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
          </>
        )}
      </div>
    </div>
  )
}
