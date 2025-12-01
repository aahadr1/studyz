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
    if (accuracy >= 80) return 'text-green-600'
    if (accuracy >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getAccuracyBg = () => {
    if (accuracy >= 80) return 'bg-green-50 border-green-200'
    if (accuracy >= 60) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  const getModeLabel = () => {
    switch (mode) {
      case 'study': return 'Study Mode'
      case 'test': return 'Test Mode'
      case 'challenge': return 'Challenge Mode'
      case 'review': return 'Review Mode'
      default: return 'Practice'
    }
  }

  const getModeColor = () => {
    switch (mode) {
      case 'study': return 'bg-blue-100 text-blue-800'
      case 'test': return 'bg-purple-100 text-purple-800'
      case 'challenge': return 'bg-red-100 text-red-800'
      case 'review': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (isComplete) {
    return (
      <div className={`p-6 rounded-lg border ${getAccuracyBg()}`}>
        <div className="text-center mb-4">
          <FiAward className={`w-12 h-12 mx-auto mb-2 ${getAccuracyColor()}`} />
          <h3 className="text-xl font-bold text-text-primary">Session Complete!</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-white rounded-lg">
            <div className={`text-3xl font-bold ${getAccuracyColor()}`}>
              {accuracy}%
            </div>
            <div className="text-xs text-text-tertiary">Accuracy</div>
          </div>
          <div className="text-center p-3 bg-white rounded-lg">
            <div className="text-3xl font-bold text-text-primary">
              {formatTime(totalTimeSeconds)}
            </div>
            <div className="text-xs text-text-tertiary">Time</div>
          </div>
        </div>

        <div className="flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-1 text-green-600">
            <FiCheck className="w-4 h-4" />
            <span>{correctAnswers} correct</span>
          </div>
          <div className="flex items-center gap-1 text-red-600">
            <FiX className="w-4 h-4" />
            <span>{incorrectAnswers} incorrect</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-elevated rounded-lg">
      {/* Mode Badge */}
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getModeColor()}`}>
        {getModeLabel()}
      </span>

      {/* Stats */}
      <div className="flex items-center gap-4">
        {/* Correct/Incorrect */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-green-600">
            <FiCheck className="w-4 h-4" />
            <span className="text-sm font-medium">{correctAnswers}</span>
          </div>
          <div className="flex items-center gap-1 text-red-600">
            <FiX className="w-4 h-4" />
            <span className="text-sm font-medium">{incorrectAnswers}</span>
          </div>
        </div>

        {/* Accuracy */}
        {answeredQuestions > 0 && (
          <div className="flex items-center gap-1">
            <FiTrendingUp className={`w-4 h-4 ${getAccuracyColor()}`} />
            <span className={`text-sm font-medium ${getAccuracyColor()}`}>
              {accuracy}%
            </span>
          </div>
        )}

        {/* Time */}
        <div className="flex items-center gap-1 text-text-tertiary">
          <FiClock className="w-4 h-4" />
          <span className="text-sm font-medium">{formatTime(totalTimeSeconds)}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="text-sm text-text-secondary">
        {currentQuestion}/{totalQuestions}
      </div>
    </div>
  )
}

