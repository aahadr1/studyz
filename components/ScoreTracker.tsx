'use client'

import { FiCheck, FiX, FiClock, FiTrendingUp, FiAward } from 'react-icons/fi'

interface ScoreTrackerProps {
  totalQuestions: number
  currentQuestion: number
  correctAnswers: number
  incorrectAnswers: number
  totalTimeSeconds: number
  mode: 'study' | 'test' | 'challenge' | 'review'
  isComplete: boolean
}

export default function ScoreTracker({
  totalQuestions,
  currentQuestion,
  correctAnswers,
  incorrectAnswers,
  totalTimeSeconds,
  mode,
  isComplete
}: ScoreTrackerProps) {
  const answeredQuestions = correctAnswers + incorrectAnswers
  const accuracy = answeredQuestions > 0 
    ? Math.round((correctAnswers / answeredQuestions) * 100) 
    : 0

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getAccuracyColor = () => {
    if (accuracy >= 80) return 'text-success'
    if (accuracy >= 60) return 'text-warning'
    return 'text-error'
  }

  const getModeLabel = () => {
    switch (mode) {
      case 'study': return 'Study'
      case 'test': return 'Test'
      case 'challenge': return 'Challenge'
      case 'review': return 'Review'
      default: return 'Practice'
    }
  }

  const getModeClasses = () => {
    switch (mode) {
      case 'study': return 'border-mode-study text-mode-study'
      case 'test': return 'border-mode-test text-mode-test'
      case 'challenge': return 'border-mode-challenge text-mode-challenge'
      case 'review': return 'border-mode-review text-mode-review'
      default: return 'border-border text-text-secondary'
    }
  }

  if (isComplete) {
    return (
      <div className="border border-border p-6">
        <div className="text-center mb-6">
          <div className="w-12 h-12 border border-border mx-auto mb-4 flex items-center justify-center">
            <FiAward className={`w-6 h-6 ${getAccuracyColor()}`} strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">Complete</h3>
          <p className="text-xs text-text-tertiary uppercase tracking-wider">Session finished</p>
        </div>
        
        <div className="grid grid-cols-2 gap-px bg-border mb-6">
          <div className="bg-background p-4 text-center">
            <div className={`text-3xl font-semibold mono ${getAccuracyColor()}`}>
              {accuracy}%
            </div>
            <div className="text-xs text-text-tertiary uppercase tracking-wider mt-1">Accuracy</div>
          </div>
          <div className="bg-background p-4 text-center">
            <div className="text-3xl font-semibold mono text-text-primary">
              {formatTime(totalTimeSeconds)}
            </div>
            <div className="text-xs text-text-tertiary uppercase tracking-wider mt-1">Time</div>
          </div>
        </div>

        <div className="flex justify-center gap-8 text-sm">
          <div className="flex items-center gap-2 text-success">
            <FiCheck className="w-4 h-4" strokeWidth={2} />
            <span className="mono">{correctAnswers}</span>
            <span className="text-text-tertiary">correct</span>
          </div>
          <div className="flex items-center gap-2 text-error">
            <FiX className="w-4 h-4" strokeWidth={2} />
            <span className="mono">{incorrectAnswers}</span>
            <span className="text-text-tertiary">wrong</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 p-3 border border-border">
      {/* Mode Badge */}
      <span className={`px-2.5 py-1 border text-xs font-medium uppercase tracking-wider ${getModeClasses()}`}>
        {getModeLabel()}
      </span>

      {/* Stats */}
      <div className="flex items-center gap-6">
        {/* Correct/Incorrect */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-success">
            <FiCheck className="w-4 h-4" strokeWidth={2} />
            <span className="text-sm font-medium mono">{correctAnswers}</span>
          </div>
          <div className="flex items-center gap-1.5 text-error">
            <FiX className="w-4 h-4" strokeWidth={2} />
            <span className="text-sm font-medium mono">{incorrectAnswers}</span>
          </div>
        </div>

        {/* Accuracy */}
        {answeredQuestions > 0 && (
          <div className="flex items-center gap-1.5">
            <FiTrendingUp className={`w-4 h-4 ${getAccuracyColor()}`} strokeWidth={1.5} />
            <span className={`text-sm font-medium mono ${getAccuracyColor()}`}>
              {accuracy}%
            </span>
          </div>
        )}

        {/* Time */}
        <div className="flex items-center gap-1.5 text-text-tertiary">
          <FiClock className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-sm font-medium mono">{formatTime(totalTimeSeconds)}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="text-sm text-text-secondary mono">
        {currentQuestion}/{totalQuestions}
      </div>
    </div>
  )
}
