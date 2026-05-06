'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { FiCheck, FiX, FiChevronLeft, FiChevronRight, FiList, FiRefreshCw } from 'react-icons/fi'
import Link from 'next/link'
import type { PageMCQWithProgress } from '@/types/db'

interface MCQInterfaceProps {
  lessonId: string
  currentPage: number
  onMcqsChange?: (hasMcqs: boolean) => void
}

export default function MCQInterface({ lessonId, currentPage, onMcqsChange }: MCQInterfaceProps) {
  const [mcqs, setMcqs] = useState<PageMCQWithProgress[]>([])
  const [currentMcqIndex, setCurrentMcqIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [stats, setStats] = useState({ total: 0, answered: 0, correct: 0, remaining: 0 })

  const goToMcqIndex = (nextIndex: number, nextMcqs?: PageMCQWithProgress[]) => {
    const list = nextMcqs || mcqs
    if (nextIndex < 0 || nextIndex >= list.length) return

    setCurrentMcqIndex(nextIndex)
    const nextMcq = list[nextIndex]
    if (nextMcq?.progress) {
      setSelectedAnswer(nextMcq.progress.selected_index)
      setIsCorrect(nextMcq.progress.is_correct)
      setShowResult(true)
    } else {
      setSelectedAnswer(null)
      setShowResult(false)
      setIsCorrect(false)
    }
  }

  const loadMcqs = useCallback(async () => {
    setLoading(true)
    setSelectedAnswer(null)
    setShowResult(false)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs/page/${currentPage}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        const loadedMcqs = data.mcqs || []
        const initialIndex = data.currentMcqIndex || 0
        setMcqs(loadedMcqs)
        setCurrentMcqIndex(initialIndex)
        setStats(data.stats || { total: 0, answered: 0, correct: 0, remaining: 0 })
        onMcqsChange?.(loadedMcqs.length > 0)

        // If current MCQ is already answered, show result
        goToMcqIndex(initialIndex, loadedMcqs)
      }
    } catch (error) {
      console.error('Error loading MCQs:', error)
    } finally {
      setLoading(false)
    }
  }, [lessonId, currentPage, onMcqsChange])

  useEffect(() => {
    loadMcqs()
  }, [loadMcqs])

  const handleSubmitAnswer = async () => {
    if (selectedAnswer === null || submitting) return

    const currentMcq = mcqs[currentMcqIndex]
    if (!currentMcq) return

    setSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs/answer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mcq_id: currentMcq.id,
          selected_index: selectedAnswer,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setIsCorrect(result.is_correct)
        setShowResult(true)

        // Update local state
        const updatedMcqs = mcqs.map((mcq, idx) => 
          idx === currentMcqIndex
            ? { ...mcq, progress: {
                id: '', 
                user_id: '', 
                mcq_id: mcq.id, 
                is_correct: result.is_correct, 
                selected_index: selectedAnswer,
                answered_at: new Date().toISOString()
              }}
            : mcq
        )
        setMcqs(updatedMcqs)

        setStats(prev => ({
          ...prev,
          answered: prev.answered + 1,
          correct: result.is_correct ? prev.correct + 1 : prev.correct,
          remaining: prev.remaining - 1
        }))
      }
    } catch (error) {
      console.error('Error submitting answer:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleNextQuestion = () => {
    goToMcqIndex(currentMcqIndex + 1)
  }

  const handlePreviousQuestion = () => {
    goToMcqIndex(currentMcqIndex - 1)
  }

  const handleRetry = () => {
    setSelectedAnswer(null)
    setShowResult(false)
  }

  // No MCQs for this page
  if (!loading && mcqs.length === 0) {
    return (
      <div className="border-t border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-tertiary">
            No MCQs for this page
          </p>
          <Link 
            href={`/interactive-lessons/${lessonId}/mcqs`}
            className="btn-secondary text-sm"
          >
            <FiList className="w-4 h-4" />
            View all MCQs
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="border-t border-border bg-surface p-4 flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  const currentMcq = mcqs[currentMcqIndex]
  if (!currentMcq) return null

  return (
    <div className="border-t border-border bg-surface h-full flex flex-col min-h-0">
      {/* Progress bar */}
      <div className="h-1 bg-border">
        <div 
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${stats.total > 0 ? (stats.answered / stats.total) * 100 : 0}%` }}
        />
      </div>

      <div className="p-4 flex-1 min-h-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary mono">
              Question {currentMcqIndex + 1}/{mcqs.length}
            </span>
            <span className="text-xs text-text-tertiary">•</span>
            <span className="text-xs text-text-tertiary">
              {stats.correct}/{stats.answered} correct
            </span>
          </div>
          <Link 
            href={`/interactive-lessons/${lessonId}/mcqs`}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            View all →
          </Link>
        </div>

        {/* Scrollable content (keeps actions always visible in fixed-height bottom panel) */}
        <div className="flex-1 min-h-0 overflow-auto pr-1">
          {/* Question */}
          <p className="text-sm font-medium text-text-primary mb-3">
            {currentMcq.question}
          </p>

          {/* Choices */}
          <div className="space-y-2 mb-4">
            {currentMcq.choices.map((choice, index) => {
              const isSelected = selectedAnswer === index
              const isCorrectAnswer = index === currentMcq.correct_index
              
              let className = "w-full p-3 text-left text-sm border transition-all "
              
              if (showResult) {
                if (isCorrectAnswer) {
                  className += "border-success bg-success/10 text-success"
                } else if (isSelected && !isCorrect) {
                  className += "border-error bg-error/10 text-error"
                } else {
                  className += "border-border text-text-secondary opacity-50"
                }
              } else {
                if (isSelected) {
                  className += "border-accent bg-accent/10 text-text-primary"
                } else {
                  className += "border-border hover:border-text-tertiary text-text-secondary hover:text-text-primary"
                }
              }

              return (
                <button
                  key={index}
                  onClick={() => !showResult && setSelectedAnswer(index)}
                  disabled={showResult}
                  className={className}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center border border-current rounded text-xs font-medium">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="flex-1">{choice.replace(/^[A-D]\.\s*/, '')}</span>
                    {showResult && isCorrectAnswer && (
                      <FiCheck className="w-4 h-4 text-success" />
                    )}
                    {showResult && isSelected && !isCorrect && (
                      <FiX className="w-4 h-4 text-error" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Result and explanation */}
          {showResult && (
            <div className={`p-3 rounded mb-4 ${isCorrect ? 'bg-success/10 border border-success/20' : 'bg-error/10 border border-error/20'}`}>
              <p className={`text-sm font-medium mb-1 ${isCorrect ? 'text-success' : 'text-error'}`}>
                {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
              </p>
              {currentMcq.explanation && (
                <p className="text-sm text-text-secondary">
                  {currentMcq.explanation}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between flex-shrink-0">
          <button
            onClick={handlePreviousQuestion}
            disabled={currentMcqIndex === 0}
            className="btn-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <FiChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            {!showResult ? (
              <button
                onClick={handleSubmitAnswer}
                disabled={selectedAnswer === null || submitting}
                className="btn-primary disabled:opacity-50"
              >
                {submitting ? (
                  <div className="spinner w-4 h-4" />
                ) : (
                  'Submit Answer'
                )}
              </button>
            ) : (
              !isCorrect && !currentMcq.progress && (
                <button onClick={handleRetry} className="btn-secondary">
                  <FiRefreshCw className="w-4 h-4" />
                  Retry
                </button>
              )
            )}

            <button
              onClick={handleNextQuestion}
              disabled={!showResult || currentMcqIndex >= mcqs.length - 1}
              className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-xs text-text-tertiary">
            {stats.remaining} remaining on this page
          </span>
        </div>
      </div>
    </div>
  )
}

