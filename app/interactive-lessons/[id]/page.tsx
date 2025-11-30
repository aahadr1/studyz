'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { 
  FiPlay, FiLoader, FiCheckCircle, FiAlertCircle, FiFileText, 
  FiBook, FiTrash2, FiArrowLeft, FiList,
  FiZap, FiCpu, FiHelpCircle, FiClock, FiImage
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
  processing_percent: number | null
  processing_started_at: string | null
  processing_eta_seconds: number | null
  created_at: string
  interactive_lesson_documents: Document[]
  interactive_lesson_sections: Section[]
}

// Processing steps - matches backend pipeline phases
const PROCESSING_STEPS = [
  { key: 'transcribing', label: 'Transcription IA', icon: FiCpu, description: 'Analyse par GPT-4o-mini...' },
  { key: 'analyzing', label: 'Analyse de structure', icon: FiFileText, description: 'Création de la structure...' },
  { key: 'checkpointing', label: 'Création checkpoints', icon: FiList, description: 'Organisation du cours...' },
  { key: 'complete', label: 'Terminé', icon: FiCheckCircle, description: 'Prêt !' },
]

function getStepIndex(stepKey: string | null): number {
  if (!stepKey) return 0
  const idx = PROCESSING_STEPS.findIndex(s => s.key === stepKey)
  return idx >= 0 ? idx : 0
}

function formatEta(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''
  if (seconds < 60) return `~${seconds}s restantes`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `~${mins}m ${secs}s restantes`
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
    if (lesson?.status === 'processing' || lesson?.status === 'draft') {
      const interval = setInterval(loadLesson, 1500) // Poll every 1.5 seconds for faster updates
      return () => clearInterval(interval)
    }
  }, [lesson?.status, loadLesson])

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
  const progressPercent = lesson.processing_percent ?? (
    lesson.processing_step === 'complete' ? 100 
    : Math.round(currentStepIndex / (PROCESSING_STEPS.length - 1) * 100)
  )

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
              {/* Header with percentage and ETA */}
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                  <FiZap className="w-5 h-5 text-accent" />
                  Traitement en cours
                </h2>
                <span className="text-2xl font-bold text-accent">{progressPercent}%</span>
              </div>

              {/* ETA */}
              {lesson.processing_eta_seconds && lesson.processing_eta_seconds > 0 && (
                <div className="flex items-center gap-2 text-sm text-text-tertiary mb-4">
                  <FiClock className="w-4 h-4" />
                  {formatEta(lesson.processing_eta_seconds)}
                </div>
              )}

              {/* Main Progress Bar */}
              <div className="h-4 bg-elevated rounded-full overflow-hidden mb-6 relative">
                <div 
                  className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-700 ease-out relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  {/* Animated shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>

              {/* Current Step Message - Large and centered */}
              <div className="text-center mb-8 py-4 bg-accent-muted/30 rounded-lg border border-accent/20">
                <p className="text-lg font-medium text-text-primary">
                  {lesson.processing_message || 'Initialisation...'}
                </p>
                {lesson.processing_progress !== null && lesson.processing_total !== null && lesson.processing_total > 1 && (
                  <p className="text-sm text-text-tertiary mt-1">
                    Étape {lesson.processing_progress} sur {lesson.processing_total}
                  </p>
                )}
              </div>

              {/* Steps Timeline - Horizontal on desktop */}
              <div className="hidden md:flex items-center justify-between mb-6">
                {PROCESSING_STEPS.slice(0, -1).map((step, idx) => {
                  const isComplete = idx < currentStepIndex
                  const isCurrent = lesson.processing_step === step.key
                  const Icon = step.icon
                  
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all ${
                        isComplete ? 'bg-success text-white' :
                        isCurrent ? 'bg-accent text-white ring-4 ring-accent/30' :
                        'bg-elevated text-text-tertiary'
                      }`}>
                        {isComplete ? (
                          <FiCheckCircle className="w-5 h-5" />
                        ) : isCurrent ? (
                          <FiLoader className="w-5 h-5 animate-spin" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>
                      <span className={`text-xs font-medium text-center ${
                        isCurrent ? 'text-accent' :
                        isComplete ? 'text-success' :
                        'text-text-tertiary'
                      }`}>
                        {step.label}
                      </span>
                      {/* Connector line */}
                      {idx < PROCESSING_STEPS.length - 2 && (
                        <div className={`absolute w-full h-0.5 top-5 left-1/2 -z-10 ${
                          isComplete ? 'bg-success' : 'bg-elevated'
                        }`} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Steps Timeline - Vertical on mobile */}
              <div className="md:hidden space-y-3">
                {PROCESSING_STEPS.slice(0, -1).map((step, idx) => {
                  const isComplete = idx < currentStepIndex
                  const isCurrent = lesson.processing_step === step.key
                  const Icon = step.icon
                  
                  return (
                    <div 
                      key={step.key}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        isCurrent ? 'bg-accent-muted border border-accent/30' :
                        isComplete ? 'bg-success-muted/30' :
                        'bg-elevated/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
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
                      <div>
                        <span className={`text-sm font-medium ${
                          isCurrent ? 'text-accent' :
                          isComplete ? 'text-success' :
                          'text-text-tertiary'
                        }`}>
                          {step.label}
                        </span>
                        {isCurrent && (
                          <p className="text-xs text-text-tertiary">{step.description}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-text-tertiary text-center mt-6 flex items-center justify-center gap-2">
                <FiLoader className="w-3 h-3 animate-spin" />
                Mise à jour automatique...
              </p>
            </div>
          )}

          {/* Ready Status */}
          {lesson.status === 'ready' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <FiCheckCircle className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Prêt à apprendre !</h2>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                Votre leçon interactive est prête. {sections.length} checkpoints et {totalQuestions} questions vous attendent.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={handleStartLearning}
                  className="btn-primary px-8 py-3 text-lg"
                >
                  <FiPlay className="w-5 h-5" />
                  Commencer l'apprentissage
                </button>
                <button
                  onClick={() => router.push(`/interactive-lessons/${lessonId}/simple-player`)}
                  className="btn-secondary px-8 py-3 text-lg"
                >
                  <FiBook className="w-5 h-5" />
                  Lecture simple
                </button>
              </div>
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
              <p className="text-sm text-text-tertiary max-w-md mx-auto">
                Retournez sur la page de création pour relancer le traitement avec vos documents.
              </p>
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

      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  )
}
