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
    if (result) return // Don't allow changes after submission
    setAnswers(prev => ({ ...prev, [questionId]: choiceIndex }))
  }

  const handleSubmit = async () => {
    // Check if all questions are answered
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
        // Small delay before triggering pass callback
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
      <div className="p-4 border-b border-neutral-700 bg-neutral-800">
        <h3 className="font-semibold text-white mb-1">Quiz: {sectionTitle}</h3>
        <p className="text-sm text-gray-400">
          Answer all {questions.length} questions. You need {threshold}% to pass.
        </p>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`p-4 ${result.passed ? 'bg-emerald-900/30' : 'bg-amber-900/30'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              result.passed ? 'bg-emerald-500' : 'bg-amber-500'
            }`}>
              {result.passed ? (
                <FiCheck className="w-5 h-5 text-white" />
              ) : (
                <FiAlertCircle className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <p className={`font-semibold ${result.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                {result.passed ? 'Congratulations! You passed!' : 'Not quite there yet'}
              </p>
              <p className="text-sm text-gray-300">
                Score: {result.score}% ({result.correctCount}/{result.totalQuestions} correct)
                {result.attempts > 1 && ` • Attempt ${result.attempts}`}
              </p>
            </div>
          </div>
          {!result.passed && (
            <button
              onClick={handleRetry}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition"
            >
              <FiRefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
          {result && (
            <button
              onClick={() => setShowExplanations(!showExplanations)}
              className="mt-2 w-full px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition text-sm"
            >
              {showExplanations ? 'Hide Explanations' : 'Show Explanations'}
            </button>
          )}
        </div>
      )}

      {/* Questions */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
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
                    ? 'bg-emerald-900/20 border border-emerald-800'
                    : 'bg-red-900/20 border border-red-800'
                  : 'bg-neutral-800'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  result
                    ? isCorrect
                      ? 'bg-emerald-500 text-white'
                      : 'bg-red-500 text-white'
                    : 'bg-violet-500 text-white'
                }`}>
                  {qIndex + 1}
                </span>
                <p className="text-white font-medium">{question.question}</p>
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
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${
                        result
                          ? showAsCorrect
                            ? 'bg-emerald-900/30 border border-emerald-700'
                            : showAsWrong
                            ? 'bg-red-900/30 border border-red-700'
                            : 'bg-neutral-700/30 border border-transparent'
                          : isSelected
                          ? 'bg-violet-900/30 border border-violet-600'
                          : 'bg-neutral-700/50 border border-transparent hover:bg-neutral-700'
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
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        result
                          ? showAsCorrect
                            ? 'border-emerald-500 bg-emerald-500'
                            : showAsWrong
                            ? 'border-red-500 bg-red-500'
                            : isSelected
                            ? 'border-gray-500 bg-gray-500'
                            : 'border-gray-600'
                          : isSelected
                          ? 'border-violet-500 bg-violet-500'
                          : 'border-gray-500'
                      }`}>
                        {(isSelected || showAsCorrect) && (
                          result ? (
                            showAsCorrect ? (
                              <FiCheck className="w-3 h-3 text-white" />
                            ) : showAsWrong ? (
                              <FiX className="w-3 h-3 text-white" />
                            ) : null
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )
                        )}
                      </div>
                      <span className={`text-sm ${
                        showAsCorrect ? 'text-emerald-300' : showAsWrong ? 'text-red-300' : 'text-gray-300'
                      }`}>
                        {choice}
                      </span>
                    </label>
                  )
                })}
              </div>

              {/* Explanation */}
              {showExplanations && result && question.explanation && (
                <div className="mt-3 ml-9 p-3 bg-neutral-700/30 rounded-lg">
                  <p className="text-sm text-gray-300">
                    <span className="text-violet-400 font-medium">Explanation: </span>
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
        <div className="p-4 border-t border-neutral-700 bg-neutral-800">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Submit Answers
                {!allAnswered && (
                  <span className="text-sm opacity-75">
                    ({questions.length - Object.keys(answers).length} remaining)
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

