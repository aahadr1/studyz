'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { FiArrowLeft, FiLoader, FiCheckCircle } from 'react-icons/fi'
import ProgressBar from '@/components/ProgressBar'
import SectionSidebar from '@/components/SectionSidebar'

const InteractivePdfViewer = dynamic(
  () => import('@/components/InteractivePdfViewer'),
  { ssr: false }
)

interface Question {
  id: string
  question: string
  choices: string[]
  correct_index: number
  explanation: string
}

interface Section {
  id: string
  section_order: number
  title: string
  start_page: number
  end_page: number
  summary: string
  key_points: string[]
  pass_threshold: number
  document_id: string | null
  interactive_lesson_questions: Question[]
}

interface Document {
  id: string
  category: 'lesson' | 'mcq'
  name: string
  file_path: string
}

interface InteractiveLesson {
  id: string
  name: string
  mode: 'document_based' | 'mcq_only'
  status: string
  interactive_lesson_documents: Document[]
}

interface Progress {
  section_id: string
  status: 'locked' | 'current' | 'completed'
  score?: number
}

interface QuizResult {
  score: number
  passed: boolean
  correctCount: number
  totalQuestions: number
  threshold: number
  attempts: number
  results: Record<string, { correct: boolean; correctAnswer: number }>
}

export default function InteractiveLessonPlayerPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<InteractiveLesson | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [progress, setProgress] = useState<Progress[]>([])
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({})
  const [generatedContent, setGeneratedContent] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [showQuiz, setShowQuiz] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/data`)
      if (!response.ok) {
        throw new Error('Failed to load lesson data')
      }

      const data = await response.json()
      setLesson(data.lesson)
      setSections(data.sections || [])
      setProgress(data.progress || [])
      setDocumentUrls(data.documentUrls || {})
      setGeneratedContent(data.generatedContent || {})

      if (!data.progress || data.progress.length === 0) {
        await fetch(`/api/interactive-lessons/${lessonId}/progress`, {
          method: 'POST'
        })
        const progressResponse = await fetch(`/api/interactive-lessons/${lessonId}/progress`)
        if (progressResponse.ok) {
          const progressData = await progressResponse.json()
          const progressList = progressData.sections?.map((s: any) => ({
            section_id: s.id,
            status: s.status,
            score: s.score
          })) || []
          setProgress(progressList)
        }
      }

      const currentSection = data.sections?.find((s: Section, i: number) => {
        const sProgress = data.progress?.find((p: Progress) => p.section_id === s.id)
        return !sProgress || sProgress.status !== 'completed'
      })
      
      if (currentSection) {
        const idx = data.sections.findIndex((s: Section) => s.id === currentSection.id)
        setCurrentSectionIndex(idx >= 0 ? idx : 0)
        setCurrentPage(currentSection.start_page)
      }

      const allComplete = data.sections?.every((s: Section) => {
        const sProgress = data.progress?.find((p: Progress) => p.section_id === s.id)
        return sProgress?.status === 'completed'
      })
      setIsComplete(allComplete)

    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const progressMap = new Map(
    progress.map(p => [p.section_id, { status: p.status, score: p.score }])
  )

  const unlockedSections = new Set(
    progress
      .filter(p => p.status === 'current' || p.status === 'completed')
      .map(p => p.section_id)
  )
  if (sections.length > 0) {
    unlockedSections.add(sections[0].id)
  }

  const currentSection = sections[currentSectionIndex]

  const getPdfUrl = () => {
    if (!currentSection || lesson?.mode === 'mcq_only') return null
    
    const docId = currentSection.document_id
    if (docId && documentUrls[docId]) {
      return documentUrls[docId]
    }
    
    const lessonDocs = lesson?.interactive_lesson_documents?.filter(d => d.category === 'lesson') || []
    if (lessonDocs.length > 0 && documentUrls[lessonDocs[0].id]) {
      return documentUrls[lessonDocs[0].id]
    }
    
    return null
  }

  const handlePageChange = (page: number, total: number) => {
    setCurrentPage(page)
    setTotalPages(total)
  }

  const handleSectionChange = (index: number) => {
    setCurrentSectionIndex(index)
    setShowQuiz(false)
  }

  const handleReachSectionEnd = () => {
    setShowQuiz(true)
  }

  const handleQuizSubmit = async (sectionId: string, answers: Record<string, number>): Promise<QuizResult> => {
    const response = await fetch(`/api/interactive-lessons/${lessonId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, answers })
    })

    if (!response.ok) {
      throw new Error('Failed to submit quiz')
    }

    const result = await response.json()

    if (result.passed) {
      setProgress(prev => {
        const updated = [...prev]
        const idx = updated.findIndex(p => p.section_id === sectionId)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], status: 'completed', score: result.score }
        } else {
          updated.push({ section_id: sectionId, status: 'completed', score: result.score })
        }
        
        const nextSection = sections[currentSectionIndex + 1]
        if (nextSection) {
          const nextIdx = updated.findIndex(p => p.section_id === nextSection.id)
          if (nextIdx >= 0) {
            if (updated[nextIdx].status === 'locked') {
              updated[nextIdx] = { ...updated[nextIdx], status: 'current' }
            }
          } else {
            updated.push({ section_id: nextSection.id, status: 'current' })
          }
        }
        
        return updated
      })
    }

    return result
  }

  const handleQuizPass = () => {
    if (currentSectionIndex < sections.length - 1) {
      const nextSection = sections[currentSectionIndex + 1]
      setCurrentSectionIndex(currentSectionIndex + 1)
      setCurrentPage(nextSection.start_page)
      setShowQuiz(false)
    } else {
      setIsComplete(true)
    }
  }

  const handleStartQuiz = () => {
    setShowQuiz(true)
  }

  const pdfUrl = getPdfUrl()
  const isAtSectionEnd = currentSection && currentPage === currentSection.end_page

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <FiLoader className="w-6 h-6 text-accent animate-spin mx-auto mb-3" />
          <p className="text-text-tertiary text-sm">Loading lesson...</p>
        </div>
      </div>
    )
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-error mb-4">{error || 'Lesson not found'}</p>
          <button
            onClick={() => router.push('/interactive-lessons')}
            className="text-accent hover:underline"
          >
            ← Back to lessons
          </button>
        </div>
      </div>
    )
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <FiCheckCircle className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary mb-3">Congratulations!</h1>
          <p className="text-text-secondary mb-8">
            You've completed <span className="text-text-primary font-medium">{lesson.name}</span>. 
            All sections have been mastered.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
              className="btn-primary w-full"
            >
              View Results
            </button>
            <button
              onClick={() => router.push('/interactive-lessons')}
              className="btn-secondary w-full"
            >
              Back to Lessons
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-12 flex-shrink-0 border-b border-border bg-surface flex items-center px-4">
        <button
          onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
          className="btn-ghost p-2 mr-3"
        >
          <FiArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-medium text-text-primary truncate">{lesson.name}</h1>
      </header>

      {/* Progress Bar */}
      <ProgressBar
        sections={sections}
        progressMap={progressMap}
        currentSectionIndex={currentSectionIndex}
        onSectionClick={handleSectionChange}
      />

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: PDF Viewer or Content */}
        <div className="flex-1 min-w-0">
          {lesson.mode === 'document_based' && pdfUrl ? (
            <InteractivePdfViewer
              url={pdfUrl}
              sections={sections}
              currentSectionIndex={currentSectionIndex}
              unlockedSections={unlockedSections}
              onPageChange={handlePageChange}
              onSectionChange={handleSectionChange}
              onReachSectionEnd={handleReachSectionEnd}
            />
          ) : lesson.mode === 'mcq_only' ? (
            <div className="h-full flex items-center justify-center bg-surface p-8">
              <div className="max-w-md text-center">
                <p className="text-text-secondary mb-6">
                  This is a MCQ-only lesson. View the content in the sidebar and complete the quiz.
                </p>
                <button
                  onClick={handleStartQuiz}
                  className="btn-primary px-6"
                >
                  Start Quiz for Section {currentSectionIndex + 1}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-surface text-text-tertiary">
              <p>No document available</p>
            </div>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="w-96 flex-shrink-0 border-l border-border">
          <SectionSidebar
            lessonId={lessonId}
            section={currentSection}
            sectionIndex={currentSectionIndex}
            totalSections={sections.length}
            currentPage={currentPage}
            isAtSectionEnd={isAtSectionEnd || false}
            showQuiz={showQuiz}
            generatedContent={currentSection ? generatedContent[currentSection.id] : undefined}
            mode={lesson.mode}
            onQuizSubmit={handleQuizSubmit}
            onQuizPass={handleQuizPass}
            onStartQuiz={handleStartQuiz}
          />
        </div>
      </div>
    </div>
  )
}
