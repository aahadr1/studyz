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

  // Player state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [showQuiz, setShowQuiz] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  // Load lesson data
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

      // Initialize progress if needed
      if (!data.progress || data.progress.length === 0) {
        await fetch(`/api/interactive-lessons/${lessonId}/progress`, {
          method: 'POST'
        })
        // Reload to get initialized progress
        const progressResponse = await fetch(`/api/interactive-lessons/${lessonId}/progress`)
        if (progressResponse.ok) {
          const progressData = await progressResponse.json()
          // Convert to the expected format
          const progressList = progressData.sections?.map((s: any) => ({
            section_id: s.id,
            status: s.status,
            score: s.score
          })) || []
          setProgress(progressList)
        }
      }

      // Find current section (first non-completed or first section)
      const currentSection = data.sections?.find((s: Section, i: number) => {
        const sProgress = data.progress?.find((p: Progress) => p.section_id === s.id)
        return !sProgress || sProgress.status !== 'completed'
      })
      
      if (currentSection) {
        const idx = data.sections.findIndex((s: Section) => s.id === currentSection.id)
        setCurrentSectionIndex(idx >= 0 ? idx : 0)
        setCurrentPage(currentSection.start_page)
      }

      // Check if all sections are complete
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

  // Progress map for components
  const progressMap = new Map(
    progress.map(p => [p.section_id, { status: p.status, score: p.score }])
  )

  // Unlocked sections set
  const unlockedSections = new Set(
    progress
      .filter(p => p.status === 'current' || p.status === 'completed')
      .map(p => p.section_id)
  )
  // First section is always unlocked
  if (sections.length > 0) {
    unlockedSections.add(sections[0].id)
  }

  // Current section
  const currentSection = sections[currentSectionIndex]

  // Get document URL for current section
  const getPdfUrl = () => {
    if (!currentSection || lesson?.mode === 'mcq_only') return null
    
    // Find the document for this section
    const docId = currentSection.document_id
    if (docId && documentUrls[docId]) {
      return documentUrls[docId]
    }
    
    // Fallback to first lesson document
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
    // Show quiz when reaching section end
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

    // Update local progress
    if (result.passed) {
      setProgress(prev => {
        const updated = [...prev]
        const idx = updated.findIndex(p => p.section_id === sectionId)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], status: 'completed', score: result.score }
        } else {
          updated.push({ section_id: sectionId, status: 'completed', score: result.score })
        }
        
        // Unlock next section
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
    // Move to next section or show completion
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
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <FiLoader className="w-8 h-8 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading lesson...</p>
        </div>
      </div>
    )
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Lesson not found'}</p>
          <button
            onClick={() => router.push('/interactive-lessons')}
            className="text-violet-400 hover:text-violet-300"
          >
            ← Back to lessons
          </button>
        </div>
      </div>
    )
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-20 h-20 bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiCheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Congratulations!</h1>
          <p className="text-gray-400 mb-6">
            You've completed <span className="text-white font-medium">{lesson.name}</span>! 
            All sections have been mastered.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
              className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition"
            >
              View Results
            </button>
            <button
              onClick={() => router.push('/interactive-lessons')}
              className="w-full px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
            >
              Back to Lessons
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-neutral-800 bg-neutral-900">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
              className="flex items-center gap-1 text-gray-400 hover:text-white transition"
            >
              <FiArrowLeft className="w-4 h-4" />
              Exit
            </button>
            <h1 className="text-lg font-semibold text-white">{lesson.name}</h1>
          </div>
        </div>
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
        {/* Left: PDF Viewer or Generated Content */}
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
            <div className="h-full flex items-center justify-center bg-neutral-900 p-8">
              <div className="max-w-2xl text-center">
                <p className="text-gray-400 mb-4">
                  This is a QCM-only lesson. View the content in the sidebar and complete the quiz.
                </p>
                <button
                  onClick={handleStartQuiz}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition"
                >
                  Start Quiz for Section {currentSectionIndex + 1}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-neutral-900 text-gray-400">
              <p>No document available</p>
            </div>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="w-96 flex-shrink-0">
          <SectionSidebar
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

