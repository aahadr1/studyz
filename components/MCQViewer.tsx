'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { FiCheck, FiX, FiArrowRight, FiArrowLeft, FiBook, FiCommand, FiVolume2, FiMessageCircle, FiSend, FiTrash2 } from 'react-icons/fi'
import LessonCard, { LessonCardData } from './LessonCard'
import ScoreTracker from './ScoreTracker'
import MCQModeSelector, { MCQMode } from './MCQModeSelector'
import { SpeakButton } from './mobile/TextToSpeech'
import { createClient } from '@/lib/supabase'

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
  mcqSetId?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
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
  initialMode = 'test',
  mcqSetId
}: MCQViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [hasChecked, setHasChecked] = useState(false)
  const [mode, setMode] = useState<MCQMode>(initialMode)
  
  const [showLessonSidebar, setShowLessonSidebar] = useState(true)
  const [showChatSidebar, setShowChatSidebar] = useState(false)
  const [expandedCardIndex, setExpandedCardIndex] = useState<number | null>(null)
  
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [incorrectAnswers, setIncorrectAnswers] = useState(0)
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(0)
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [incorrectQuestionIds, setIncorrectQuestionIds] = useState<Set<string>>(new Set())
  const [isComplete, setIsComplete] = useState(false)
  
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(30)
  const [ttsLanguage, setTtsLanguage] = useState<'en' | 'fr'>('en')
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  
  const cardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    if (mode === 'challenge') {
      setChallengeTimeLeft(30)
    }
    setQuestionStartTime(Date.now())
  }, [currentIndex, mode])

  useEffect(() => {
    if (hasLessonCards) {
      const fullIndex = questions.findIndex(q => q.id === currentQuestion?.id)
      setExpandedCardIndex(fullIndex)
      
      if (cardRefs.current[fullIndex]) {
        cardRefs.current[fullIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }
  }, [currentIndex, currentQuestion, hasLessonCards, questions])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case '1': case '2': case '3': case '4':
          if (!hasChecked) {
            const optionIndex = parseInt(e.key) - 1
            const option = currentQuestion?.options[optionIndex]
            if (option) setSelectedOption(option.label)
          }
          break
        case 'a': case 'A': if (!hasChecked) setSelectedOption('A'); break
        case 'b': case 'B': if (!hasChecked) setSelectedOption('B'); break
        case 'c': case 'C': if (!hasChecked) setSelectedOption('C'); break
        case 'd': case 'D': if (!hasChecked) setSelectedOption('D'); break
        case 'Enter':
          if (!hasChecked && selectedOption) handleCheck()
          else if (hasChecked && currentIndex < activeQuestions.length - 1) handleNext()
          break
        case ' ':
          e.preventDefault()
          if (hasChecked && currentIndex < activeQuestions.length - 1) handleNext()
          break
        case 'ArrowRight': if (hasChecked) handleNext(); break
        case 'ArrowLeft': handlePrevious(); break
        case 'l': case 'L': setShowLessonSidebar(prev => !prev); break
        case 'c': case 'C': if (e.metaKey || e.ctrlKey) setShowChatSidebar(prev => !prev); break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChecked, selectedOption, currentIndex, activeQuestions.length, currentQuestion])

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (showChatSidebar && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, showChatSidebar])

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatSending || !mcqSetId) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatSending(true)

    const tempMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
    }
    setChatMessages(prev => [...prev, tempMessage])

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/mcq/${mcqSetId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          currentQuestion: currentQuestion,
          conversationHistory: chatMessages.slice(-10),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
        }
        setChatMessages(prev => [...prev, assistantMessage])
      } else {
        setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
      }
    } catch (error) {
      console.error('Chat error:', error)
      setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
    } finally {
      setChatSending(false)
    }
  }

  const clearChat = () => {
    setChatMessages([])
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="border border-border p-8 text-center">
        <p className="text-text-secondary">No questions found.</p>
      </div>
    )
  }

  if (activeQuestions.length === 0 && mode === 'review') {
    return (
      <div className="border border-border p-8 text-center">
        <p className="text-text-primary font-medium mb-2">No questions to review</p>
        <p className="text-text-secondary mb-4">You haven't missed any questions yet.</p>
        <button onClick={() => setMode('test')} className="btn-primary">
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

  const showLessonBeforeAnswer = mode === 'study' && !hasChecked
  const showLessonAfterAnswer = hasChecked && (mode === 'study' || mode === 'test')

  return (
    <div className="flex gap-6">
      {/* Main MCQ Area */}
      <div className={`flex-1 ${showLessonSidebar && hasLessonCards ? 'max-w-2xl' : 'max-w-3xl mx-auto'}`}>
        {/* Mode Selector */}
        <div className="mb-6">
          <MCQModeSelector 
            currentMode={mode}
            onModeChange={handleModeChange}
            hasIncorrectAnswers={incorrectQuestionIds.size > 0}
          />
        </div>

        {/* Score Tracker */}
        <div className="mb-6">
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
          <div className="mb-8 text-center">
            <div className="flex gap-3 justify-center">
              <button onClick={handleRestart} className="btn-primary">
                Restart Quiz
              </button>
              {incorrectQuestionIds.size > 0 && mode !== 'review' && (
                <button onClick={() => handleModeChange('review')} className="btn-mode-review">
                  Review Missed ({incorrectQuestionIds.size})
                </button>
              )}
            </div>
          </div>
        )}

        {!isComplete && currentQuestion && (
          <>
            {/* Challenge Mode Timer */}
            {mode === 'challenge' && !hasChecked && (
              <div className="mb-6 p-4 border border-mode-challenge/30 bg-mode-challenge/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-text-secondary">Time</span>
                  <span className={`text-2xl font-semibold mono ${challengeTimeLeft <= 10 ? 'text-error' : 'text-mode-challenge'}`}>
                    {challengeTimeLeft}s
                  </span>
                </div>
                <div className="h-1 bg-border">
                  <div
                    className={`h-full transition-all duration-1000 ${challengeTimeLeft <= 10 ? 'bg-error' : 'bg-mode-challenge'}`}
                    style={{ width: `${(challengeTimeLeft / 30) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-text-tertiary mono">
                  Question {currentIndex + 1} / {activeQuestions.length}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-text-tertiary mono">
                    {Math.round(((currentIndex + 1) / activeQuestions.length) * 100)}%
                  </span>
                  {hasLessonCards && (
                    <button
                      onClick={() => setShowLessonSidebar(!showLessonSidebar)}
                      className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
                        showLessonSidebar 
                          ? 'border-mode-study text-mode-study bg-mode-study/10' 
                          : 'border-border text-text-secondary hover:border-text-primary'
                      }`}
                    >
                      <FiBook className="w-3 h-3 inline mr-1" />
                      Lessons
                    </button>
                  )}
                  {mcqSetId && (
                    <button
                      onClick={() => setShowChatSidebar(!showChatSidebar)}
                      className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors relative ${
                        showChatSidebar 
                          ? 'border-indigo-500 text-indigo-500 bg-indigo-500/10' 
                          : 'border-border text-text-secondary hover:border-text-primary'
                      }`}
                    >
                      <FiMessageCircle className="w-3 h-3 inline mr-1" />
                      AI Chat
                      {chatMessages.length > 0 && !showChatSidebar && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="mcq-progress">
                <div
                  className="mcq-progress-fill"
                  style={{ width: `${((currentIndex + 1) / activeQuestions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Study Mode: Show lesson card before answering */}
            {showLessonBeforeAnswer && currentQuestion.lesson_card && (
              <div className="mb-6 p-4 border border-mode-study/30 bg-mode-study/5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FiBook className="w-4 h-4 text-mode-study" />
                    <span className="text-xs uppercase tracking-wider text-mode-study">Study First</span>
                  </div>
                  <SpeakButton 
                    text={`${currentQuestion.lesson_card.title}. ${currentQuestion.lesson_card.conceptOverview}${
                      currentQuestion.lesson_card.keyPoints 
                        ? '. Key points: ' + currentQuestion.lesson_card.keyPoints.join('. ') 
                        : ''
                    }`} 
                    language={ttsLanguage}
                    size="sm"
                  />
                </div>
                <div className="border border-border p-4 bg-background">
                  <h4 className="font-medium text-text-primary mb-2">{currentQuestion.lesson_card.title}</h4>
                  <p className="text-sm text-text-secondary">{currentQuestion.lesson_card.conceptOverview}</p>
                  {currentQuestion.lesson_card.keyPoints && (
                    <ul className="mt-3 space-y-1">
                      {currentQuestion.lesson_card.keyPoints.slice(0, 3).map((point, i) => (
                        <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                          <FiCheck className="w-3 h-3 text-success flex-shrink-0 mt-1" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Question Card */}
            <div className="border border-border p-6 mb-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <h2 className="text-lg font-medium text-text-primary leading-relaxed flex-1">
                  {currentQuestion.question}
                </h2>
                <SpeakButton 
                  text={currentQuestion.question} 
                  language={ttsLanguage}
                  size="md"
                  showLanguageToggle
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedOption === option.label
                  const showResult = hasChecked
                  const isCorrectOption = option.label === currentQuestion.correctOption

                  let optionClasses = 'mcq-option '
                  
                  if (!showResult) {
                    if (isSelected) optionClasses += 'mcq-option-selected'
                  } else {
                    if (isCorrectOption) {
                      optionClasses += 'mcq-option-correct'
                    } else if (isSelected && !isCorrect) {
                      optionClasses += 'mcq-option-incorrect'
                    }
                  }

                  return (
                    <button
                      key={option.label}
                      onClick={() => !hasChecked && setSelectedOption(option.label)}
                      disabled={hasChecked}
                      className={optionClasses}
                    >
                      <span className="mcq-option-label">{option.label}</span>
                      <span className="flex-1 text-sm">{option.text}</span>
                      <span className="text-xs text-text-tertiary opacity-50 mono">{index + 1}</span>
                        {showResult && isCorrectOption && (
                        <FiCheck className="w-4 h-4 text-success flex-shrink-0" strokeWidth={2} />
                        )}
                        {showResult && isSelected && !isCorrect && (
                        <FiX className="w-4 h-4 text-error flex-shrink-0" strokeWidth={2} />
                        )}
                    </button>
                  )
                })}
              </div>

              {/* Feedback */}
              {hasChecked && (
                <div className={`mt-6 p-4 border ${isCorrect ? 'border-success/30 bg-success/5' : 'border-error/30 bg-error/5'}`}>
                  <div className="flex items-start gap-3">
                    {isCorrect ? (
                      <FiCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" strokeWidth={2} />
                    ) : (
                      <FiX className="w-5 h-5 text-error flex-shrink-0 mt-0.5" strokeWidth={2} />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`font-medium ${isCorrect ? 'text-success' : 'text-error'}`}>
                          {isCorrect ? 'Correct' : 'Incorrect'}
                        </p>
                        {currentQuestion.explanation && (
                          <SpeakButton 
                            text={currentQuestion.explanation} 
                            language={ttsLanguage}
                            size="sm"
                          />
                        )}
                      </div>
                      {!isCorrect && (
                        <p className="text-sm text-text-secondary mb-2">
                          Correct answer: <span className="font-medium text-text-primary">{currentQuestion.correctOption}</span>
                        </p>
                      )}
                      {currentQuestion.explanation && (
                        <p className="text-sm text-text-secondary">{currentQuestion.explanation}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Show lesson card after answer in Test mode */}
              {showLessonAfterAnswer && currentQuestion.lesson_card && mode === 'test' && (
                <div className="mt-4 p-4 border border-mode-study/30 bg-mode-study/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FiBook className="w-4 h-4 text-mode-study" />
                      <span className="text-xs uppercase tracking-wider text-mode-study">Learn More</span>
                    </div>
                    <SpeakButton 
                      text={currentQuestion.lesson_card.conceptOverview} 
                      language={ttsLanguage}
                      size="sm"
                    />
                  </div>
                  <p className="text-sm text-text-secondary">{currentQuestion.lesson_card.conceptOverview}</p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="btn-secondary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FiArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                Previous
              </button>

              <div className="flex gap-3">
                {!hasChecked && (
                  <button
                    onClick={handleCheck}
                    disabled={!selectedOption}
                    className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Check
                    <FiCheck className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}

                {hasChecked && currentIndex < activeQuestions.length - 1 && (
                  <button onClick={handleNext} className="btn-primary">
                    Next
                    <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}

                {hasChecked && currentIndex === activeQuestions.length - 1 && (
                  <button onClick={handleNext} className="btn-primary">
                    Complete
                    <FiCheck className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>

            {/* Keyboard shortcuts & TTS toggle */}
            <div className="mt-6 flex items-center justify-center gap-6">
              <p className="text-xs text-text-tertiary mono">
                <FiCommand className="w-3 h-3 inline mr-1" />
                1-4 / A-D select · Enter check · Space next · L lessons
              </p>
              <div className="flex items-center gap-2 border border-border px-2 py-1">
                <FiVolume2 className="w-3 h-3 text-text-tertiary" strokeWidth={1.5} />
                <button
                  onClick={() => setTtsLanguage('en')}
                  className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 transition-colors ${
                    ttsLanguage === 'en' 
                      ? 'bg-white text-black' 
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => setTtsLanguage('fr')}
                  className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 transition-colors ${
                    ttsLanguage === 'fr' 
                      ? 'bg-white text-black' 
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  FR
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lesson Cards Sidebar */}
      {showLessonSidebar && hasLessonCards && !isComplete && (
        <div className="w-80 flex-shrink-0">
          <div className="sticky top-4">
            <div className="border border-border max-h-[calc(100vh-8rem)] overflow-y-auto bg-background">
              <div className="p-4 border-b border-border sticky top-0 bg-background z-10">
                <h3 className="text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                  <FiBook className="w-4 h-4 text-mode-study" />
                  Lessons ({questions.filter(q => q.lesson_card).length})
                </h3>
              </div>

              <div className="p-3 space-y-2">
                {questions.map((q, index) => {
                  const isActive = q.id === currentQuestion?.id
                  const isExpanded = expandedCardIndex === index
                  
                  return (
                    <div key={q.id || index} ref={(el) => { cardRefs.current[index] = el }}>
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

      {/* AI Chat Sidebar */}
      {showChatSidebar && mcqSetId && !isComplete && (
        <div className="w-96 flex-shrink-0">
          <div className="sticky top-4">
            <div className="border border-border h-[calc(100vh-8rem)] flex flex-col bg-background">
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                  <FiMessageCircle className="w-4 h-4 text-indigo-500" />
                  AI Assistant
                </h3>
                <div className="flex items-center gap-2">
                  {chatMessages.length > 0 && (
                    <button
                      onClick={clearChat}
                      className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                      title="Clear chat"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowChatSidebar(false)}
                    className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 border border-border flex items-center justify-center mx-auto mb-4">
                      <FiMessageCircle className="w-6 h-6 text-text-tertiary" />
                    </div>
                    <p className="text-sm text-text-secondary mb-2">Ask about this question</p>
                    <p className="text-xs text-text-tertiary mb-6">I can help explain concepts, why answers are correct, or clarify confusing parts.</p>
                    
                    {/* Quick Prompts */}
                    <div className="space-y-2">
                      {[
                        'Why is this the correct answer?',
                        'Explain the concept being tested',
                        'What are common mistakes here?',
                      ].map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setChatInput(prompt)
                            chatInputRef.current?.focus()
                          }}
                          className="block w-full p-3 text-left text-sm border border-border hover:border-text-primary transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div 
                      key={message.id} 
                      className={`p-3 text-sm ${
                        message.role === 'user' 
                          ? 'bg-surface border border-border ml-8' 
                          : 'bg-background border border-indigo-500/30 mr-8'
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
                        {message.role === 'user' ? 'You' : 'Assistant'}
                      </p>
                      <p className="whitespace-pre-wrap text-text-primary">{message.content}</p>
                    </div>
                  ))
                )}
                {chatSending && (
                  <div className="p-3 bg-background border border-indigo-500/30 mr-8">
                    <p className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">Assistant</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendChat()
                      }
                    }}
                    placeholder="Ask about this question..."
                    rows={1}
                    className="flex-1 px-3 py-2 border border-border bg-background text-sm resize-none focus:outline-none focus:border-text-primary"
                    disabled={chatSending}
                    style={{ minHeight: '40px', maxHeight: '100px' }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || chatSending}
                    className="w-10 h-10 bg-indigo-500 text-white flex items-center justify-center disabled:opacity-30 transition-opacity"
                  >
                    <FiSend className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-text-tertiary">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
