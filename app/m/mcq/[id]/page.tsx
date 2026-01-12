'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { 
  FiChevronLeft, 
  FiChevronRight,
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
  FiInfo,
  FiVolume2,
  FiGlobe,
  FiMessageCircle,
  FiSend,
  FiMic,
  FiStopCircle
} from 'react-icons/fi'
import { SpeakButton } from '@/components/mobile/TextToSpeech'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Persistence key prefix for localStorage
const STORAGE_KEY_PREFIX = 'mcq_mobile_progress_'

interface MCQProgress {
  currentIndex: number
  correctAnswers: number
  incorrectAnswers: number
  answeredQuestions: string[]
  incorrectQuestionIds: string[]
  mode: MCQMode
  totalTimeSeconds: number
  chatMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
}

interface MCQQuestion {
  id?: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption?: string
  correctOptions?: string[]
  questionType?: 'scq' | 'mcq'
  explanation?: string
  lesson_card?: {
    title: string
    conceptOverview: string
    keyPoints?: string[]
    detailedExplanation?: string
    examples?: string[]
    commonMistakes?: string[]
  }
}

type MCQMode = 'study' | 'test' | 'challenge' | 'review'

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function MobileMCQViewerPage() {
  const params = useParams()
  const router = useRouter()
  const mcqSetId = params.id as string
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  // Data state
  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSessionQuestionIds, setActiveSessionQuestionIds] = useState<string[] | null>(null)

  // Quiz state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [hasChecked, setHasChecked] = useState(false)
  const [mode, setMode] = useState<MCQMode>('test')
  
  // Score state
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [incorrectAnswers, setIncorrectAnswers] = useState(0)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [incorrectQuestionIds, setIncorrectQuestionIds] = useState<Set<string>>(new Set())
  const [isComplete, setIsComplete] = useState(false)
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(0)
  const [shuffledQuestions, setShuffledQuestions] = useState<MCQQuestion[]>([])
  
  // Challenge mode
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(30)
  
  // UI state
  const [showLessonSheet, setShowLessonSheet] = useState(false)
  const [showExplanationSheet, setShowExplanationSheet] = useState(false)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [showTTSSelector, setShowTTSSelector] = useState(false)
  const [ttsLanguage, setTtsLanguage] = useState<'en' | 'fr'>('en')
  const [isStudyMaterialExpanded, setIsStudyMaterialExpanded] = useState(false)

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; audioUrl?: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const lastAutoPlayedAudioId = useRef<string | null>(null)
  const [chatRecording, setChatRecording] = useState(false)
  const [chatRecordingSeconds, setChatRecordingSeconds] = useState(0)
  const chatRecordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chatMediaStreamRef = useRef<MediaStream | null>(null)
  const chatRecordedChunksRef = useRef<BlobPart[]>([])
  const chatInputAtRecordingStartRef = useRef<string>('')

  // Touch handling
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const hasLoadedProgress = useRef(false)

  useEffect(() => {
    loadMCQSet()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [mcqSetId, sessionId])

  // Load progress from localStorage after questions are loaded
  useEffect(() => {
    if (!mcqSetId || questions.length === 0 || hasLoadedProgress.current) return
    hasLoadedProgress.current = true
    
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${mcqSetId}`)
      if (saved) {
        const progress: MCQProgress = JSON.parse(saved)
        setCurrentIndex(Math.min(progress.currentIndex || 0, questions.length - 1))
        setCorrectAnswers(progress.correctAnswers || 0)
        setIncorrectAnswers(progress.incorrectAnswers || 0)
        setAnsweredQuestions(new Set(progress.answeredQuestions || []))
        setIncorrectQuestionIds(new Set(progress.incorrectQuestionIds || []))
        setMode(progress.mode || 'test')
        setTotalTimeSeconds(progress.totalTimeSeconds || 0)
        setChatMessages(progress.chatMessages || [])
        // Re-shuffle for test/challenge modes with loaded state
        if (progress.mode === 'test' || progress.mode === 'challenge') {
          setShuffledQuestions(shuffleArray(questions))
        }
      }
    } catch (e) {
      console.error('Failed to load MCQ progress:', e)
    }
  }, [mcqSetId, questions])

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

  useEffect(() => {
    if (mode === 'challenge') {
      setChallengeTimeLeft(30)
    }
  }, [currentIndex, mode])

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (chatOpen && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, chatOpen])

  // Auto-play last assistant audio
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1]
    if (!last || last.role !== 'assistant' || !last.audioUrl) return
    if (lastAutoPlayedAudioId.current === last.id) return
    lastAutoPlayedAudioId.current = last.id
    try {
      const audio = new Audio(last.audioUrl)
      audio.play().catch(() => {})
    } catch {}
  }, [chatMessages])

  const handleSendChat = async (messageOverride?: string) => {
    const message = (typeof messageOverride === 'string' ? messageOverride : chatInput).trim()
    if (!message || chatSending) return

    const userMessage = message
    setChatInput('')
    setChatSending(true)
    setChatError(null)

    const tempMessage = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
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

      const response = await fetch(`/api/mcq/${mcqSetId}/chat`, {
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
          },
          conversationHistory: chatMessages.slice(-10),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        const assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant' as const,
          content: data.response,
          audioUrl: data?.tts?.audioUrl,
        }
        setChatMessages(prev => [...prev, assistantMessage])
      } else {
        setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
        setChatError(data?.error || data?.details || 'AI assistant failed to respond')
      }
    } catch (error) {
      console.error('Chat error:', error)
      setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id))
      setChatError((error as any)?.message || 'AI assistant failed to respond')
    } finally {
      setChatSending(false)
    }
  }

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
  }, [chatRecording, chatSending, chatInput, transcribeChatAudioBlob])

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
        let loadedQuestions: MCQQuestion[] = data.questions || []

        if (sessionId) {
          const sessionRes = await fetch(
            `/api/mcq/${mcqSetId}/session?sessionId=${encodeURIComponent(sessionId)}`,
            { headers: { 'Authorization': `Bearer ${session.access_token}` } }
          )
          const sessionData = await sessionRes.json()
          const ids: string[] | null =
            sessionRes.ok && Array.isArray(sessionData.session?.question_ids)
              ? sessionData.session.question_ids
              : null

          if (ids && ids.length > 0) {
            setActiveSessionQuestionIds(ids)
            const byId = new Map(loadedQuestions.map((q: any) => [q.id, q]))
            loadedQuestions = ids.map(id => byId.get(id)).filter(Boolean) as MCQQuestion[]
          } else {
            setActiveSessionQuestionIds(null)
          }
        } else {
          setActiveSessionQuestionIds(null)
        }

        setQuestions(loadedQuestions)
        // Shuffle questions for test/challenge modes
        setShuffledQuestions(shuffleArray(loadedQuestions))
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
    // Use shuffled questions for test and challenge modes
    if (mode === 'test' || mode === 'challenge') {
      return shuffledQuestions.length > 0 ? shuffledQuestions : questions
    }
    // Study mode uses original order
    return questions
  }, [mode, questions, incorrectQuestionIds, shuffledQuestions])

  const activeQuestions = getActiveQuestions()
  const currentQuestion = activeQuestions[currentIndex]
  const effectiveCorrectOptions: string[] = (() => {
    if (!currentQuestion) return []
    if (Array.isArray(currentQuestion.correctOptions) && currentQuestion.correctOptions.length > 0) return currentQuestion.correctOptions
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
    if (selectedOptions.size === 0) return false
    if (selectedOptions.size !== effectiveCorrectOptions.length) return false
    return effectiveCorrectOptions.every(o => selectedOptions.has(o))
  })()
  const progress = activeQuestions.length > 0 ? ((currentIndex + 1) / activeQuestions.length) * 100 : 0
  const accuracy = (correctAnswers + incorrectAnswers) > 0 
    ? Math.round((correctAnswers / (correctAnswers + incorrectAnswers)) * 100) 
    : 0
  const hasLessonCard = currentQuestion?.lesson_card

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
      setShowLessonSheet(false)
      setShowExplanationSheet(false)
      setIsStudyMaterialExpanded(false)
    } else {
      setIsComplete(true)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setSelectedOptions(new Set())
      setHasChecked(false)
      setShowLessonSheet(false)
      setShowExplanationSheet(false)
      setIsStudyMaterialExpanded(false)
    }
  }

  const handleModeChange = (newMode: MCQMode) => {
    setMode(newMode)
    setCurrentIndex(0)
    setSelectedOptions(new Set())
    setHasChecked(false)
    setIsComplete(false)
    setShowModeSelector(false)
    setShowLessonSheet(false)
    setShowExplanationSheet(false)
    setIsStudyMaterialExpanded(false)
    // Reshuffle when switching to test or challenge mode
    if (newMode === 'test' || newMode === 'challenge') {
      setShuffledQuestions(shuffleArray(questions))
    }
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
    setShowLessonSheet(false)
    setShowExplanationSheet(false)
    setIsStudyMaterialExpanded(false)
    setChatMessages([])
    // Reshuffle on restart for test/challenge modes
    if (mode === 'test' || mode === 'challenge') {
      setShuffledQuestions(shuffleArray(questions))
    }
    // Clear saved progress
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${mcqSetId}`)
    } catch (e) {
      console.error('Failed to clear MCQ progress:', e)
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
    touchStartY.current = e.targetTouches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const diffX = touchStartX.current - touchEndX
    const diffY = touchStartY.current - touchEndY
    
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0 && hasChecked) handleNext()
      else if (diffX < 0) handlePrevious()
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getModeColor = (m: MCQMode) => {
    switch (m) {
      case 'study': return 'var(--color-mode-study)'
      case 'test': return 'var(--color-mode-test)'
      case 'challenge': return 'var(--color-mode-challenge)'
      case 'review': return 'var(--color-mode-review)'
    }
  }

  const getModeLabel = (m: MCQMode) => {
    switch (m) {
      case 'study': return 'Study'
      case 'test': return 'Test'
      case 'challenge': return 'Challenge'
      case 'review': return 'Review'
    }
  }

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
            Back
          </button>
        </div>
      </div>
    )
  }

  // No questions in review mode
  if (activeQuestions.length === 0 && mode === 'review') {
    return (
      <div className="mobile-app">
        <header className="mobile-header">
          <button onClick={() => router.push('/m/mcq')} className="mobile-header-action">
            <FiChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <h1 className="mobile-header-title">{mcqSet.name}</h1>
          <div className="w-12" />
        </header>
        <div className="mobile-content flex items-center justify-center">
          <div className="text-center p-6">
            <div className="w-16 h-16 border border-[var(--color-border)] flex items-center justify-center mx-auto mb-4">
              <FiCheck className="w-8 h-8 text-[var(--color-success)]" strokeWidth={1.5} />
            </div>
            <h3 className="font-medium mb-2">No mistakes to review</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">Great job! You haven't missed any questions.</p>
            <button onClick={() => handleModeChange('test')} className="btn-mobile btn-primary-mobile">
              Back to Test Mode
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Results Screen
  if (isComplete) {
    const getAccuracyColor = () => {
      if (accuracy >= 80) return 'var(--color-success)'
      if (accuracy >= 60) return 'var(--color-warning)'
      return 'var(--color-error)'
    }

    return (
      <div className="mobile-app">
        <header className="mobile-header">
          <button onClick={() => router.push('/m/mcq')} className="mobile-header-action">
            <FiChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <h1 className="mobile-header-title">Results</h1>
          <div className="w-12" />
        </header>

        <div className="mobile-content px-4 py-8" style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top) + 32px)' }}>
          {/* Score Display */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 border-2 mx-auto mb-4 flex items-center justify-center" style={{ borderColor: getAccuracyColor() }}>
              <span className="text-3xl font-semibold mono" style={{ color: getAccuracyColor() }}>{accuracy}%</span>
            </div>
            <h2 className="text-xl font-semibold mb-1">
              {accuracy >= 80 ? 'Excellent!' : accuracy >= 60 ? 'Good job!' : 'Keep practicing'}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mono uppercase tracking-wider">
              Completed in {formatTime(totalTimeSeconds)}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-px bg-[var(--color-border)] mb-8">
            <div className="bg-[var(--color-bg)] p-4 text-center">
              <span className="block text-2xl font-semibold mono text-[var(--color-success)]">{correctAnswers}</span>
              <span className="text-[9px] text-[var(--color-text-secondary)] uppercase tracking-wider">Correct</span>
            </div>
            <div className="bg-[var(--color-bg)] p-4 text-center">
              <span className="block text-2xl font-semibold mono text-[var(--color-error)]">{incorrectAnswers}</span>
              <span className="text-[9px] text-[var(--color-text-secondary)] uppercase tracking-wider">Wrong</span>
            </div>
            <div className="bg-[var(--color-bg)] p-4 text-center">
              <span className="block text-2xl font-semibold mono">{activeQuestions.length}</span>
              <span className="text-[9px] text-[var(--color-text-secondary)] uppercase tracking-wider">Total</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button onClick={handleRestart} className="btn-mobile btn-primary-mobile w-full">
              <FiRotateCcw className="w-4 h-4" strokeWidth={1.5} />
              Try Again
            </button>
            
            {incorrectQuestionIds.size > 0 && mode !== 'review' && (
              <button 
                onClick={() => handleModeChange('review')}
                className="btn-mobile w-full flex items-center justify-center gap-2 py-3.5"
                style={{ 
                  background: 'var(--color-mode-review-soft)', 
                  color: 'var(--color-mode-review)',
                  border: '1px solid var(--color-mode-review)'
                }}
              >
                <FiRotateCcw className="w-4 h-4" strokeWidth={1.5} />
                Review Mistakes ({incorrectQuestionIds.size})
              </button>
            )}
            
            <button 
              onClick={() => router.push('/m/mcq')}
              className="btn-mobile btn-secondary-mobile w-full"
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
    <div className="mobile-app" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Header */}
      <header className="mobile-header">
        <button onClick={() => router.push('/m/mcq')} className="mobile-header-action">
          <FiChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h1 className="text-xs font-medium uppercase tracking-wider truncate">{mcqSet.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* TTS Language Toggle */}
          <button
            onClick={() => setTtsLanguage(ttsLanguage === 'en' ? 'fr' : 'en')}
            className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider border border-[var(--color-border)]"
          >
            <FiVolume2 className="w-3 h-3" strokeWidth={1.5} />
            {ttsLanguage.toUpperCase()}
          </button>
          {/* Chat Button */}
          <button 
            onClick={() => setChatOpen(true)}
            className="p-2 border border-[var(--color-border)] relative"
          >
            <FiMessageCircle className="w-4 h-4" strokeWidth={1.5} />
            {chatMessages.length > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[var(--color-text)]" />
            )}
          </button>
          {/* Mode Selector */}
          <button 
            onClick={() => setShowModeSelector(true)}
            className="px-2 py-1 text-[10px] uppercase tracking-wider border"
            style={{ 
              color: getModeColor(mode),
              borderColor: getModeColor(mode),
              background: `${getModeColor(mode)}15`
            }}
          >
            {getModeLabel(mode)}
          </button>
        </div>
      </header>

      {/* Content */}
      <div 
        className="mobile-content-full flex flex-col"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top))' }}
      >
        {/* Progress & Stats Bar */}
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          {/* Progress Bar */}
          <div className="h-1 bg-[var(--color-border)] mb-3">
            <div 
              className="h-full transition-all duration-300"
              style={{ 
                width: `${progress}%`,
                background: getModeColor(mode)
              }}
            />
          </div>
          
          {/* Stats Row */}
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span className="text-[var(--color-text-secondary)] mono">
              {currentIndex + 1} / {activeQuestions.length}
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-[var(--color-success)]">
                <FiCheck className="w-3 h-3" strokeWidth={2} />
                {correctAnswers}
              </span>
              <span className="flex items-center gap-1 text-[var(--color-error)]">
                <FiX className="w-3 h-3" strokeWidth={2} />
                {incorrectAnswers}
              </span>
              {(correctAnswers + incorrectAnswers) > 0 && (
                <span className="flex items-center gap-1" style={{ color: accuracy >= 70 ? 'var(--color-success)' : 'var(--color-error)' }}>
                  <FiTrendingUp className="w-3 h-3" strokeWidth={1.5} />
                  {accuracy}%
                </span>
              )}
              <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                <FiClock className="w-3 h-3" strokeWidth={1.5} />
                {formatTime(totalTimeSeconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Challenge Timer */}
        {mode === 'challenge' && !hasChecked && (
          <div className="px-4 py-3 border-b" style={{ borderColor: challengeTimeLeft <= 10 ? 'var(--color-error)' : 'var(--color-mode-challenge)', background: challengeTimeLeft <= 10 ? 'var(--color-error-soft)' : 'var(--color-mode-challenge-soft)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: challengeTimeLeft <= 10 ? 'var(--color-error)' : 'var(--color-mode-challenge)' }}>Time Remaining</span>
              <span className="text-xl font-semibold mono" style={{ color: challengeTimeLeft <= 10 ? 'var(--color-error)' : 'var(--color-mode-challenge)' }}>
                {challengeTimeLeft}s
              </span>
            </div>
            <div className="h-1 bg-[var(--color-border)]">
              <div
                className="h-full transition-all duration-1000"
                style={{ 
                  width: `${(challengeTimeLeft / 30) * 100}%`,
                  background: challengeTimeLeft <= 10 ? 'var(--color-error)' : 'var(--color-mode-challenge)'
                }}
              />
            </div>
          </div>
        )}

        {/* Study Mode: Lesson Card Preview */}
        {mode === 'study' && !hasChecked && hasLessonCard && (
          <button
            onClick={() => setShowLessonSheet(true)}
            className="mx-4 mt-4 p-4 border text-left"
            style={{ borderColor: 'var(--color-mode-study)', background: 'var(--color-mode-study-soft)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FiBook className="w-4 h-4" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--color-mode-study)' }}>Study First</span>
              </div>
              <FiChevronRight className="w-4 h-4" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
            </div>
            <h4 className="font-medium text-sm text-[var(--color-text)]">{currentQuestion.lesson_card?.title}</h4>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2">
              {currentQuestion.lesson_card?.conceptOverview}
            </p>
          </button>
        )}

        {/* Question */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex items-start gap-3 mb-6">
            <h2 className="flex-1 text-base font-medium text-[var(--color-text)] leading-relaxed">
              {currentQuestion?.question}
            </h2>
            <SpeakButton 
              text={currentQuestion?.question || ''} 
              language={ttsLanguage}
              size="sm"
            />
          </div>

            {/* Options */}
          <div className="space-y-2">
            {currentQuestion?.options.map((option, index) => {
                const isSelected = selectedOptions.has(option.label)
                const showResult = hasChecked
                const isCorrectOption = effectiveCorrectOptions.includes(option.label)

              let borderColor = 'var(--color-border)'
              let bgColor = 'transparent'
              let textColor = 'var(--color-text)'

                if (showResult) {
                if (isCorrectOption) {
                  borderColor = 'var(--color-success)'
                  bgColor = 'var(--color-success-soft)'
                  textColor = 'var(--color-success)'
                } else if (isSelected) {
                  borderColor = 'var(--color-error)'
                  bgColor = 'var(--color-error-soft)'
                  textColor = 'var(--color-text-secondary)'
                }
              } else if (isSelected) {
                borderColor = 'var(--color-text)'
                bgColor = 'var(--color-surface)'
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
                  className="w-full flex items-start gap-3 p-4 text-left transition-colors"
                  style={{ border: `1px solid ${borderColor}`, background: bgColor }}
                  >
                  <span 
                    className="w-6 h-6 flex items-center justify-center text-xs font-medium mono flex-shrink-0"
                    style={{ 
                      border: `1px solid ${showResult && isCorrectOption ? 'var(--color-success)' : showResult && isSelected ? 'var(--color-error)' : borderColor}`,
                      background: showResult && isCorrectOption ? 'var(--color-success)' : showResult && isSelected ? 'var(--color-error)' : isSelected ? 'var(--color-text)' : 'transparent',
                      color: showResult && (isCorrectOption || isSelected) ? 'var(--color-bg)' : isSelected ? 'var(--color-bg)' : textColor
                    }}
                  >
                    {showResult && isCorrectOption ? <FiCheck className="w-3 h-3" strokeWidth={2.5} /> : 
                     showResult && isSelected && !isCorrect ? <FiX className="w-3 h-3" strokeWidth={2.5} /> : 
                     option.label}
                    </span>
                  <span className="flex-1 text-sm" style={{ color: textColor }}>{option.text}</span>
                  <span className="text-[10px] mono" style={{ color: 'var(--color-text-tertiary)' }}>{index + 1}</span>
                  </button>
                )
              })}
            </div>

          {/* Study Mode: Inline Collapsible Lesson Card */}
          {mode === 'study' && hasLessonCard && (
            <div className="mt-4">
              <button
                onClick={() => setIsStudyMaterialExpanded(!isStudyMaterialExpanded)}
                className="w-full p-4 border text-left transition-all"
                style={{ 
                  borderColor: 'var(--color-mode-study)', 
                  background: 'var(--color-mode-study-soft)' 
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FiBook className="w-4 h-4" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
                    <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--color-mode-study)' }}>Study Material</span>
                  </div>
                  <FiChevronRight 
                    className="w-4 h-4 transition-transform" 
                    style={{ 
                      color: 'var(--color-mode-study)',
                      transform: isStudyMaterialExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                    }} 
                    strokeWidth={1.5} 
                  />
                </div>
                <h4 className="font-medium text-sm text-[var(--color-text)]">{currentQuestion.lesson_card?.title}</h4>
                {!isStudyMaterialExpanded && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                    {currentQuestion.lesson_card?.conceptOverview}
                  </p>
                )}
              </button>

              {/* Expanded Content */}
              {isStudyMaterialExpanded && (
                <div className="border border-t-0 p-4 space-y-4" style={{ borderColor: 'var(--color-mode-study)' }}>
                  {/* Concept Overview */}
                  <div>
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      {currentQuestion.lesson_card?.conceptOverview}
                    </p>
                  </div>

                  {/* Key Points */}
                  {currentQuestion.lesson_card?.keyPoints && currentQuestion.lesson_card.keyPoints.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Key Points</h4>
                      <div className="space-y-2">
                        {currentQuestion.lesson_card.keyPoints.map((point, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 border border-[var(--color-border)]">
                            <FiCheck className="w-4 h-4 text-[var(--color-success)] flex-shrink-0 mt-0.5" strokeWidth={2} />
                            <p className="text-sm text-[var(--color-text-secondary)]">{point}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed Explanation */}
                  {currentQuestion.lesson_card?.detailedExplanation && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Detailed Explanation</h4>
                      <div className="p-3 border border-[var(--color-border)] bg-[var(--color-surface)]">
                        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
                          {currentQuestion.lesson_card.detailedExplanation}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Examples */}
                  {currentQuestion.lesson_card?.examples && currentQuestion.lesson_card.examples.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Examples</h4>
                      <div className="space-y-2">
                        {currentQuestion.lesson_card.examples.map((example, i) => (
                          <div key={i} className="p-3 border border-[var(--color-border)] bg-[var(--color-surface)]">
                            <p className="text-sm text-[var(--color-text-secondary)]">{example}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Common Mistakes */}
                  {currentQuestion.lesson_card?.commonMistakes && currentQuestion.lesson_card.commonMistakes.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Common Mistakes</h4>
                      <div className="space-y-2">
                        {currentQuestion.lesson_card.commonMistakes.map((mistake, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 border border-[var(--color-error)]" style={{ background: 'var(--color-error-soft)' }}>
                            <FiInfo className="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                            <p className="text-sm text-[var(--color-text-secondary)]">{mistake}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

            {/* Feedback */}
            {hasChecked && (
            <div 
              className="mt-4 p-4 border"
              style={{ 
                borderColor: isCorrect ? 'var(--color-success)' : 'var(--color-error)',
                background: isCorrect ? 'var(--color-success-soft)' : 'var(--color-error-soft)'
              }}
            >
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                  <FiCheck className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-success)' }} strokeWidth={2} />
                  ) : (
                  <FiX className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-error)' }} strokeWidth={2} />
                  )}
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: isCorrect ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {isCorrect ? 'Correct!' : 'Incorrect'}
                    </p>
                    {!isCorrect && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-error)' }}>
                      Correct: <span className="font-medium">{effectiveCorrectOptions.join(', ')}</span>
                      </p>
                    )}
                    {currentQuestion?.explanation && (
                    <div className="flex items-start gap-2 mt-2">
                      <p className="flex-1 text-xs text-[var(--color-text-secondary)]">
                        {currentQuestion.explanation}
                      </p>
                      <SpeakButton 
                        text={currentQuestion.explanation} 
                        language={ttsLanguage}
                        size="sm"
                      />
                    </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Learn More Button */}
          {hasChecked && hasLessonCard && (
              <button
              onClick={() => setShowExplanationSheet(true)}
              className="w-full mt-3 p-4 border flex items-center justify-between"
              style={{ borderColor: 'var(--color-mode-study)', background: 'var(--color-mode-study-soft)' }}
              >
                <div className="flex items-center gap-2">
                <FiBook className="w-4 h-4" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-mode-study)' }}>Learn More</span>
              </div>
              <FiChevronRight className="w-4 h-4" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
            </button>
            )}
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex gap-3">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="w-12 h-12 border border-[var(--color-border)] flex items-center justify-center disabled:opacity-30 active:bg-[var(--color-surface)]"
            >
              <FiArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>

            {!hasChecked ? (
              <button
                onClick={handleCheck}
                disabled={selectedOptions.size === 0}
                className="flex-1 h-12 bg-[var(--color-text)] text-[var(--color-bg)] font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-30"
              >
                <FiCheck className="w-4 h-4" strokeWidth={1.5} />
                Check
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex-1 h-12 bg-[var(--color-text)] text-[var(--color-bg)] font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {currentIndex < activeQuestions.length - 1 ? (
                  <>Next <FiArrowRight className="w-4 h-4" strokeWidth={1.5} /></>
                ) : (
                  <>Finish <FiAward className="w-4 h-4" strokeWidth={1.5} /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mode Selector Sheet */}
      {showModeSelector && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowModeSelector(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
            <div className="w-8 h-1 bg-[var(--color-border)] mx-auto mt-3 mb-4" />
            <div className="px-4 pb-2">
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)]">Select Mode</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { id: 'study' as MCQMode, label: 'Study', desc: 'See lesson before answering', icon: FiBook },
                { id: 'test' as MCQMode, label: 'Test', desc: 'Answer first, see lesson after', icon: FiEdit3 },
                { id: 'challenge' as MCQMode, label: 'Challenge', desc: '30 seconds per question', icon: FiZap },
                { id: 'review' as MCQMode, label: 'Review', desc: 'Focus on missed questions', icon: FiRotateCcw, disabled: incorrectQuestionIds.size === 0 },
              ].map((m) => {
                const Icon = m.icon
                const isActive = mode === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => !m.disabled && handleModeChange(m.id)}
                    disabled={m.disabled}
                    className={`w-full p-4 border text-left flex items-center gap-4 ${m.disabled ? 'opacity-40' : 'active:opacity-80'}`}
                    style={{ 
                      borderColor: isActive ? getModeColor(m.id) : 'var(--color-border)',
                      background: isActive ? `${getModeColor(m.id)}15` : 'transparent'
                    }}
                  >
                    <div 
                      className="w-10 h-10 border flex items-center justify-center"
                      style={{ borderColor: getModeColor(m.id), color: getModeColor(m.id) }}
                    >
                      <Icon className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm" style={{ color: isActive ? getModeColor(m.id) : 'var(--color-text)' }}>{m.label}</h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">{m.desc}</p>
                    </div>
                    {isActive && <FiCheck className="w-5 h-5" style={{ color: getModeColor(m.id) }} strokeWidth={2} />}
                  </button>
                )
              })}
            </div>
            <div className="h-safe-bottom" />
          </div>
        </div>
      )}

      {/* Lesson Card Sheet (Study Mode - Before Answer) */}
      {showLessonSheet && hasLessonCard && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowLessonSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] border-t border-[var(--color-border)] max-h-[85vh] flex flex-col">
            <div className="w-8 h-1 bg-[var(--color-border)] mx-auto mt-3 flex-shrink-0" />
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <FiBook className="w-5 h-5" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
                <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--color-mode-study)' }}>Study Material</span>
              </div>
              <button onClick={() => setShowLessonSheet(false)} className="p-2">
                <FiX className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-lg font-semibold">{currentQuestion.lesson_card?.title}</h3>
                  <SpeakButton 
                    text={`${currentQuestion.lesson_card?.title}. ${currentQuestion.lesson_card?.conceptOverview}`} 
                    language={ttsLanguage}
                    size="sm"
                  />
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {currentQuestion.lesson_card?.conceptOverview}
                </p>
              </div>
              
              {currentQuestion.lesson_card?.keyPoints && currentQuestion.lesson_card.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Key Points</h4>
                  <div className="space-y-2">
                    {currentQuestion.lesson_card.keyPoints.map((point, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border border-[var(--color-border)]">
                        <FiCheck className="w-4 h-4 text-[var(--color-success)] flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <p className="text-sm text-[var(--color-text-secondary)]">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion.lesson_card?.detailedExplanation && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Detailed Explanation</h4>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {currentQuestion.lesson_card.detailedExplanation}
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[var(--color-border)] flex-shrink-0">
              <button 
                onClick={() => setShowLessonSheet(false)}
                className="w-full h-12 font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                style={{ background: 'var(--color-mode-study)', color: 'white' }}
              >
                <FiCheck className="w-4 h-4" strokeWidth={1.5} />
                Got It - Answer Question
              </button>
            </div>
            <div className="h-safe-bottom bg-[var(--color-bg)]" />
          </div>
        </div>
      )}

      {/* Full Explanation Sheet (After Answer) */}
      {showExplanationSheet && hasLessonCard && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowExplanationSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] border-t border-[var(--color-border)] max-h-[90vh] flex flex-col">
            <div className="w-8 h-1 bg-[var(--color-border)] mx-auto mt-3 flex-shrink-0" />
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <FiBook className="w-5 h-5" style={{ color: 'var(--color-mode-study)' }} strokeWidth={1.5} />
                <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--color-mode-study)' }}>Learn More</span>
              </div>
              <button onClick={() => setShowExplanationSheet(false)} className="p-2">
                <FiX className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Title & Overview */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-lg font-semibold">{currentQuestion.lesson_card?.title}</h3>
                  <SpeakButton 
                    text={`${currentQuestion.lesson_card?.title}. ${currentQuestion.lesson_card?.conceptOverview}. ${currentQuestion.explanation || ''}`} 
                    language={ttsLanguage}
                    size="md"
                  />
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {currentQuestion.lesson_card?.conceptOverview}
                </p>
              </div>
              
              {/* Your Answer Result */}
              <div className="p-4 border" style={{ borderColor: isCorrect ? 'var(--color-success)' : 'var(--color-error)', background: isCorrect ? 'var(--color-success-soft)' : 'var(--color-error-soft)' }}>
                <div className="flex items-center gap-2 mb-2">
                  {isCorrect ? <FiCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} strokeWidth={2} /> : <FiX className="w-4 h-4" style={{ color: 'var(--color-error)' }} strokeWidth={2} />}
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: isCorrect ? 'var(--color-success)' : 'var(--color-error)' }}>
                    Your Answer: {Array.from(selectedOptions).join(', ')}
                  </span>
                </div>
                {!isCorrect && <p className="text-sm">Correct answer: <strong>{effectiveCorrectOptions.join(', ')}</strong></p>}
              </div>

              {/* Explanation */}
              {currentQuestion.explanation && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Explanation</h4>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}
              
              {/* Key Points */}
              {currentQuestion.lesson_card?.keyPoints && currentQuestion.lesson_card.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Key Points</h4>
                  <div className="space-y-2">
                    {currentQuestion.lesson_card.keyPoints.map((point, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border border-[var(--color-border)]">
                        <span className="w-5 h-5 border border-[var(--color-success)] text-[var(--color-success)] flex items-center justify-center text-[10px] font-medium mono flex-shrink-0">{i + 1}</span>
                        <p className="text-sm text-[var(--color-text-secondary)]">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Explanation */}
              {currentQuestion.lesson_card?.detailedExplanation && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">In Depth</h4>
                  <div className="p-4 border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
                      {currentQuestion.lesson_card.detailedExplanation}
                    </p>
                  </div>
                </div>
              )}

              {/* Examples */}
              {currentQuestion.lesson_card?.examples && currentQuestion.lesson_card.examples.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Examples</h4>
                  <div className="space-y-2">
                    {currentQuestion.lesson_card.examples.map((example, i) => (
                      <div key={i} className="p-3 border border-[var(--color-border)] bg-[var(--color-surface)]">
                        <p className="text-sm text-[var(--color-text-secondary)]">{example}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Mistakes */}
              {currentQuestion.lesson_card?.commonMistakes && currentQuestion.lesson_card.commonMistakes.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Common Mistakes</h4>
                  <div className="space-y-2">
                    {currentQuestion.lesson_card.commonMistakes.map((mistake, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border border-[var(--color-error)]" style={{ background: 'var(--color-error-soft)' }}>
                        <FiInfo className="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                        <p className="text-sm text-[var(--color-text-secondary)]">{mistake}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[var(--color-border)] flex-shrink-0">
              <button 
                onClick={() => { setShowExplanationSheet(false); handleNext() }}
                className="w-full h-12 bg-[var(--color-text)] text-[var(--color-bg)] font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {currentIndex < activeQuestions.length - 1 ? (
                  <>Continue <FiArrowRight className="w-4 h-4" strokeWidth={1.5} /></>
                ) : (
                  <>Finish Quiz <FiAward className="w-4 h-4" strokeWidth={1.5} /></>
                )}
              </button>
            </div>
            <div className="h-safe-bottom bg-[var(--color-bg)]" />
          </div>
        </div>
      )}

      {/* Chat Assistant Sheet */}
      {chatOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/80" onClick={() => setChatOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] border-t border-[var(--color-border)] flex flex-col" style={{ height: '70%' }}>
            {/* Chat Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-shrink-0">
              <div>
                <h2 className="font-medium text-sm">AI Assistant</h2>
                <p className="text-[10px] text-[var(--color-text-secondary)] mono">
                  Question {currentIndex + 1} of {activeQuestions.length}
                </p>
              </div>
              <button onClick={() => setChatOpen(false)} className="p-2">
                <FiX className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border border-[var(--color-border)] flex items-center justify-center mx-auto mb-4">
                    <FiMessageCircle className="w-6 h-6 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-2">Ask about this question</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">I can help explain concepts, why answers are correct, or clarify confusing parts.</p>
                  
                  {/* Quick Prompts */}
                  <div className="mt-4 space-y-2">
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
                        className="block w-full p-3 text-left text-sm border border-[var(--color-border)] active:bg-[var(--color-surface)]"
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
                        ? 'bg-[var(--color-surface)] border border-[var(--color-border)] ml-8' 
                        : 'bg-[var(--color-bg)] border border-[var(--color-text)] mr-8'
                    }`}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </p>
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap text-[var(--color-text)]">{message.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none text-[var(--color-text)] prose-headings:text-[var(--color-text)] prose-headings:font-medium prose-headings:text-sm prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-[var(--color-text)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {message.role === 'assistant' && message.audioUrl && (
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-2 text-xs border border-[var(--color-border)] px-3 py-2"
                        onClick={() => {
                          try {
                            const a = new Audio(message.audioUrl!)
                            a.play().catch(() => {})
                          } catch {}
                        }}
                      >
                        <FiVolume2 className="w-4 h-4" strokeWidth={1.5} />
                        Play audio
                      </button>
                    )}
                  </div>
                ))
              )}
              {chatSending && (
                <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-text)] mr-8">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">Assistant</p>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-[var(--color-text)] animate-pulse" />
                    <div className="w-1.5 h-1.5 bg-[var(--color-text)] animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-[var(--color-text)] animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[var(--color-border)] flex-shrink-0">
              {chatError && (
                <div className="mb-3 p-2 border border-[var(--color-error)] bg-[var(--color-error-muted)] text-[var(--color-error)] text-xs">
                  {chatError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => (chatRecording ? stopChatRecording() : startChatRecording())}
                  disabled={chatSending}
                  className={`w-12 h-12 flex items-center justify-center border ${
                    chatRecording
                      ? 'bg-[var(--color-error)] text-white border-[var(--color-error)] animate-pulse'
                      : 'bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border)]'
                  } disabled:opacity-30`}
                  title={chatRecording ? 'Stop recording' : 'Voice input'}
                >
                  {chatRecording ? <FiStopCircle className="w-4 h-4" strokeWidth={1.5} /> : <FiMic className="w-4 h-4" strokeWidth={1.5} />}
                </button>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
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
                  placeholder={chatRecording ? `Listening… ${formatChatRecordingTime(chatRecordingSeconds)}` : 'Ask a question...'}
                  rows={1}
                  className="flex-1 px-4 py-3 border border-[var(--color-border)] bg-[var(--color-bg)] text-sm resize-none focus:outline-none focus:border-[var(--color-text)]"
                  disabled={chatSending}
                  style={{ minHeight: '48px', maxHeight: '100px' }}
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={!chatInput.trim() || chatSending}
                  className="w-12 h-12 bg-[var(--color-text)] text-[var(--color-bg)] flex items-center justify-center disabled:opacity-30"
                >
                  <FiSend className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
            <div className="h-safe-bottom bg-[var(--color-bg)]" />
          </div>
        </div>
      )}
    </div>
  )
}
