'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { 
  FiChevronLeft, 
  FiCheck, 
  FiX, 
  FiArrowRight,
  FiArrowLeft,
  FiBook,
  FiZap,
  FiEdit3,
  FiRotateCcw,
  FiClock,
  FiAward,
  FiTrendingUp,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi'

interface MCQQuestion {
  id?: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
  lesson_card?: {
    title: string
    conceptOverview: string
    keyPoints?: string[]
  }
}

type MCQMode = 'study' | 'test' | 'challenge' | 'review'

export default function MobileMCQViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const mcqSetId = resolvedParams.id

  // Data state
  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [loading, setLoading] = useState(true)

  // Quiz state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [hasChecked, setHasChecked] = useState(false)
  const [mode, setMode] = useState<MCQMode>('test')
  
  // Score state
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [incorrectAnswers, setIncorrectAnswers] = useState(0)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [incorrectQuestionIds, setIncorrectQuestionIds] = useState<Set<string>>(new Set())
  const [isComplete, setIsComplete] = useState(false)
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(0)
  
  // Challenge mode
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(30)
  
  // Lesson card state
  const [showLessonCard, setShowLessonCard] = useState(false)

  // Touch handling for swipe
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    loadMCQSet()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [mcqSetId])

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTotalTimeSeconds(prev => prev + 1)
      
      if (mode === 'challenge' && !hasChecked) {
        setChallengeTimeLeft(prev => {
          if (prev <= 1) {
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
  }, [currentIndex, mode])

  const loadMCQSet = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/m/login')
        return
      }

      const response = await fetch(`/api/mcq/${mcqSetId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setMcqSet(data.set)
        setQuestions(data.questions || [])
      } else {
        router.push('/m/mcq')
      }
    } catch (error) {
      console.error('Error loading MCQ set:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActiveQuestions = useCallback(() => {
    if (mode === 'review') {
      return questions.filter(q => incorrectQuestionIds.has(q.id || ''))
    }
    return questions
  }, [mode, questions, incorrectQuestionIds])

  const activeQuestions = getActiveQuestions()
  const currentQuestion = activeQuestions[currentIndex]
  const isCorrect = selectedOption === currentQuestion?.correctOption
  const progress = ((currentIndex + 1) / activeQuestions.length) * 100

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
      setShowLessonCard(false)
    } else {
      setIsComplete(true)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setSelectedOption(null)
      setHasChecked(false)
      setShowLessonCard(false)
    }
  }

  const handleModeChange = (newMode: MCQMode) => {
    setMode(newMode)
    setCurrentIndex(0)
    setSelectedOption(null)
    setHasChecked(false)
    setIsComplete(false)
    setShowLessonCard(false)
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
    setShowLessonCard(false)
  }

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
    touchStartY.current = e.targetTouches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const diffX = touchStartX.current - touchEndX
    const diffY = touchStartY.current - touchEndY
    
    // Only handle horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0 && hasChecked) {
        // Swipe left - next
        handleNext()
      } else if (diffX < 0) {
        // Swipe right - previous
        handlePrevious()
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const accuracy = (correctAnswers + incorrectAnswers) > 0 
    ? Math.round((correctAnswers / (correctAnswers + incorrectAnswers)) * 100) 
    : 0

  if (loading) {
    return (
      <div className="mobile-app flex items-center justify-center">
        <div className="spinner-mobile" />
      </div>
    )
  }

  if (!mcqSet || questions.length === 0) {
    return (
      <div className="mobile-app flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[var(--color-text-secondary)] mb-4">No questions found</p>
          <button onClick={() => router.push('/m/mcq')} className="btn-mobile btn-primary-mobile">
            Back to Quizzes
          </button>
        </div>
      </div>
    )
  }

  // Results Screen
  if (isComplete) {
    return (
      <div className="mobile-app">
        <header className="mobile-header">
          <button onClick={() => router.push('/m/mcq')} className="mobile-header-action">
            <FiChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="mobile-header-title">Results</h1>
          <div className="w-12" />
        </header>

        <div className="mobile-content-full flex flex-col items-center justify-center px-6 py-8" style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top) + 24px)' }}>
          {/* Trophy */}
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
            accuracy >= 80 ? 'bg-[var(--color-success-soft)]' : 
            accuracy >= 60 ? 'bg-[var(--color-warning-soft)]' : 
            'bg-[var(--color-error-soft)]'
          }`}>
            <FiAward className={`w-12 h-12 ${
              accuracy >= 80 ? 'text-[var(--color-success)]' : 
              accuracy >= 60 ? 'text-[var(--color-warning)]' : 
              'text-[var(--color-error)]'
            }`} />
          </div>

          <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
            {accuracy >= 80 ? 'Excellent!' : accuracy >= 60 ? 'Good job!' : 'Keep practicing!'}
          </h2>
          
          <p className="text-[var(--color-text-secondary)] text-center mb-8">
            You completed the quiz in {formatTime(totalTimeSeconds)}
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 w-full mb-8">
            <div className="mcq-stat correct">
              <span className="mcq-stat-value">{correctAnswers}</span>
              <span className="mcq-stat-label">Correct</span>
            </div>
            <div className="mcq-stat incorrect">
              <span className="mcq-stat-value">{incorrectAnswers}</span>
              <span className="mcq-stat-label">Wrong</span>
            </div>
            <div className={`mcq-stat ${accuracy >= 80 ? 'correct' : accuracy >= 60 ? 'time' : 'incorrect'}`}>
              <span className="mcq-stat-value">{accuracy}%</span>
              <span className="mcq-stat-label">Score</span>
            </div>
          </div>

          {/* Actions */}
          <div className="w-full space-y-3">
            <button onClick={handleRestart} className="btn-mobile btn-primary-mobile w-full">
              <FiRotateCcw className="w-5 h-5" />
              Try Again
            </button>
            
            {incorrectQuestionIds.size > 0 && mode !== 'review' && (
              <button 
                onClick={() => handleModeChange('review')}
                className="btn-mobile btn-secondary-mobile w-full"
              >
                <FiBook className="w-5 h-5" />
                Review Mistakes ({incorrectQuestionIds.size})
              </button>
            )}
            
            <button 
              onClick={() => router.push('/m/mcq')}
              className="btn-mobile btn-ghost-mobile w-full"
            >
              Back to Quizzes
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Quiz Screen
  return (
    <div 
      className="mobile-app"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header className="mobile-header">
        <button onClick={() => router.push('/m/mcq')} className="mobile-header-action">
          <FiChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {mcqSet.name}
          </h1>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
          <FiClock className="w-3.5 h-3.5" />
          {formatTime(totalTimeSeconds)}
        </div>
      </header>

      {/* Content */}
      <div 
        className="mobile-content-full flex flex-col"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top))' }}
      >
        {/* Progress Section */}
        <div className="mcq-progress">
          <div className="mcq-progress-bar">
            <div 
              className="mcq-progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mcq-progress-text">
            <span>Question {currentIndex + 1} of {activeQuestions.length}</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[var(--color-success)]">
                <FiCheck className="w-3.5 h-3.5" />
                {correctAnswers}
              </span>
              <span className="flex items-center gap-1 text-[var(--color-error)]">
                <FiX className="w-3.5 h-3.5" />
                {incorrectAnswers}
              </span>
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="mcq-mode-selector">
          {[
            { id: 'study' as MCQMode, label: 'Study', icon: FiBook, color: 'study' },
            { id: 'test' as MCQMode, label: 'Test', icon: FiEdit3, color: 'test' },
            { id: 'challenge' as MCQMode, label: 'Challenge', icon: FiZap, color: 'challenge' },
            { id: 'review' as MCQMode, label: 'Review', icon: FiRotateCcw, color: 'review', disabled: incorrectQuestionIds.size === 0 },
          ].map((m) => {
            const Icon = m.icon
            return (
              <button
                key={m.id}
                onClick={() => !m.disabled && handleModeChange(m.id)}
                disabled={m.disabled}
                className={`mcq-mode-pill ${m.color} ${mode === m.id ? 'active' : ''} ${m.disabled ? 'opacity-40' : ''}`}
              >
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            )
          })}
        </div>

        {/* Challenge Timer */}
        {mode === 'challenge' && !hasChecked && (
          <div className="px-4 pb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[var(--color-text-secondary)]">Time left</span>
              <span className={`font-bold ${challengeTimeLeft <= 10 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]'}`}>
                {challengeTimeLeft}s
              </span>
            </div>
            <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${challengeTimeLeft <= 10 ? 'bg-[var(--color-error)]' : 'bg-[var(--color-accent)]'}`}
                style={{ width: `${(challengeTimeLeft / 30) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Study Mode: Lesson Card Before */}
        {mode === 'study' && !hasChecked && currentQuestion?.lesson_card && (
          <div className="px-4 mb-3">
            <div className="p-4 bg-[rgba(59,130,246,0.1)] rounded-xl border border-[rgba(59,130,246,0.2)]">
              <div className="flex items-center gap-2 mb-2">
                <FiBook className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">Study first:</span>
              </div>
              <h4 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1">
                {currentQuestion.lesson_card.title}
              </h4>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {currentQuestion.lesson_card.conceptOverview}
              </p>
            </div>
          </div>
        )}

        {/* Question Card */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="mcq-question-card animate-scale-in">
            <h2 className="mcq-question-text">{currentQuestion?.question}</h2>

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion?.options.map((option) => {
                const isSelected = selectedOption === option.label
                const showResult = hasChecked
                const isCorrectOption = option.label === currentQuestion.correctOption

                let optionClass = 'mcq-option'
                if (showResult) {
                  if (isCorrectOption) optionClass += ' correct'
                  else if (isSelected) optionClass += ' incorrect'
                } else if (isSelected) {
                  optionClass += ' selected'
                }

                return (
                  <button
                    key={option.label}
                    onClick={() => !hasChecked && setSelectedOption(option.label)}
                    disabled={hasChecked}
                    className={optionClass}
                  >
                    <span className="mcq-option-label">
                      {showResult && isCorrectOption ? (
                        <FiCheck className="w-4 h-4" />
                      ) : showResult && isSelected && !isCorrect ? (
                        <FiX className="w-4 h-4" />
                      ) : (
                        option.label
                      )}
                    </span>
                    <span className="flex-1">{option.text}</span>
                  </button>
                )
              })}
            </div>

            {/* Feedback */}
            {hasChecked && (
              <div className={`mt-4 p-4 rounded-xl ${isCorrect ? 'bg-[var(--color-success-soft)]' : 'bg-[var(--color-error-soft)]'} animate-slide-up`}>
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <FiCheck className="w-5 h-5 text-[var(--color-success)] flex-shrink-0 mt-0.5" />
                  ) : (
                    <FiX className="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-semibold text-sm ${isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                      {isCorrect ? 'Correct!' : 'Incorrect'}
                    </p>
                    {!isCorrect && (
                      <p className="text-xs text-[var(--color-error)] mt-0.5">
                        Correct answer: {currentQuestion?.correctOption}
                      </p>
                    )}
                    {currentQuestion?.explanation && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                        {currentQuestion.explanation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Lesson Card After (Test mode) */}
            {hasChecked && currentQuestion?.lesson_card && mode === 'test' && (
              <button
                onClick={() => setShowLessonCard(!showLessonCard)}
                className="w-full mt-3 p-3 bg-[var(--color-surface)] rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <FiBook className="w-4 h-4 text-[var(--color-accent)]" />
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">Learn more</span>
                </div>
                {showLessonCard ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
              </button>
            )}

            {showLessonCard && currentQuestion?.lesson_card && (
              <div className="mt-2 p-4 bg-[var(--color-accent-soft)] rounded-xl animate-slide-down">
                <h4 className="font-semibold text-[var(--color-text-primary)] text-sm mb-2">
                  {currentQuestion.lesson_card.title}
                </h4>
                <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                  {currentQuestion.lesson_card.conceptOverview}
                </p>
                {currentQuestion.lesson_card.keyPoints && (
                  <ul className="space-y-1">
                    {currentQuestion.lesson_card.keyPoints.slice(0, 3).map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                        <FiCheck className="w-3 h-3 text-[var(--color-success)] flex-shrink-0 mt-0.5" />
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 pb-6 bg-[var(--color-bg-glass)] backdrop-blur-xl border-t border-[var(--color-border)]">
          <div className="flex gap-3">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="btn-mobile btn-secondary-mobile flex-1 disabled:opacity-30"
            >
              <FiArrowLeft className="w-5 h-5" />
            </button>

            {!hasChecked ? (
              <button
                onClick={handleCheck}
                disabled={!selectedOption}
                className="btn-mobile btn-primary-mobile flex-[2] disabled:opacity-30"
              >
                <FiCheck className="w-5 h-5" />
                Check
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="btn-mobile btn-primary-mobile flex-[2]"
              >
                {currentIndex < activeQuestions.length - 1 ? (
                  <>
                    Next
                    <FiArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Finish
                    <FiAward className="w-5 h-5" />
                  </>
                )}
              </button>
            )}
          </div>
          
          <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-3">
            Swipe left/right to navigate
          </p>
        </div>
      </div>
    </div>
  )
}

