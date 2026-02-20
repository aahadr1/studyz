'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import MobileLayout, { MobileHeader, BottomSheet } from '@/components/mobile/MobileLayout'
import { useHapticFeedback } from '@/components/mobile/useMobileUtils'
import MCQInterface from '@/components/MCQInterface'
import { AssistantPanel } from '@/components/assistant'
import AudioPlayer from '@/components/assistant/AudioPlayer'
import { FiChevronLeft, FiChevronRight, FiMessageSquare, FiBook, FiCheckSquare } from 'react-icons/fi'
import type { InteractiveLesson, InteractiveLessonDocument, InteractiveLessonPageSection } from '@/types/db'

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

type ActivePanel = 'none' | 'lesson' | 'mcq' | 'assistant'

export default function MobileInteractiveLessonPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string
  const { triggerHaptic } = useHapticFeedback()

  const [lessonData, setLessonData] = useState<InteractiveLessonData | null>(null)
  const [pageImages, setPageImages] = useState<PageImage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [currentSection, setCurrentSection] = useState<SectionWithAudio | null>(null)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [lessonStatus, setLessonStatus] = useState<string>('none')
  const [activePanel, setActivePanel] = useState<ActivePanel>('none')

  useEffect(() => {
    loadLesson()
  }, [lessonId])

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
        router.push('/m/login')
        return
      }

      setAuthToken(session.access_token)

      const response = await fetch(`/api/interactive-lessons/${lessonId}/data`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setLessonData(data)
        setLessonStatus(data.lesson?.lesson_status || 'none')
        
        const pagesResponse = await fetch(`/api/interactive-lessons/${lessonId}/page/1`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json()
          if (pagesData.allPages) {
            setPageImages(pagesData.allPages)
          }
        }

        await fetchSection(1, session.access_token)
      } else {
        router.push('/m/interactive-lessons')
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
        headers: { 'Authorization': `Bearer ${accessToken}` },
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
      triggerHaptic('light')
      setImageLoading(true)
      setCurrentPage(page)
    }
  }

  const getCurrentPageImageUrl = () => {
    const pageImage = pageImages.find(p => p.page_number === currentPage)
    return pageImage?.image_path || null
  }

  const openPanel = (panel: ActivePanel) => {
    triggerHaptic('light')
    setActivePanel(panel)
  }

  if (loading) {
    return (
      <MobileLayout hideTabBar>
        <MobileHeader title="Loading..." backHref="/m/interactive-lessons" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  if (!lessonData) {
    return (
      <MobileLayout hideTabBar>
        <MobileHeader title="Error" backHref="/m/interactive-lessons" />
        <div className="mobile-content flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-sm font-medium mb-2">Lesson not found</p>
          </div>
        </div>
      </MobileLayout>
    )
  }

  const lesson = lessonData.lesson
  const totalPages = lessonData.totalPages || pageImages.length || 1
  const currentPageImageUrl = getCurrentPageImageUrl()
  const hasSection = currentSection || sectionLoading || lessonStatus === 'ready'

  return (
    <MobileLayout hideTabBar>
      <MobileHeader 
        title={`Page ${currentPage}/${totalPages}`}
        backHref="/m/interactive-lessons"
      />

      {/* Main Content */}
      <div className="mobile-content-full flex flex-col">
        {/* Document Viewer */}
        <div className="flex-1 overflow-auto bg-[var(--color-bg-secondary)] p-4">
          <div className="flex justify-center">
            {currentPageImageUrl ? (
              <div className="relative w-full max-w-2xl">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]">
                    <div className="spinner-mobile" />
                  </div>
                )}
                <img
                  src={currentPageImageUrl}
                  alt={`Page ${currentPage}`}
                  className="w-full h-auto border border-[var(--color-border)]"
                  onLoad={() => setImageLoading(false)}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-[var(--color-text-tertiary)]">
                Page not available
              </div>
            )}
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
          {/* Page Navigation */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-2 text-sm disabled:opacity-30"
            >
              <FiChevronLeft className="w-4 h-4" />
              Prev
            </button>
            
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-12 px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] text-center text-sm mono"
              />
              <span className="text-xs text-[var(--color-text-tertiary)] mono">/ {totalPages}</span>
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm disabled:opacity-30"
            >
              Next
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-1 p-2 bg-[var(--color-border)]">
            {hasSection && (
              <button
                onClick={() => openPanel('lesson')}
                className="flex flex-col items-center justify-center py-3 bg-[var(--color-bg)] active:bg-[var(--color-surface)]"
              >
                <FiBook className="w-5 h-5 mb-1" strokeWidth={1.5} />
                <span className="text-[9px] uppercase tracking-wider">Lesson</span>
              </button>
            )}
            <button
              onClick={() => openPanel('mcq')}
              className="flex flex-col items-center justify-center py-3 bg-[var(--color-bg)] active:bg-[var(--color-surface)]"
            >
              <FiCheckSquare className="w-5 h-5 mb-1" strokeWidth={1.5} />
              <span className="text-[9px] uppercase tracking-wider">Quiz</span>
            </button>
            <button
              onClick={() => openPanel('assistant')}
              className="flex flex-col items-center justify-center py-3 bg-[var(--color-bg)] active:bg-[var(--color-surface)]"
            >
              <FiMessageSquare className="w-5 h-5 mb-1" strokeWidth={1.5} />
              <span className="text-[9px] uppercase tracking-wider">Ask AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lesson Panel */}
      <BottomSheet
        isOpen={activePanel === 'lesson'}
        onClose={() => setActivePanel('none')}
        title={`Lesson · Page ${currentPage}`}
      >
        {sectionLoading ? (
          <div className="space-y-4">
            <div className="h-6 bg-[var(--color-surface)] animate-pulse w-3/4" />
            <div className="space-y-2">
              <div className="h-4 bg-[var(--color-surface)] animate-pulse" />
              <div className="h-4 bg-[var(--color-surface)] animate-pulse w-5/6" />
              <div className="h-4 bg-[var(--color-surface)] animate-pulse w-4/5" />
            </div>
          </div>
        ) : currentSection ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {currentSection.section_title}
            </h2>
            <div className="text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed text-sm">
              {currentSection.section_content}
            </div>
            {currentSection.audio_url && (
              <div className="pt-4 border-t border-[var(--color-border)]">
                <AudioPlayer
                  src={currentSection.audio_url}
                  downloadFilename={`cours-page-${currentPage}.mp3`}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FiBook className="w-8 h-8 text-[var(--color-text-tertiary)] mb-3" strokeWidth={1} />
            <p className="text-[var(--color-text-tertiary)] text-sm">
              No lesson section for this page
            </p>
          </div>
        )}
      </BottomSheet>

      {/* MCQ Panel */}
      <BottomSheet
        isOpen={activePanel === 'mcq'}
        onClose={() => setActivePanel('none')}
        title="Quiz"
      >
        <div className="-mx-5 -mb-5">
          <MCQInterface
            lessonId={lessonId}
            currentPage={currentPage}
          />
        </div>
      </BottomSheet>

      {/* Assistant Panel */}
      <BottomSheet
        isOpen={activePanel === 'assistant'}
        onClose={() => setActivePanel('none')}
        title="AI Assistant"
      >
        <div className="-mx-5 -mb-5 h-[70vh]">
          <AssistantPanel
            lessonId={lessonId}
            lessonName={lesson.name}
            currentPage={currentPage}
            totalPages={totalPages}
            pageImageUrl={currentPageImageUrl || undefined}
            initialMessages={[]}
            onClose={() => setActivePanel('none')}
            chatEndpoint={`/api/interactive-lessons/${lessonId}/chat`}
            messagesEndpoint={`/api/interactive-lessons/${lessonId}/messages`}
            enableExplainPage={true}
          />
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}
