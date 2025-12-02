'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiPlus, FiTrash2, FiCheckSquare, FiCheck, FiX } from 'react-icons/fi'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface MCQ {
  id: string
  page_number: number
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
  source_type: string
  question_order: number
  progress?: {
    is_correct: boolean
    selected_index: number
  }
}

interface LessonInfo {
  id: string
  name: string
  mcq_status: string
  mcq_generation_progress: number
  mcq_total_count: number
}

export default function MCQsListPage() {
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<LessonInfo | null>(null)
  const [mcqsByPage, setMcqsByPage] = useState<Record<number, MCQ[]>>({})
  const [stats, setStats] = useState({ total: 0, answered: 0, correct: 0, accuracy: 0 })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadMcqs()
  }, [lessonId])

  const loadMcqs = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setLesson(data.lesson)
        setMcqsByPage(data.mcqsByPage || {})
        setStats(data.stats || { total: 0, answered: 0, correct: 0, accuracy: 0 })
      } else {
        window.location.href = '/interactive-lessons'
      }
    } catch (error) {
      console.error('Error loading MCQs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete all MCQs? This action cannot be undone.')) return

    setDeleting(true)
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        setMcqsByPage({})
        setStats({ total: 0, answered: 0, correct: 0, accuracy: 0 })
        if (lesson) {
          setLesson({ ...lesson, mcq_status: 'none', mcq_total_count: 0 })
        }
      }
    } catch (error) {
      console.error('Error deleting MCQs:', error)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  const pageNumbers = Object.keys(mcqsByPage).map(Number).sort((a, b) => a - b)
  const hasMcqs = stats.total > 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 gap-4">
        <Link href={`/interactive-lessons/${lessonId}`} className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text-primary">MCQs</h1>
          <p className="text-xs text-text-tertiary">{lesson?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasMcqs && (
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="btn-ghost text-error"
            >
              {deleting ? <div className="spinner w-4 h-4" /> : <FiTrash2 className="w-4 h-4" />}
              Delete All
            </button>
          )}
          <Link href={`/interactive-lessons/${lessonId}/mcqs/generate`} className="btn-primary">
            <FiPlus className="w-4 h-4" />
            {hasMcqs ? 'Add MCQs' : 'Generate MCQs'}
          </Link>
        </div>
      </header>

      <div className="p-8 max-w-4xl mx-auto">
        {/* Stats */}
        {hasMcqs && (
          <div className="grid grid-cols-4 border border-border mb-8">
            <div className="p-4 border-r border-border">
              <span className="block text-2xl font-semibold mono">{stats.total}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Total MCQs</span>
            </div>
            <div className="p-4 border-r border-border">
              <span className="block text-2xl font-semibold mono">{stats.answered}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Answered</span>
            </div>
            <div className="p-4 border-r border-border">
              <span className="block text-2xl font-semibold mono">{stats.correct}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Correct</span>
            </div>
            <div className="p-4">
              <span className="block text-2xl font-semibold mono">{stats.accuracy}%</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Accuracy</span>
            </div>
          </div>
        )}

        {/* Generation in progress */}
        {lesson?.mcq_status === 'generating' && (
          <div className="border border-border p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="spinner" />
              <span className="text-text-primary">Generating MCQs...</span>
            </div>
            <div className="w-full bg-border rounded-full h-2">
              <div 
                className="bg-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${lesson.mcq_generation_progress || 0}%` }}
              />
            </div>
            <p className="text-xs text-text-tertiary mt-2">
              {lesson.mcq_generation_progress || 0}% complete
            </p>
          </div>
        )}

        {/* No MCQs */}
        {!hasMcqs && lesson?.mcq_status !== 'generating' && (
          <div className="border border-border p-10 text-center">
            <div className="w-12 h-12 border border-border flex items-center justify-center mx-auto mb-4 text-text-tertiary">
              <FiCheckSquare className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-text-primary mb-2">No MCQs yet</h3>
            <p className="text-sm text-text-secondary mb-6 max-w-sm mx-auto">
              Generate MCQs from your lesson pages or upload your own questions to start practicing.
            </p>
            <Link href={`/interactive-lessons/${lessonId}/mcqs/generate`} className="btn-primary inline-flex">
              <FiPlus className="w-4 h-4" />
              Generate MCQs
            </Link>
          </div>
        )}

        {/* MCQs by page */}
        {hasMcqs && (
          <div className="space-y-6">
            {pageNumbers.map(pageNum => {
              const pageMcqs = mcqsByPage[pageNum] || []
              const pageAnswered = pageMcqs.filter(m => m.progress).length
              const pageCorrect = pageMcqs.filter(m => m.progress?.is_correct).length

              return (
                <div key={pageNum} className="border border-border">
                  <div className="bg-elevated px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-text-primary">Page {pageNum}</span>
                      <span className="text-xs text-text-tertiary mono">
                        {pageMcqs.length} questions
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-tertiary">
                        {pageCorrect}/{pageAnswered} correct
                      </span>
                      <Link
                        href={`/interactive-lessons/${lessonId}?page=${pageNum}`}
                        className="text-xs text-accent hover:underline"
                      >
                        Go to page →
                      </Link>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {pageMcqs.map((mcq, idx) => (
                      <div key={mcq.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium flex-shrink-0 ${
                            mcq.progress?.is_correct 
                              ? 'bg-success/20 text-success' 
                              : mcq.progress 
                                ? 'bg-error/20 text-error' 
                                : 'bg-surface text-text-tertiary border border-border'
                          }`}>
                            {mcq.progress?.is_correct ? (
                              <FiCheck className="w-3 h-3" />
                            ) : mcq.progress ? (
                              <FiX className="w-3 h-3" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary mb-2">{mcq.question}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {mcq.choices.map((choice, cIdx) => (
                                <div 
                                  key={cIdx}
                                  className={`text-xs p-2 rounded ${
                                    cIdx === mcq.correct_index 
                                      ? 'bg-success/10 text-success border border-success/20'
                                      : mcq.progress?.selected_index === cIdx && !mcq.progress.is_correct
                                        ? 'bg-error/10 text-error border border-error/20'
                                        : 'bg-surface text-text-secondary'
                                  }`}
                                >
                                  {choice}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

