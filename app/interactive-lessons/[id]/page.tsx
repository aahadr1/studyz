'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { 
  FiPlay, FiLoader, FiCheckCircle, FiAlertCircle, FiFileText, 
  FiBook, FiRefreshCw, FiTrash2, FiArrowLeft, FiList,
  FiImage, FiCpu, FiEdit3, FiHelpCircle
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
  processing_step: string | null
  processing_progress: number | null
  processing_total: number | null
  processing_message: string | null
  created_at: string
  interactive_lesson_documents: Document[]
  interactive_lesson_sections: Section[]
}

// Processing steps configuration
const PROCESSING_STEPS = [
  { key: 'initializing', label: 'Initialisation', icon: FiLoader },
  { key: 'converting_pages', label: 'Conversion des pages', icon: FiImage },
  { key: 'transcribing', label: 'Transcription IA', icon: FiCpu },
  { key: 'reconstructing', label: 'Reconstruction du cours', icon: FiEdit3 },
  { key: 'checkpointing', label: 'Création des checkpoints', icon: FiList },
  { key: 'generating_mcq', label: 'Génération des questions', icon: FiHelpCircle },
  { key: 'analyzing_elements', label: 'Analyse des éléments', icon: FiFileText },
  { key: 'finalizing', label: 'Finalisation', icon: FiCheckCircle },
  { key: 'complete', label: 'Terminé', icon: FiCheckCircle },
]

function getStepIndex(stepKey: string | null): number {
  if (!stepKey) return 0
  const idx = PROCESSING_STEPS.findIndex(s => s.key === stepKey)
  return idx >= 0 ? idx : 0
}

export default function InteractiveLessonDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<InteractiveLesson | null>(null)
  const [loading, setLoading] = useState(true)
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

  // Poll for updates during processing
  useEffect(() => {
    if (lesson?.status === 'processing') {
      const interval = setInterval(loadLesson, 2000) // Poll every 2 seconds
      return () => clearInterval(interval)
    }
  }, [lesson?.status, loadLesson])

  const handleRetry = async () => {
    try {
      await fetch(`/api/interactive-lessons/${lessonId}/process`, {
        method: 'POST'
      })
      await loadLesson()
    } catch (err) {
      console.error('Error retrying:', err)
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
          <p className="text-text-tertiary text-sm">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-tertiary mb-4">Leçon non trouvée</p>
          <button 
            onClick={() => router.push('/interactive-lessons')}
            className="text-accent hover:underline"
          >
            ← Retour aux leçons
          </button>
        </div>
      </div>
    )
  }

  const lessonDocs = lesson.interactive_lesson_documents?.filter(d => d.category === 'lesson') || []
  const mcqDocs = lesson.interactive_lesson_documents?.filter(d => d.category === 'mcq') || []
  const sections = lesson.interactive_lesson_sections || []
  const totalQuestions = sections.reduce((sum, s) => sum + (s.interactive_lesson_questions?.length || 0), 0)
  const totalPages = lessonDocs.reduce((sum, d) => sum + (d.page_count || 0), 0)

  const currentStepIndex = getStepIndex(lesson.processing_step)
  const progressPercent = lesson.processing_step === 'complete' ? 100 
    : lesson.processing_total && lesson.processing_total > 0 
      ? Math.round((lesson.processing_progress || 0) / lesson.processing_total * 100)
      : Math.round(currentStepIndex / (PROCESSING_STEPS.length - 1) * 100)

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
                Commencer
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
            <span>• {lesson.mode === 'document_based' ? 'PDF' : 'MCQ-only'}</span>
            {totalPages > 0 && <span>• {totalPages} pages</span>}
          </div>
        </div>

        {/* Status Card */}
        <div className="card p-8 mb-8">
          {/* Processing Status */}
          {(lesson.status === 'processing' || lesson.status === 'draft') && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text-primary">
                  {lesson.status === 'draft' ? 'Préparation...' : 'Analyse en cours'}
                </h2>
                <span className="text-sm text-accent">{progressPercent}%</span>
              </div>

              {/* Main Progress Bar */}
              <div className="h-3 bg-elevated rounded-full overflow-hidden mb-6">
                <div 
                  className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Current Step Message */}
              <div className="text-center mb-8">
                <p className="text-text-secondary">
                  {lesson.processing_message || 'Initialisation...'}
                </p>
                {lesson.processing_progress !== null && lesson.processing_total !== null && lesson.processing_total > 1 && (
                  <p className="text-sm text-text-tertiary mt-1">
                    {lesson.processing_progress} / {lesson.processing_total}
                  </p>
                )}
              </div>

              {/* Steps Timeline */}
              <div className="space-y-3">
                {PROCESSING_STEPS.filter(s => s.key !== 'complete').map((step, idx) => {
                  const isComplete = idx < currentStepIndex || lesson.status === 'ready'
                  const isCurrent = idx === currentStepIndex && lesson.status === 'processing'
                  const isPending = idx > currentStepIndex
                  
                  const Icon = step.icon
                  
                  return (
                    <div 
                      key={step.key}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        isCurrent ? 'bg-accent-muted border border-accent/30' :
                        isComplete ? 'bg-success-muted/50' :
                        'bg-elevated/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isComplete ? 'bg-success text-white' :
                        isCurrent ? 'bg-accent text-white' :
                        'bg-elevated text-text-tertiary'
                      }`}>
                        {isComplete ? (
                          <FiCheckCircle className="w-4 h-4" />
                        ) : isCurrent ? (
                          <FiLoader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <span className={`text-sm font-medium ${
                        isCurrent ? 'text-accent' :
                        isComplete ? 'text-success' :
                        'text-text-tertiary'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-text-tertiary text-center mt-6 flex items-center justify-center gap-2">
                <FiRefreshCw className="w-3 h-3 animate-spin" />
                Mise à jour automatique...
              </p>
            </div>
          )}

          {/* Ready Status */}
          {lesson.status === 'ready' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-success-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiCheckCircle className="w-7 h-7 text-success" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Prêt à apprendre !</h2>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                Votre leçon interactive est prête. {sections.length} checkpoints et {totalQuestions} questions vous attendent.
              </p>
              <button
                onClick={handleStartLearning}
                className="btn-primary px-6"
              >
                <FiPlay className="w-4 h-4" />
                Commencer l'apprentissage
              </button>
            </div>
          )}

          {/* Error Status */}
          {lesson.status === 'error' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-error-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiAlertCircle className="w-7 h-7 text-error" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Erreur de traitement</h2>
              <p className="text-error mb-4">{lesson.error_message || 'Une erreur est survenue'}</p>
              <button
                onClick={handleRetry}
                className="btn-secondary"
              >
                <FiRefreshCw className="w-4 h-4" />
                Réessayer
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
              <h3 className="font-medium text-text-primary">Documents</h3>
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
              <p className="text-sm text-text-tertiary">Aucun document</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiFileText className="w-4 h-4 text-text-secondary" />
              <h3 className="font-medium text-text-primary">MCQ</h3>
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
              <p className="text-sm text-text-tertiary">Questions générées par l'IA</p>
            )}
          </div>
        </div>

        {/* Sections Preview */}
        {lesson.status === 'ready' && sections.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiList className="w-4 h-4 text-success" />
              <h3 className="font-medium text-text-primary">Checkpoints</h3>
              <span className="text-sm text-text-tertiary">({sections.length} sections, {totalQuestions} questions)</span>
            </div>
            <div className="space-y-3">
              {sections.map((section, index) => (
                <div key={section.id} className="p-4 bg-elevated rounded-md">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-medium text-accent">Checkpoint {index + 1}</span>
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
