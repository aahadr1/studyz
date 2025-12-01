'use client'

import { useState } from 'react'
import { FiCheck, FiX, FiArrowRight, FiArrowLeft } from 'react-icons/fi'

export interface MCQQuestion {
  id?: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
}

interface MCQViewerProps {
  questions: MCQQuestion[]
}

export default function MCQViewer({ questions }: MCQViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [hasChecked, setHasChecked] = useState(false)

  if (!questions || questions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-secondary">No questions found.</p>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const isCorrect = selectedOption === currentQuestion.correctOption

  const handleCheck = () => {
    if (selectedOption) {
      setHasChecked(true)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedOption(null)
      setHasChecked(false)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setSelectedOption(null)
      setHasChecked(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-secondary">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-sm text-text-secondary">
            {Math.round(((currentIndex + 1) / questions.length) * 100)}% Complete
          </span>
        </div>
        <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
          <div
            className="bg-accent h-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-xl font-semibold text-text-primary mb-6">
          {currentQuestion.question}
        </h2>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option) => {
            const isSelected = selectedOption === option.label
            const showResult = hasChecked
            const isCorrectOption = option.label === currentQuestion.correctOption

            let optionClasses = 'w-full text-left p-4 rounded-lg border-2 transition-all '
            
            if (!showResult) {
              // Before checking
              optionClasses += isSelected
                ? 'border-accent bg-accent-muted text-text-primary'
                : 'border-border bg-elevated text-text-primary hover:border-accent-muted'
            } else {
              // After checking
              if (isCorrectOption) {
                optionClasses += 'border-green-500 bg-green-50 text-green-900'
              } else if (isSelected && !isCorrect) {
                optionClasses += 'border-red-500 bg-red-50 text-red-900'
              } else {
                optionClasses += 'border-border bg-elevated text-text-secondary'
              }
            }

            return (
              <button
                key={option.label}
                onClick={() => !hasChecked && setSelectedOption(option.label)}
                disabled={hasChecked}
                className={optionClasses}
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-background flex items-center justify-center font-semibold">
                    {option.label}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  {showResult && isCorrectOption && (
                    <FiCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
                  )}
                  {showResult && isSelected && !isCorrect && (
                    <FiX className="w-5 h-5 text-red-600 flex-shrink-0" />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Feedback after checking */}
        {hasChecked && (
          <div className={`mt-6 p-4 rounded-lg ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-start gap-3">
              {isCorrect ? (
                <FiCheck className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <FiX className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-semibold mb-1 ${isCorrect ? 'text-green-900' : 'text-red-900'}`}>
                  {isCorrect ? 'Correct!' : 'Incorrect'}
                </p>
                {!isCorrect && (
                  <p className="text-sm text-red-800 mb-2">
                    The correct answer is: {currentQuestion.correctOption}
                  </p>
                )}
                {currentQuestion.explanation && (
                  <p className={`text-sm ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                    {currentQuestion.explanation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiArrowLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="flex gap-3">
          {!hasChecked && (
            <button
              onClick={handleCheck}
              disabled={!selectedOption}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiCheck className="w-4 h-4" />
              Check Answer
            </button>
          )}

          {hasChecked && currentIndex < questions.length - 1 && (
            <button onClick={handleNext} className="btn-primary">
              Next Question
              <FiArrowRight className="w-4 h-4" />
            </button>
          )}

          {hasChecked && currentIndex === questions.length - 1 && (
            <div className="px-4 py-2 bg-accent-muted text-accent rounded-lg font-medium">
              Quiz Complete! 🎉
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

