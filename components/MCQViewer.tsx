'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { FiCheck, FiX, FiArrowRight, FiArrowLeft, FiBook, FiCommand, FiVolume2, FiMessageCircle, FiSend, FiTrash2, FiMic, FiStopCircle } from 'react-icons/fi'
import LessonCard, { LessonCardData } from './LessonCard'
import ScoreTracker from './ScoreTracker'
import MCQModeSelector, { MCQMode } from './MCQModeSelector'
import { SpeakButton } from './mobile/TextToSpeech'
import { createClient } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Persistence key prefix for localStorage
const STORAGE_KEY_PREFIX = 'mcq_progress_'

interface MCQProgress {
  currentIndex: number
  correctAnswers: number
  incorrectAnswers: number
  answeredQuestions: string[]
  incorrectQuestionIds: string[]
  mode: MCQMode
  totalTimeSeconds: number
  chatMessages: ChatMessage[]
}

export interface MCQQuestion {
  id?: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption?: string
  correctOptions?: string[]
  questionType?: 'scq' | 'mcq'
  explanation?: string
  section_id?: string
  lesson_card?: LessonCardData
}

function buildQuestionTtsText(question: MCQQuestion | undefined | null, language: 'en' | 'fr'): string {
  if (!question) return ''

  const questionText = String(question.question || '').trim()
  const options = Array.isArray(question.options) ? question.options : []

  const normalizedOptions = options
    .map((o) => ({ label: String(o?.label || '').trim(), text: String(o?.text || '').trim() }))
    .filter((o) => o.label.length > 0 && o.text.length > 0)

  if (normalizedOptions.length === 0) return questionText

  const header = language === 'fr' ? 'Propositions :' : 'Options:'
  const optionLines = normalizedOptions.map((o) => `${o.label}. ${o.text}`)

  return [questionText, header, ...optionLines].filter(Boolean).join('\n')
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
  audioUrl?: string
  audioSpeed?: number
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
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
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
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.3)
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const lastAutoPlayedAudioId = useRef<string | null>(null)
  const chatAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const [chatRecording, setChatRecording] = useState(false)
  const [chatRecordingSeconds, setChatRecordingSeconds] = useState(0)
  const chatRecordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chatMediaStreamRef = useRef<MediaStream | null>(null)
  const chatRecordedChunksRef = useRef<BlobPart[]>([])
  const chatInputAtRecordingStartRef = useRef<string>('')
  
  const cardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const hasLoadedProgress = useRef(false)

  // Load progress from localStorage on mount
  useEffect(() => {
    if (!mcqSetId || hasLoadedProgress.current) return
    hasLoadedProgress.current = true
    
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${mcqSetId}`)
      if (saved) {
        const progress: MCQProgress = JSON.parse(saved)
        setCurrentIndex(progress.currentIndex || 0)
        setCorrectAnswers(progress.correctAnswers || 0)
        setIncorrectAnswers(progress.incorrectAnswers || 0)
        setAnsweredQuestions(new Set(progress.answeredQuestions || []))
        setIncorrectQuestionIds(new Set(progress.incorrectQuestionIds || []))
        setMode(progress.mode || initialMode)
        setTotalTimeSeconds(progress.totalTimeSeconds || 0)
        setChatMessages(progress.chatMessages || [])
      }
    } catch (e) {
      console.error('Failed to load MCQ progress:', e)
    }
  }, [mcqSetId, initialMode])

  // Save progress to localStorage whenever relevant state changes
  useEffect(() => {
    if (!mcqSetId || !hasLoadedProgress.current) return
    
    const progress: MCQProgress = {
      currentIndex,
      correctAnswers,
      incorrectAnswers,
      answeredQuestions: Array.from(answeredQuestions),
      incorrectQuestionIds: Array.from(incorrectQuestionIds),
      mode,
      totalTimeSeconds,
      chatMessages,
    }
    
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${mcqSetId}`, JSON.stringify(progress))
    } catch (e) {
      console.error('Failed to save MCQ progress:', e)
    }
  }, [mcqSetId, currentIndex, correctAnswers, incorrectAnswers, answeredQuestions, incorrectQuestionIds, mode, totalTimeSeconds, chatMessages])

  const getActiveQuestions = useCallback(() => {
    if (mode === 'review') {
      return questions.filter(q => incorrectQuestionIds.has(q.id || ''))
    }
    return questions
  }, [mode, questions, incorrectQuestionIds])

  const activeQuestions = getActiveQuestions()
  const currentQuestion = activeQuestions[currentIndex]
  const lastChatQuestionIdRef = useRef<string | null>(null)
  const questionTtsText = useMemo(() => buildQuestionTtsText(currentQuestion, ttsLanguage), [currentQuestion, ttsLanguage])
  const effectiveCorrectOptions: string[] = (() => {
    if (!currentQuestion) return []
    if (Array.isArray(currentQuestion.correctOptions) && currentQuestion.correctOptions.length > 0) {
      return currentQuestion.correctOptions
    }
    if (currentQuestion.correctOption) return [currentQuestion.correctOption]
    return []
  })()
  const effectiveQuestionType: 'scq' | 'mcq' =
    currentQuestion?.questionType === 'mcq' || effectiveCorrectOptions.length > 1 ? 'mcq' : 'scq'
  const isCorrect = (() => {
    if (!currentQuestion) return false
    if (effectiveQuestionType === 'scq') {
      const sel = Array.from(selectedOptions)
      return sel.length === 1 && sel[0] === effectiveCorrectOptions[0]
    }
    // mcq: exact set match
    if (selectedOptions.size === 0) return false
    if (selectedOptions.size !== effectiveCorrectOptions.length) return false
    return effectiveCorrectOptions.every(o => selectedOptions.has(o))
  })()
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

  // Keep assistant context in sync with the currently displayed question.
  // We reset chat thread when question changes to avoid the model continuing the previous question thread.
  useEffect(() => {
    const qid = currentQuestion?.id || null
    if (!qid) return
    if (lastChatQuestionIdRef.current === null) {
      lastChatQuestionIdRef.current = qid
      return
    }
    if (lastChatQuestionIdRef.current !== qid) {
      lastChatQuestionIdRef.current = qid
      setChatInput('')
      setChatError(null)
      setChatMessages([])
      lastAutoPlayedAudioId.current = null
      chatAudioRefs.current = {}
    }
  }, [currentQuestion?.id])

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
        case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
          if (hasChecked) break
          const idx = e.key === '0' ? 9 : (parseInt(e.key) - 1)
          const opt = currentQuestion?.options?.[idx]
          if (opt) {
            setSelectedOptions(prev => {
              const next = new Set(prev)
              if (effectiveQuestionType === 'mcq') {
                if (next.has(opt.label)) next.delete(opt.label)
                else next.add(opt.label)
              } else {
                next.clear()
                next.add(opt.label)
              }
              return next
            })
          }
          break
        }
        case 'a': case 'A':
        case 'b': case 'B':
        case 'c': case 'C':
        case 'd': case 'D':
        case 'e': case 'E':
        case 'f': case 'F':
        case 'g': case 'G':
        case 'h': case 'H':
        case 'i': case 'I':
        case 'j': case 'J': {
          if (hasChecked) break
          const label = e.key.toUpperCase()
          const opt = currentQuestion?.options?.find(o => o.label === label)
          if (opt) {
            setSelectedOptions(prev => {
              const next = new Set(prev)
              if (effectiveQuestionType === 'mcq') {
                if (next.has(label)) next.delete(label)
                else next.add(label)
              } else {
                next.clear()
                next.add(label)
              }
              return next
            })
          }
          break
        }
        case 'Enter':
          if (!hasChecked && selectedOptions.size > 0) handleCheck()
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
  }, [hasChecked, selectedOptions, currentIndex, activeQuestions.length, currentQuestion, effectiveQuestionType])

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (showChatSidebar && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, showChatSidebar])

  // Auto-play the last assistant audio (when provided)
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1]
    if (!last || last.role !== 'assistant' || !last.audioUrl) return
    if (lastAutoPlayedAudioId.current === last.id) return
    lastAutoPlayedAudioId.current = last.id
    try {
      const base = Number(last.audioSpeed) || 1.3
      const el = chatAudioRefs.current[last.id]
      if (el) {
        el.dataset.baseSpeed = String(base)
        el.playbackRate = ttsSpeed / base
        el.play().catch(() => {})
      } else {
        const audio = new Audio(last.audioUrl)
        audio.playbackRate = ttsSpeed / base
        audio.play().catch(() => {})
      }
    } catch {
      // ignore
    }
  }, [chatMessages, ttsSpeed])

  // Apply speed changes live to any rendered chat audio elements
  useEffect(() => {
    for (const id of Object.keys(chatAudioRefs.current)) {
      const el = chatAudioRefs.current[id]
      if (!el) continue
      const base = Number(el.dataset.baseSpeed) || 1.3
      el.playbackRate = ttsSpeed / base
    }
  }, [ttsSpeed])

  const handleSendChat = async (messageOverride?: string) => {
    const message = (typeof messageOverride === 'string' ? messageOverride : chatInput).trim()
    if (!message || chatSending || !mcqSetId) return

    // mcqSetId is also used as a localStorage key; for "study selected" we suffix it with :sessionId.
    // The API route expects the real MCQ set UUID only.
    const apiMcqSetId = mcqSetId.includes(':') ? mcqSetId.split(':')[0] : mcqSetId

    const userMessage = message
    setChatInput('')
    setChatSending(true)
    setChatError(null)

    const tempMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
    }
    setChatMessages(prev => [...prev, tempMessage])

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
        setChatError('Not authenticated')
        return
      }

      const response = await fetch(`/api/mcq/${apiMcqSetId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          currentQuestion: currentQuestion,
          userState: {
            mode,
            currentIndex,
            totalQuestions: activeQuestions.length,
            selectedOptions: Array.from(selectedOptions),
            hasChecked,
            isCorrect,
            ttsLanguage,
            ttsSpeed,
          },
          conversationHistory: chatMessages.slice(-10),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          audioUrl: data?.tts?.audioUrl,
          audioSpeed: data?.tts?.speed,
        }
        setChatMessages(prev => [...prev, assistantMessage])
      } else {
        setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
        setChatError(data?.error || data?.details || 'Something went wrong. Please try again.')
      }
    } catch (error) {
      console.error('Chat error:', error)
      setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
      setChatError('Something went wrong. Please try again.')
    } finally {
      setChatSending(false)
    }
  }

  const getExplainCorrectAnswersPrompt = useCallback(() => {
    if (ttsLanguage === 'fr') {
      return `Explique-moi les bonnes réponses de ce QCM. Commence par les bonnes options, puis explique brièvement pourquoi les autres options sont fausses. Utilise un langage simple.`
    }
    return `Explain the correct answers for this MCQ. Start with the correct option(s), then briefly explain why the other options are wrong. Use simple language.`
  }, [ttsLanguage])

  const formatChatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const stopChatRecording = useCallback(() => {
    try {
      if (chatMediaRecorderRef.current && chatMediaRecorderRef.current.state !== 'inactive') {
        chatMediaRecorderRef.current.stop()
      }
    } catch {}
    try {
      chatMediaStreamRef.current?.getTracks()?.forEach(t => t.stop())
    } catch {}
    chatMediaStreamRef.current = null
    chatMediaRecorderRef.current = null
    if (chatRecordingTimerRef.current) {
      clearInterval(chatRecordingTimerRef.current)
      chatRecordingTimerRef.current = null
    }
    setChatRecording(false)
    setChatRecordingSeconds(0)
  }, [])

  const transcribeChatAudioBlob = useCallback(async (blob: Blob) => {
    const audioBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read audio'))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })

    const resp = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type,
        language: ttsLanguage === 'fr' ? 'fr' : 'en',
      }),
    })

    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(data?.error || data?.details || 'Failed to transcribe audio')
    }
    return String(data?.text || '').trim()
  }, [ttsLanguage])

  const startChatRecording = useCallback(async () => {
    if (chatRecording || chatSending) return
    if (!navigator?.mediaDevices?.getUserMedia) {
      setChatError('Voice input is not supported in this browser.')
      return
    }

    chatInputAtRecordingStartRef.current = chatInput
    chatRecordedChunksRef.current = []
    setChatError(null)

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chatMediaStreamRef.current = stream

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    const mimeType = candidates.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chatMediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chatRecordedChunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      try {
        const blob = new Blob(chatRecordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 1024) return
        const transcript = await transcribeChatAudioBlob(blob)
        if (!transcript) return

        const inputAtStart = chatInputAtRecordingStartRef.current.trim()
        if (!inputAtStart) {
          await handleSendChat(transcript)
        } else {
          setChatInput(prev => (prev.trim().length ? `${prev.trim()} ${transcript}` : transcript))
          chatInputRef.current?.focus()
        }
      } catch (e: any) {
        setChatError(e?.message || 'Failed to transcribe audio')
      }
    }

    recorder.start(250)
    setChatRecording(true)
    setChatRecordingSeconds(0)
    chatRecordingTimerRef.current = setInterval(() => setChatRecordingSeconds(s => s + 1), 1000)
  }, [chatRecording, chatSending, chatInput, transcribeChatAudioBlob, ttsLanguage])

  // Cleanup voice recording on unmount
  useEffect(() => {
    return () => {
      try {
        if (chatMediaRecorderRef.current && chatMediaRecorderRef.current.state !== 'inactive') {
          chatMediaRecorderRef.current.stop()
        }
      } catch {}
      try {
        chatMediaStreamRef.current?.getTracks()?.forEach(t => t.stop())
      } catch {}
      if (chatRecordingTimerRef.current) clearInterval(chatRecordingTimerRef.current)
    }
  }, [])

  const clearChat = () => {
    setChatMessages([])
  }

  // Global shortcut: Option/Alt + Enter sends a quick prompt for the CURRENT question (when chat is open)
  useEffect(() => {
    if (!showChatSidebar) return
    const onKeyDown = (e: KeyboardEvent) => {
      // avoid firing while typing inside inputs (textarea handles it)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault()
        const prompt = getExplainCorrectAnswersPrompt()
        handleSendChat(prompt)
        chatInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showChatSidebar, getExplainCorrectAnswersPrompt])

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
    if (selectedOptions.size === 0 || !currentQuestion) return
    
    setHasChecked(true)
    const questionId = currentQuestion.id || `q-${currentIndex}`
    
    if (!answeredQuestions.has(questionId)) {
      setAnsweredQuestions(prev => new Set(prev).add(questionId))
      
      if (isCorrect) {
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
      setSelectedOptions(new Set())
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
      setSelectedOptions(new Set())
      setHasChecked(false)
    }
  }

  const handleModeChange = (newMode: MCQMode) => {
    setMode(newMode)
    setCurrentIndex(0)
    setSelectedOptions(new Set())
    setHasChecked(false)
    setIsComplete(false)
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedOptions(new Set())
    setHasChecked(false)
    setCorrectAnswers(0)
    setIncorrectAnswers(0)
    setTotalTimeSeconds(0)
    setAnsweredQuestions(new Set())
    setIncorrectQuestionIds(new Set())
    setIsComplete(false)
    setChatMessages([])
    // Clear saved progress
    if (mcqSetId) {
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${mcqSetId}`)
      } catch (e) {
        console.error('Failed to clear MCQ progress:', e)
      }
    }
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
                      Chat
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
                    speed={ttsSpeed}
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
                  text={questionTtsText} 
                  language={ttsLanguage}
                  speed={ttsSpeed}
                  size="md"
                  showLanguageToggle
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedOptions.has(option.label)
                  const showResult = hasChecked
                  const isCorrectOption = effectiveCorrectOptions.includes(option.label)

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
                      onClick={() => {
                        if (hasChecked) return
                        setSelectedOptions(prev => {
                          const next = new Set(prev)
                          if (effectiveQuestionType === 'mcq') {
                            if (next.has(option.label)) next.delete(option.label)
                            else next.add(option.label)
                          } else {
                            next.clear()
                            next.add(option.label)
                          }
                          return next
                        })
                      }}
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
                            speed={ttsSpeed}
                            size="sm"
                          />
                        )}
                      </div>
                      {!isCorrect && (
                        <p className="text-sm text-text-secondary mb-2">
                          Correct answer: <span className="font-medium text-text-primary">{effectiveCorrectOptions.join(', ')}</span>
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
                      speed={ttsSpeed}
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
                    disabled={selectedOptions.size === 0}
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
              <div className="flex items-center gap-2 border border-border px-2 py-1">
                <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                  {ttsLanguage === 'fr' ? 'Vitesse' : 'Speed'}
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={ttsSpeed}
                  onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                  className="w-28"
                />
                <span className="text-[10px] mono text-text-tertiary min-w-[44px] text-right">
                  {ttsSpeed.toFixed(2)}x
                </span>
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

      {/* Chat Sidebar */}
      {showChatSidebar && mcqSetId && !isComplete && (
        <div className="w-96 flex-shrink-0">
          <div className="sticky top-4">
            <div className="border border-border h-[calc(100vh-8rem)] flex flex-col bg-background">
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                  <FiMessageCircle className="w-4 h-4 text-indigo-500" />
                  Study Assistant
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
                      {message.role === 'user' ? (
                        <p className="whitespace-pre-wrap text-text-primary">{message.content}</p>
                      ) : (
                        <div className="prose prose-sm prose-invert max-w-none text-text-primary prose-headings:text-text-primary prose-headings:font-medium prose-headings:mt-3 prose-headings:mb-2 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-text-primary prose-code:text-text-primary prose-code:bg-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                      {message.role === 'assistant' && message.audioUrl && (
                        <div className="mt-2">
                          <audio
                            controls
                            preload="none"
                            src={message.audioUrl}
                            ref={(el) => {
                              chatAudioRefs.current[message.id] = el
                              if (el) el.dataset.baseSpeed = String(Number(message.audioSpeed) || 1.3)
                            }}
                            onPlay={(e) => {
                              const el = e.currentTarget
                              const base = Number(el.dataset.baseSpeed) || 1.3
                              el.playbackRate = ttsSpeed / base
                            }}
                            onLoadedMetadata={(e) => {
                              const el = e.currentTarget
                              const base = Number(el.dataset.baseSpeed) || 1.3
                              el.playbackRate = ttsSpeed / base
                            }}
                            className="w-full"
                          />
                        </div>
                      )}
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
                {chatError && (
                  <div className="mb-3 p-2 border border-error/30 bg-error/10 text-error text-xs">
                    {chatError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => (chatRecording ? stopChatRecording() : startChatRecording())}
                    disabled={chatSending}
                    className={`w-10 h-10 flex items-center justify-center border transition-colors disabled:opacity-30 ${
                      chatRecording
                        ? 'bg-error text-white border-error animate-pulse'
                        : 'bg-background text-text-secondary border-border hover:text-text-primary hover:border-text-primary'
                    }`}
                    title={chatRecording ? 'Stop recording' : 'Voice input (Cmd/Ctrl+Enter)'}
                  >
                    {chatRecording ? <FiStopCircle className="w-4 h-4" /> : <FiMic className="w-4 h-4" />}
                  </button>
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.altKey) {
                        e.preventDefault()
                        const prompt = getExplainCorrectAnswersPrompt()
                        handleSendChat(prompt)
                        return
                      }
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        if (chatRecording) stopChatRecording()
                        else startChatRecording()
                        return
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendChat()
                      }
                    }}
                    placeholder={chatRecording ? 'Listening…' : 'Ask about this question...'}
                    rows={1}
                    className="flex-1 px-3 py-2 border border-border bg-background text-sm resize-none focus:outline-none focus:border-text-primary"
                    disabled={chatSending}
                    style={{ minHeight: '40px', maxHeight: '100px' }}
                  />
                  <button
                    onClick={() => handleSendChat()}
                    disabled={!chatInput.trim() || chatSending}
                    className="w-10 h-10 bg-indigo-500 text-white flex items-center justify-center disabled:opacity-30 transition-opacity"
                  >
                    <FiSend className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-text-tertiary">
                  {chatRecording
                    ? `Recording… ${formatChatRecordingTime(chatRecordingSeconds)} · Cmd/Ctrl+Enter or mic to stop`
                    : 'Enter: send · Shift+Enter: new line · Cmd/Ctrl+Enter: voice · Option/Alt+Enter: explain correct answers'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
