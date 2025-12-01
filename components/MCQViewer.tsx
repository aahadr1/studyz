'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { FiCheck, FiX, FiArrowRight, FiArrowLeft, FiBook, FiChevronDown, FiChevronUp, FiCommand } from 'react-icons/fi'
import LessonCard, { LessonCardData } from './LessonCard'
import ScoreTracker from './ScoreTracker'
import MCQModeSelector, { MCQMode } from './MCQModeSelector'

export interface MCQQuestion {
  id?: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
  section_id?: string
  lesson_card?: LessonCardData
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
  onSessionComplete?: (stats: SessionStats) => void
  initialMode?: MCQMode
}

interface SessionStats {
  totalQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  totalTimeSeconds: number
  answeredQuestions: Set<string>
  incorrectQuestionIds: Set<string>
}

export default function MCQViewer({ 
  questions, 
  lesson,
  onSessionComplete,
  initialMode = 'test'
}: MCQViewerProps) {
  // Core state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [hasChecked, setHasChecked] = useState(false)
  const [mode, setMode] = useState<MCQMode>(initialMode)
  
  // Lesson sidebar state
  const [showLessonSidebar, setShowLessonSidebar] = useState(true)
  const [expandedCardIndex, setExpandedCardIndex] = useState<number | null>(null)
  
  // Score tracking state
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [incorrectAnswers, setIncorrectAnswers] = useState(0)
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(0)
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [incorrectQuestionIds, setIncorrectQuestionIds] = useState<Set<string>>(new Set())
  const [isComplete, setIsComplete] = useState(false)
  
  // Challenge mode timer
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(30)
  
  // Refs
  const cardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Get questions based on mode
  const getActiveQuestions = useCallback(() => {
    if (mode === 'review') {
      return questions.filter(q => incorrectQuestionIds.has(q.id || ''))
    }
    return questions
  }, [mode, questions, incorrectQuestionIds])

  const activeQuestions = getActiveQuestions()
  const currentQuestion = activeQuestions[currentIndex]
  const isCorrect = selectedOption === currentQuestion?.correctOption
  const hasLessonCards = questions.some(q => q.lesson_card)

  // Timer for tracking time and challenge mode
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTotalTimeSeconds(prev => prev + 1)
      
      if (mode === 'challenge' && !hasChecked) {
        setChallengeTimeLeft(prev => {
          if (prev <= 1) {
            // Auto-submit when time runs out
            handleCheck()
            return 30
          }
          return prev - 1
        })
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [mode, hasChecked])

  // Reset challenge timer on new question
  useEffect(() => {
    if (mode === 'challenge') {
      setChallengeTimeLeft(30)
    }
    setQuestionStartTime(Date.now())
  }, [currentIndex, mode])

  // Auto-expand current lesson card
  useEffect(() => {
    if (hasLessonCards) {
      // Find the index in the full questions array
      const fullIndex = questions.findIndex(q => q.id === currentQuestion?.id)
      setExpandedCardIndex(fullIndex)
      
      // Scroll to the card
      if (cardRefs.current[fullIndex]) {
        cardRefs.current[fullIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }
  }, [currentIndex, currentQuestion, hasLessonCards, questions])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
          if (!hasChecked) {
            const optionIndex = parseInt(e.key) - 1
            const option = currentQuestion?.options[optionIndex]
            if (option) {
              setSelectedOption(option.label)
            }
          }
          break
        case 'a':
        case 'A':
          if (!hasChecked) setSelectedOption('A')
          break
        case 'b':
        case 'B':
          if (!hasChecked) setSelectedOption('B')
          break
        case 'c':
        case 'C':
          if (!hasChecked) setSelectedOption('C')
          break
        case 'd':
        case 'D':
          if (!hasChecked) setSelectedOption('D')
          break
        case 'Enter':
          if (!hasChecked && selectedOption) {
            handleCheck()
          } else if (hasChecked && currentIndex < activeQuestions.length - 1) {
            handleNext()
          }
          break
        case ' ':
          e.preventDefault()
          if (hasChecked && currentIndex < activeQuestions.length - 1) {
            handleNext()
          }
          break
        case 'ArrowRight':
          if (hasChecked) handleNext()
          break
        case 'ArrowLeft':
          handlePrevious()
          break
        case 'l':
        case 'L':
          setShowLessonSidebar(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChecked, selectedOption, currentIndex, activeQuestions.length, currentQuestion])

  if (!questions || questions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-secondary">No questions found.</p>
      </div>
    )
  }

  if (activeQuestions.length === 0 && mode === 'review') {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-primary font-medium mb-2">No questions to review!</p>
        <p className="text-text-secondary mb-4">You haven't missed any questions yet.</p>
        <button 
          onClick={() => setMode('test')}
          className="btn-primary"
        >
          Switch to Test Mode
        </button>
      </div>
    )
  }

  const handleCheck = () => {
    if (!selectedOption || !currentQuestion) return
    
    setHasChecked(true)
    
    const questionId = currentQuestion.id || `q-${currentIndex}`
    
    if (!answeredQuestions.has(questionId)) {
      setAnsweredQuestions(prev => new Set(prev).add(questionId))
      
      if (selectedOption === currentQuestion.correctOption) {
        setCorrectAnswers(prev => prev + 1)
      } else {
        setIncorrectAnswers(prev => prev + 1)
        setIncorrectQuestionIds(prev => new Set(prev).add(questionId))
      }
    }
  }

  const handleNext = () => {
    if (currentIndex < activeQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedOption(null)
      setHasChecked(false)
    } else {
      // Session complete
      setIsComplete(true)
      if (onSessionComplete) {
        onSessionComplete({
          totalQuestions: activeQuestions.length,
          correctAnswers,
          incorrectAnswers,
          totalTimeSeconds,
          answeredQuestions,
          incorrectQuestionIds
        })
      }
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setSelectedOption(null)
      setHasChecked(false)
    }
  }

  const handleModeChange = (newMode: MCQMode) => {
    setMode(newMode)
    setCurrentIndex(0)
    setSelectedOption(null)
    setHasChecked(false)
    setIsComplete(false)
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedOption(null)
    setHasChecked(false)
    setCorrectAnswers(0)
    setIncorrectAnswers(0)
    setTotalTimeSeconds(0)
    setAnsweredQuestions(new Set())
    setIsComplete(false)
  }

  // Should show lesson card before answering (Study mode)
  const showLessonBeforeAnswer = mode === 'study' && !hasChecked
  // Should show lesson card after answering (Test mode) or always (Study mode after answer)
  const showLessonAfterAnswer = hasChecked && (mode === 'study' || mode === 'test')

  return (
    <div className="flex gap-6">
      {/* Main MCQ Area */}
      <div className={`flex-1 ${showLessonSidebar && hasLessonCards ? 'max-w-2xl' : 'max-w-3xl mx-auto'}`}>
        {/* Mode Selector */}
        <div className="mb-4">
          <MCQModeSelector 
            currentMode={mode}
            onModeChange={handleModeChange}
            hasIncorrectAnswers={incorrectQuestionIds.size > 0}
          />
        </div>

        {/* Score Tracker */}
        <div className="mb-4">
          <ScoreTracker
            totalQuestions={activeQuestions.length}
            currentQuestion={currentIndex + 1}
            correctAnswers={correctAnswers}
            incorrectAnswers={incorrectAnswers}
            totalTimeSeconds={totalTimeSeconds}
            mode={mode}
            isComplete={isComplete}
          />
        </div>

        {/* Session Complete */}
        {isComplete && (
          <div className="mb-6">
            <div className="flex gap-3 justify-center">
              <button onClick={handleRestart} className="btn-primary">
                Restart Quiz
              </button>
              {incorrectQuestionIds.size > 0 && mode !== 'review' && (
                <button 
                  onClick={() => handleModeChange('review')}
                  className="btn-secondary"
                >
                  Review Missed Questions ({incorrectQuestionIds.size})
                </button>
              )}
            </div>
          </div>
        )}

        {!isComplete && currentQuestion && (
          <>
            {/* Challenge Mode Timer */}
            {mode === 'challenge' && !hasChecked && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-secondary">Time remaining</span>
                  <span className={`text-lg font-bold ${challengeTimeLeft <= 10 ? 'text-red-500' : 'text-text-primary'}`}>
                    {challengeTimeLeft}s
                  </span>
                </div>
                <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${challengeTimeLeft <= 10 ? 'bg-red-500' : 'bg-accent'}`}
                    style={{ width: `${(challengeTimeLeft / 30) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Progress indicator */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-secondary">
                  Question {currentIndex + 1} of {activeQuestions.length}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-text-secondary">
                    {Math.round(((currentIndex + 1) / activeQuestions.length) * 100)}%
                  </span>
                  {hasLessonCards && (
                    <button
                      onClick={() => setShowLessonSidebar(!showLessonSidebar)}
                      className={`flex items-center gap-1 text-sm px-3 py-1 rounded-lg transition-colors ${
                        showLessonSidebar 
                          ? 'bg-accent text-white' 
                          : 'bg-elevated text-text-secondary hover:bg-accent-muted hover:text-accent'
                      }`}
                    >
                      <FiBook className="w-4 h-4" />
                      {showLessonSidebar ? 'Hide' : 'Show'} Lessons
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / activeQuestions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Study Mode: Show lesson card before answering */}
            {showLessonBeforeAnswer && currentQuestion.lesson_card && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <FiBook className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Study this concept first:</span>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-semibold text-text-primary mb-2">{currentQuestion.lesson_card.title}</h4>
                  <p className="text-sm text-text-secondary">{currentQuestion.lesson_card.conceptOverview}</p>
                  {currentQuestion.lesson_card.keyPoints && (
                    <ul className="mt-2 space-y-1">
                      {currentQuestion.lesson_card.keyPoints.slice(0, 3).map((point, i) => (
                        <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                          <FiCheck className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
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
                {currentQuestion.options.map((option, index) => {
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
                        <span className="text-xs text-text-tertiary opacity-50">
                          {index + 1}
                        </span>
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

              {/* Show lesson card after answer in Test mode */}
              {showLessonAfterAnswer && currentQuestion.lesson_card && mode === 'test' && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <FiBook className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">Learn more:</span>
                  </div>
                  <p className="text-sm text-blue-800">{currentQuestion.lesson_card.conceptOverview}</p>
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

                {hasChecked && currentIndex < activeQuestions.length - 1 && (
                  <button onClick={handleNext} className="btn-primary">
                    Next Question
                    <FiArrowRight className="w-4 h-4" />
                  </button>
                )}

                {hasChecked && currentIndex === activeQuestions.length - 1 && (
                  <button onClick={handleNext} className="btn-primary">
                    Complete Quiz
                    <FiCheck className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="mt-4 text-center">
              <button 
                className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 mx-auto"
                onClick={() => {}}
              >
                <FiCommand className="w-3 h-3" />
                Keyboard: 1-4 or A-D to select, Enter to check, Space for next, L for lessons
              </button>
            </div>
          </>
        )}
      </div>

      {/* Lesson Cards Sidebar */}
      {showLessonSidebar && hasLessonCards && !isComplete && (
        <div className="w-80 flex-shrink-0">
          <div className="sticky top-4">
            <div className="card max-h-[calc(100vh-8rem)] overflow-y-auto">
              {/* Sidebar Header */}
              <div className="p-4 border-b border-border sticky top-0 bg-sidebar z-10">
                <h3 className="font-semibold text-text-primary flex items-center gap-2">
                  <FiBook className="w-5 h-5 text-accent" />
                  Lesson Cards ({questions.filter(q => q.lesson_card).length})
                </h3>
              </div>

              {/* Lesson Cards List */}
              <div className="p-3 space-y-2">
                {questions.map((q, index) => {
                  const isActive = q.id === currentQuestion?.id
                  const isExpanded = expandedCardIndex === index
                  
                  return (
                    <div
                      key={q.id || index}
                      ref={(el) => { cardRefs.current[index] = el }}
                    >
                      <LessonCard
                        card={q.lesson_card!}
                        questionNumber={index + 1}
                        isActive={isActive}
                        isExpanded={isExpanded}
                        onToggleExpand={() => setExpandedCardIndex(isExpanded ? null : index)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
