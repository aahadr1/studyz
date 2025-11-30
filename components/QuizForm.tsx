'use client'

import { useState } from 'react'
import { FiCheck, FiX, FiAlertCircle, FiRefreshCw } from 'react-icons/fi'

interface Question {
  id: string
  question: string
  choices: string[]
  correct_index: number
  explanation: string
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

interface QuizFormProps {
  questions: Question[]
  sectionTitle: string
  threshold: number
  onSubmit: (answers: Record<string, number>) => Promise<QuizResult>
  onPass: () => void
}

export default function QuizForm({
  questions,
  sectionTitle,
  threshold,
  onSubmit,
  onPass
}: QuizFormProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [showExplanations, setShowExplanations] = useState(false)

  const handleAnswerChange = (questionId: string, choiceIndex: number) => {
    if (result) return
    setAnswers(prev => ({ ...prev, [questionId]: choiceIndex }))
  }

  const handleSubmit = async () => {
    const unanswered = questions.filter(q => answers[q.id] === undefined)
    if (unanswered.length > 0) {
      alert(`Please answer all questions. ${unanswered.length} remaining.`)
      return
    }

    setSubmitting(true)
    try {
      const quizResult = await onSubmit(answers)
      setResult(quizResult)
      
      if (quizResult.passed) {
        setTimeout(() => onPass(), 1500)
      }
    } catch (error) {
      console.error('Error submitting quiz:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = () => {
    setAnswers({})
    setResult(null)
    setShowExplanations(false)
  }

  const allAnswered = questions.every(q => answers[q.id] !== undefined)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-medium text-text-primary mb-1">Quiz: {sectionTitle}</h3>
        <p className="text-sm text-text-tertiary">
          {questions.length} questions • {threshold}% to pass
        </p>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`p-4 ${result.passed ? 'bg-success-muted' : 'bg-warning-muted'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              result.passed ? 'bg-success' : 'bg-warning'
            }`}>
              {result.passed ? (
                <FiCheck className="w-4 h-4 text-white" />
              ) : (
                <FiAlertCircle className="w-4 h-4 text-white" />
              )}
            </div>
            <div>
              <p className={`font-medium ${result.passed ? 'text-success' : 'text-warning'}`}>
                {result.passed ? 'Passed!' : 'Not quite'}
              </p>
              <p className="text-sm text-text-secondary">
                {result.score}% ({result.correctCount}/{result.totalQuestions})
              </p>
            </div>
          </div>
          {!result.passed && (
            <button
              onClick={handleRetry}
              className="btn-secondary w-full mt-3 text-sm"
            >
              <FiRefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
          <button
            onClick={() => setShowExplanations(!showExplanations)}
            className="btn-ghost w-full mt-2 text-sm"
          >
            {showExplanations ? 'Hide' : 'Show'} Explanations
          </button>
        </div>
      )}

      {/* Questions */}
      <div className="flex-1 overflow-auto p-5 space-y-5">
        {questions.map((question, qIndex) => {
          const userAnswer = answers[question.id]
          const questionResult = result?.results[question.id]
          const isCorrect = questionResult?.correct
          const correctAnswer = questionResult?.correctAnswer

          return (
            <div 
              key={question.id}
              className={`p-4 rounded-lg ${
                result
                  ? isCorrect
                    ? 'bg-success-muted border border-success/20'
                    : 'bg-error-muted border border-error/20'
                  : 'bg-elevated'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  result
                    ? isCorrect
                      ? 'bg-success text-white'
                      : 'bg-error text-white'
                    : 'bg-accent text-white'
                }`}>
                  {qIndex + 1}
                </span>
                <p className="text-text-primary text-sm font-medium">{question.question}</p>
              </div>

              <div className="space-y-2 ml-9">
                {question.choices.map((choice, cIndex) => {
                  const isSelected = userAnswer === cIndex
                  const isCorrectChoice = cIndex === correctAnswer
                  const showAsCorrect = result && isCorrectChoice
                  const showAsWrong = result && isSelected && !isCorrect

                  return (
                    <label
                      key={cIndex}
                      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer text-sm transition-colors ${
                        result
                          ? showAsCorrect
                            ? 'bg-success/10 border border-success/30'
                            : showAsWrong
                            ? 'bg-error/10 border border-error/30'
                            : 'bg-surface/50 border border-transparent'
                          : isSelected
                          ? 'bg-accent-muted border border-accent/30'
                          : 'bg-surface hover:bg-subtle border border-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={isSelected}
                        onChange={() => handleAnswerChange(question.id, cIndex)}
                        disabled={!!result}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        result
                          ? showAsCorrect
                            ? 'border-success bg-success'
                            : showAsWrong
                            ? 'border-error bg-error'
                            : isSelected
                            ? 'border-border bg-border'
                            : 'border-border'
                          : isSelected
                          ? 'border-accent bg-accent'
                          : 'border-border'
                      }`}>
                        {(isSelected || showAsCorrect) && (
                          result ? (
                            showAsCorrect ? (
                              <FiCheck className="w-2.5 h-2.5 text-white" />
                            ) : showAsWrong ? (
                              <FiX className="w-2.5 h-2.5 text-white" />
                            ) : null
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )
                        )}
                      </div>
                      <span className={`${
                        showAsCorrect ? 'text-success' : showAsWrong ? 'text-error' : 'text-text-secondary'
                      }`}>
                        {choice}
                      </span>
                    </label>
                  )
                })}
              </div>

              {/* Explanation */}
              {showExplanations && result && question.explanation && (
                <div className="mt-3 ml-9 p-3 bg-surface rounded-md">
                  <p className="text-sm text-text-secondary">
                    <span className="text-accent font-medium">Explanation: </span>
                    {question.explanation}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit button */}
      {!result && (
        <div className="p-4 border-t border-border">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="spinner w-4 h-4"></div>
                Submitting...
              </>
            ) : (
              <>
                Submit Answers
                {!allAnswered && (
                  <span className="text-sm opacity-75 ml-1">
                    ({questions.length - Object.keys(answers).length} left)
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
