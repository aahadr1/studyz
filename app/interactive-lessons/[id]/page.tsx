'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { 
  FiPlay, FiLoader, FiCheckCircle, FiAlertCircle, FiFileText, 
  FiBook, FiRefreshCw, FiTrash2, FiArrowLeft, FiList
} from 'react-icons/fi'

interface Document {
  id: string
  category: 'lesson' | 'mcq'
  name: string
  file_type: string
  page_count: number
  created_at: string
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
  interactive_lesson_questions: any[]
}

interface InteractiveLesson {
  id: string
  name: string
  subject: string | null
  level: string | null
  language: string
  mode: 'document_based' | 'mcq_only'
  status: 'draft' | 'processing' | 'ready' | 'error'
  error_message: string | null
  created_at: string
  interactive_lesson_documents: Document[]
  interactive_lesson_sections: Section[]
}

export default function InteractiveLessonDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<InteractiveLesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLesson = useCallback(async () => {
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}`)
      if (response.ok) {
        const data = await response.json()
        setLesson(data.lesson)
      } else {
        setError('Failed to load lesson')
      }
    } catch (err) {
      console.error('Error loading lesson:', err)
      setError('Failed to load lesson')
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    loadLesson()
  }, [loadLesson])

  useEffect(() => {
    if (lesson?.status === 'processing') {
      const interval = setInterval(loadLesson, 5000)
      return () => clearInterval(interval)
    }
  }, [lesson?.status, loadLesson])

  const handleProcess = async () => {
    setProcessing(true)
    setError(null)

    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/process`, {
        method: 'POST'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Processing failed')
      }

      await loadLesson()
    } catch (err: any) {
      setError(err.message || 'Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this lesson?')) return

    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        router.push('/interactive-lessons')
      }
    } catch (err) {
      console.error('Error deleting lesson:', err)
    }
  }

  const handleStartLearning = async () => {
    await fetch(`/api/interactive-lessons/${lessonId}/progress`, {
      method: 'POST'
    })
    router.push(`/interactive-lessons/${lessonId}/player`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-text-tertiary text-sm">Loading lesson...</p>
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-tertiary mb-4">Lesson not found</p>
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

  const lessonDocs = lesson.interactive_lesson_documents?.filter(d => d.category === 'lesson') || []
  const mcqDocs = lesson.interactive_lesson_documents?.filter(d => d.category === 'mcq') || []
  const sections = lesson.interactive_lesson_sections || []
  const totalQuestions = sections.reduce((sum, s) => sum + (s.interactive_lesson_questions?.length || 0), 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-3xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/interactive-lessons')}
              className="btn-ghost p-2"
            >
              <FiArrowLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {lesson.status === 'ready' && (
              <button
                onClick={handleStartLearning}
                className="btn-primary"
              >
                <FiPlay className="w-4 h-4" />
                Start Learning
              </button>
            )}
            <button
              onClick={handleDelete}
              className="btn-ghost p-2 text-text-tertiary hover:text-error"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Lesson Info */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">{lesson.name}</h1>
          <div className="flex items-center gap-3 text-sm text-text-tertiary">
            {lesson.subject && <span>{lesson.subject}</span>}
            {lesson.level && <span>• {lesson.level}</span>}
            <span>• {lesson.mode === 'document_based' ? 'PDF-based' : 'MCQ-only'}</span>
            <span>• {new Date(lesson.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Status Card */}
        <div className="card p-8 mb-8">
          {lesson.status === 'draft' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiFileText className="w-7 h-7 text-text-tertiary" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Ready to Process</h2>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                Your documents are uploaded. Click below to analyze and generate sections with quizzes.
              </p>
              <button
                onClick={handleProcess}
                disabled={processing}
                className="btn-primary px-6 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FiPlay className="w-4 h-4" />
                    Start Processing
                  </>
                )}
              </button>
            </div>
          )}

          {lesson.status === 'processing' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-warning-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiLoader className="w-7 h-7 text-warning animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Processing</h2>
              <p className="text-text-secondary mb-4 max-w-md mx-auto">
                Analyzing documents and generating sections. This may take a few minutes.
              </p>
              <p className="text-sm text-text-tertiary flex items-center justify-center gap-2">
                <FiRefreshCw className="w-3 h-3 animate-spin" />
                Auto-refreshing...
              </p>
            </div>
          )}

          {lesson.status === 'ready' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-success-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiCheckCircle className="w-7 h-7 text-success" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Ready to Learn</h2>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                Your interactive lesson is ready. Click below to start.
              </p>
              <button
                onClick={handleStartLearning}
                className="btn-primary px-6"
              >
                <FiPlay className="w-4 h-4" />
                Start Learning
              </button>
            </div>
          )}

          {lesson.status === 'error' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-error-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiAlertCircle className="w-7 h-7 text-error" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Processing Failed</h2>
              <p className="text-error mb-4">{lesson.error_message || 'An error occurred'}</p>
              <button
                onClick={handleProcess}
                disabled={processing}
                className="btn-secondary"
              >
                {processing ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <FiRefreshCw className="w-4 h-4" />
                    Retry
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-8 p-3 bg-error-muted border border-error/30 text-error text-sm rounded-md">
            {error}
          </div>
        )}

        {/* Documents */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiBook className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-text-primary">Lesson Documents</h3>
              <span className="text-sm text-text-tertiary">({lessonDocs.length})</span>
            </div>
            {lessonDocs.length > 0 ? (
              <div className="space-y-2">
                {lessonDocs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between px-3 py-2 bg-elevated rounded-md">
                    <span className="text-sm text-text-secondary truncate">{doc.name}</span>
                    <span className="text-xs text-text-tertiary">{doc.page_count} pages</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">No lesson documents</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiFileText className="w-4 h-4 text-text-secondary" />
              <h3 className="font-medium text-text-primary">MCQ Documents</h3>
              <span className="text-sm text-text-tertiary">({mcqDocs.length})</span>
            </div>
            {mcqDocs.length > 0 ? (
              <div className="space-y-2">
                {mcqDocs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between px-3 py-2 bg-elevated rounded-md">
                    <span className="text-sm text-text-secondary truncate">{doc.name}</span>
                    <span className="text-xs text-text-tertiary uppercase">{doc.file_type}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">AI will generate questions</p>
            )}
          </div>
        </div>

        {/* Sections Preview */}
        {lesson.status === 'ready' && sections.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiList className="w-4 h-4 text-success" />
              <h3 className="font-medium text-text-primary">Sections</h3>
              <span className="text-sm text-text-tertiary">({sections.length} sections, {totalQuestions} questions)</span>
            </div>
            <div className="space-y-3">
              {sections.map((section, index) => (
                <div key={section.id} className="p-4 bg-elevated rounded-md">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-medium text-accent">Section {index + 1}</span>
                      <span className="text-xs text-text-tertiary ml-2">
                        Pages {section.start_page} - {section.end_page}
                      </span>
                    </div>
                    <div className="text-right text-xs text-text-tertiary">
                      {section.interactive_lesson_questions?.length || 0} questions
                    </div>
                  </div>
                  <h4 className="font-medium text-text-primary mb-1">{section.title}</h4>
                  {section.summary && (
                    <p className="text-sm text-text-secondary">{section.summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
