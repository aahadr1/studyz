'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { 
  FiPlay, FiLoader, FiCheckCircle, FiAlertCircle, FiFileText, 
  FiBook, FiRefreshCw, FiTrash2, FiArrowLeft, FiList, FiHelpCircle 
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

  // Poll for status updates when processing
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

      // Reload lesson data
      await loadLesson()
    } catch (err: any) {
      setError(err.message || 'Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this interactive lesson?')) return

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
    // Initialize progress if needed
    await fetch(`/api/interactive-lessons/${lessonId}/progress`, {
      method: 'POST'
    })
    router.push(`/interactive-lessons/${lessonId}/player`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading lesson...</p>
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Lesson not found</p>
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

  const lessonDocs = lesson.interactive_lesson_documents?.filter(d => d.category === 'lesson') || []
  const mcqDocs = lesson.interactive_lesson_documents?.filter(d => d.category === 'mcq') || []
  const sections = lesson.interactive_lesson_sections || []
  const totalQuestions = sections.reduce((sum, s) => sum + (s.interactive_lesson_questions?.length || 0), 0)

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/interactive-lessons')}
              className="text-gray-400 hover:text-white transition flex items-center gap-1"
            >
              <FiArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
          <div className="flex items-center gap-2">
            {lesson.status === 'ready' && (
              <button
                onClick={handleStartLearning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
              >
                <FiPlay className="w-4 h-4" />
                Start Learning
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-400 transition"
              title="Delete lesson"
            >
              <FiTrash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Lesson Info */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{lesson.name}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {lesson.subject && <span>{lesson.subject}</span>}
            {lesson.level && <span>• {lesson.level}</span>}
            <span>• {lesson.mode === 'document_based' ? 'PDF-based' : 'MCQ-only'}</span>
            <span>• Created {new Date(lesson.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-8">
          {lesson.status === 'draft' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FiFileText className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ready to Process</h2>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Your documents are uploaded. Click the button below to start processing. 
                The AI will analyze your documents, create sections, and generate questions.
              </p>
              <button
                onClick={handleProcess}
                disabled={processing}
                className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <FiLoader className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FiPlay className="w-5 h-5" />
                    Start Processing
                  </>
                )}
              </button>
            </div>
          )}

          {lesson.status === 'processing' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FiLoader className="w-8 h-8 text-amber-400 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Processing in Progress</h2>
              <p className="text-gray-400 mb-4 max-w-md mx-auto">
                The AI is analyzing your documents, creating sections, and generating questions. 
                This may take a few minutes.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
                <FiRefreshCw className="w-4 h-4 animate-spin" />
                Auto-refreshing every 5 seconds...
              </div>
            </div>
          )}

          {lesson.status === 'ready' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FiCheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ready to Learn!</h2>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Your interactive lesson is ready. Click below to start your learning journey.
              </p>
              <button
                onClick={handleStartLearning}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
              >
                <FiPlay className="w-5 h-5" />
                Start Learning
              </button>
            </div>
          )}

          {lesson.status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FiAlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Processing Failed</h2>
              <p className="text-red-400 mb-4">
                {lesson.error_message || 'An error occurred during processing'}
              </p>
              <button
                onClick={handleProcess}
                disabled={processing}
                className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <FiLoader className="w-5 h-5 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <FiRefreshCw className="w-5 h-5" />
                    Retry Processing
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Documents */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Lesson Documents */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiBook className="w-5 h-5 text-violet-400" />
              <h3 className="font-semibold text-white">Lesson Documents</h3>
              <span className="text-sm text-gray-500">({lessonDocs.length})</span>
            </div>
            {lessonDocs.length > 0 ? (
              <ul className="space-y-2">
                {lessonDocs.map(doc => (
                  <li key={doc.id} className="flex items-center justify-between px-3 py-2 bg-neutral-800 rounded-lg">
                    <span className="text-sm text-gray-300 truncate">{doc.name}</span>
                    <span className="text-xs text-gray-500">{doc.page_count} pages</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No lesson documents</p>
            )}
          </div>

          {/* MCQ Documents */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiHelpCircle className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-white">MCQ Documents</h3>
              <span className="text-sm text-gray-500">({mcqDocs.length})</span>
            </div>
            {mcqDocs.length > 0 ? (
              <ul className="space-y-2">
                {mcqDocs.map(doc => (
                  <li key={doc.id} className="flex items-center justify-between px-3 py-2 bg-neutral-800 rounded-lg">
                    <span className="text-sm text-gray-300 truncate">{doc.name}</span>
                    <span className="text-xs text-gray-500">{doc.file_type.toUpperCase()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No MCQ documents (AI will generate questions)</p>
            )}
          </div>
        </div>

        {/* Sections Preview (when ready) */}
        {lesson.status === 'ready' && sections.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiList className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">Sections</h3>
              <span className="text-sm text-gray-500">({sections.length} sections, {totalQuestions} questions)</span>
            </div>
            <div className="space-y-3">
              {sections.map((section, index) => (
                <div key={section.id} className="p-4 bg-neutral-800 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-violet-400">Section {index + 1}</span>
                        <span className="text-xs text-gray-500">
                          Pages {section.start_page} - {section.end_page}
                        </span>
                      </div>
                      <h4 className="font-medium text-white">{section.title}</h4>
                      {section.summary && (
                        <p className="text-sm text-gray-400 mt-1">{section.summary}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm text-gray-400">
                        {section.interactive_lesson_questions?.length || 0} questions
                      </span>
                      <div className="text-xs text-gray-500">
                        Pass: {section.pass_threshold}%
                      </div>
                    </div>
                  </div>
                  {section.key_points && section.key_points.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-700">
                      <p className="text-xs text-gray-500 mb-1">Key points:</p>
                      <ul className="text-sm text-gray-400 space-y-0.5">
                        {section.key_points.slice(0, 3).map((point: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-violet-400">•</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
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

