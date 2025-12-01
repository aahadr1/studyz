'use client'

import { useState, useEffect, useRef } from 'react'
import { FiCheck, FiX, FiArrowRight, FiArrowLeft, FiBook, FiChevronRight, FiChevronLeft } from 'react-icons/fi'

export interface MCQQuestion {
  id?: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
  section_id?: string
}

export interface LessonSection {
  id: string
  title: string
  content: string
  questionIds: string[]
}

export interface Lesson {
  title: string
  introduction: string
  sections: LessonSection[]
  conclusion: string
}

interface MCQViewerProps {
  questions: MCQQuestion[]
  lesson?: Lesson | null
}

export default function MCQViewer({ questions, lesson }: MCQViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [hasChecked, setHasChecked] = useState(false)
  const [showLesson, setShowLesson] = useState(!!lesson)
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})

  const currentQuestion = questions[currentIndex]
  const isCorrect = selectedOption === currentQuestion?.correctOption

  // Find the section for the current question
  const currentSection = lesson?.sections.find(s => 
    s.questionIds.includes(currentQuestion?.id || '')
  )

  // Auto-scroll to the relevant section when question changes
  useEffect(() => {
    if (currentSection && sectionRefs.current[currentSection.id]) {
      sectionRefs.current[currentSection.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }
  }, [currentIndex, currentSection])

  if (!questions || questions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-secondary">No questions found.</p>
      </div>
    )
  }

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

  const scrollToSection = (sectionId: string) => {
    if (sectionRefs.current[sectionId]) {
      sectionRefs.current[sectionId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }
  }

  return (
    <div className="flex gap-6">
      {/* Main MCQ Area */}
      <div className={`flex-1 ${lesson && showLesson ? 'max-w-2xl' : 'max-w-3xl mx-auto'}`}>
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-text-secondary">
                {Math.round(((currentIndex + 1) / questions.length) * 100)}% Complete
              </span>
              {lesson && (
                <button
                  onClick={() => setShowLesson(!showLesson)}
                  className={`flex items-center gap-1 text-sm px-3 py-1 rounded-lg transition-colors ${
                    showLesson 
                      ? 'bg-accent text-white' 
                      : 'bg-elevated text-text-secondary hover:bg-accent-muted hover:text-accent'
                  }`}
                >
                  <FiBook className="w-4 h-4" />
                  {showLesson ? 'Hide' : 'Show'} Lesson
                </button>
              )}
            </div>
          </div>
          <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
            <div
              className="bg-accent h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Current Section Indicator */}
        {lesson && currentSection && showLesson && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <FiBook className="w-4 h-4" />
              <span>Related lesson section:</span>
              <button
                onClick={() => scrollToSection(currentSection.id)}
                className="font-medium underline hover:no-underline"
              >
                {currentSection.title}
              </button>
            </div>
          </div>
        )}

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
                optionClasses += isSelected
                  ? 'border-accent bg-accent-muted text-text-primary'
                  : 'border-border bg-elevated text-text-primary hover:border-accent-muted'
              } else {
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
                  {!isCorrect && lesson && currentSection && (
                    <button
                      onClick={() => scrollToSection(currentSection.id)}
                      className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <FiBook className="w-4 h-4" />
                      Review this topic in the lesson
                    </button>
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

      {/* Lesson Sidebar */}
      {lesson && showLesson && (
        <div className="w-96 flex-shrink-0">
          <div className="sticky top-4">
            <div className="card max-h-[calc(100vh-8rem)] overflow-y-auto">
              {/* Lesson Header */}
              <div className="p-4 border-b border-border sticky top-0 bg-sidebar z-10">
                <h3 className="font-semibold text-text-primary flex items-center gap-2">
                  <FiBook className="w-5 h-5 text-accent" />
                  {lesson.title}
                </h3>
              </div>

              <div className="p-4 space-y-6">
                {/* Introduction */}
                <div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {lesson.introduction}
                  </p>
                </div>

                {/* Sections */}
                {lesson.sections.map((section) => {
                  const isCurrentSection = section.id === currentSection?.id
                  
                  return (
                    <div
                      key={section.id}
                      ref={(el) => { sectionRefs.current[section.id] = el }}
                      className={`p-4 rounded-lg transition-all ${
                        isCurrentSection 
                          ? 'bg-accent-muted border-2 border-accent' 
                          : 'bg-elevated'
                      }`}
                    >
                      <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                        isCurrentSection ? 'text-accent' : 'text-text-primary'
                      }`}>
                        {isCurrentSection && <FiChevronRight className="w-4 h-4" />}
                        {section.title}
                      </h4>
                      <div className="text-sm text-text-secondary leading-relaxed prose prose-sm max-w-none">
                        {section.content.split('\n').map((paragraph, i) => (
                          <p key={i} className="mb-2">{paragraph}</p>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-text-tertiary">
                        Covers question{section.questionIds.length > 1 ? 's' : ''}: {
                          section.questionIds.map(qId => {
                            const qIndex = questions.findIndex(q => q.id === qId)
                            return qIndex >= 0 ? qIndex + 1 : '?'
                          }).join(', ')
                        }
                      </div>
                    </div>
                  )
                })}

                {/* Conclusion */}
                <div className="p-4 bg-elevated rounded-lg">
                  <h4 className="font-semibold text-text-primary mb-2">Summary</h4>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {lesson.conclusion}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
