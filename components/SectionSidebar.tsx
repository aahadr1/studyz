'use client'

import { useState, useEffect } from 'react'
import { FiFileText, FiHelpCircle, FiMessageCircle, FiChevronRight, FiLoader } from 'react-icons/fi'
import QuizForm from './QuizForm'
import PageExplanation from './PageExplanation'
import PagePedagogicalExplanation from './PagePedagogicalExplanation'

interface Question {
  id: string
  question: string
  choices: string[]
  correct_index: number
  explanation: string
}

interface Section {
  id: string
  section_order: number
  title: string
  start_page: number
  end_page: number
  summary: string
  key_points: string[]
  pass_threshold: number
  interactive_lesson_questions: Question[]
}

interface Checkpoint {
  id: string
  checkpoint_order: number
  title: string
  checkpoint_type: 'topic' | 'subtopic'
  start_page: number
  end_page: number
  summary: string
  pass_threshold: number
  threshold?: number
  interactive_lesson_questions: Question[]
}

interface PageData {
  page: {
    number: number
    localNumber: number
    documentId: string
    documentName: string
  }
  transcription: {
    text: string
    type: string
    hasVisualContent: boolean
    visualElements: Array<{
      type: string
      description: string
      position?: string
    }>
  } | null
  elements: Array<{
    id: string
    element_type: 'term' | 'concept' | 'formula' | 'diagram' | 'definition'
    element_text: string
    explanation: string
    color?: string
    position_hint?: string
  }>
  checkpoint: {
    id: string
    title: string
    type: 'topic' | 'subtopic'
    startPage: number
    endPage: number
    summary: string
    order: number
    threshold: number
    isAtEnd: boolean
    progress: { status: string; score?: number } | null
  } | null
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

interface SectionSidebarProps {
  lessonId: string
  section: Section | null
  checkpoint?: Checkpoint | null
  sectionIndex: number
  totalSections: number
  currentPage: number
  isAtSectionEnd: boolean
  showQuiz: boolean
  generatedContent?: string
  mode: 'document_based' | 'mcq_only'
  onQuizSubmit: (sectionId: string, answers: Record<string, number>) => Promise<QuizResult>
  onQuizPass: () => void
  onStartQuiz: () => void
}

type Tab = 'page' | 'checkpoint' | 'chat'

export default function SectionSidebar({
  lessonId,
  section,
  checkpoint,
  sectionIndex,
  totalSections,
  currentPage,
  isAtSectionEnd,
  showQuiz,
  generatedContent,
  mode,
  onQuizSubmit,
  onQuizPass,
  onStartQuiz
}: SectionSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>(showQuiz ? 'checkpoint' : 'page')
  const [pageData, setPageData] = useState<PageData | null>(null)
  const [pageLoading, setPageLoading] = useState(false)

  // Fetch page-specific data when page changes
  useEffect(() => {
    if (mode === 'document_based' && currentPage > 0) {
      fetchPageData(currentPage)
    }
  }, [currentPage, lessonId, mode])

  // Switch to checkpoint tab when quiz should be shown
  useEffect(() => {
    if (showQuiz && activeTab !== 'checkpoint') {
      setActiveTab('checkpoint')
    }
  }, [showQuiz])

  const fetchPageData = async (pageNum: number) => {
    setPageLoading(true)
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/page/${pageNum}`)
      if (response.ok) {
        const data = await response.json()
        setPageData(data)
      }
    } catch (error) {
      console.error('Error fetching page data:', error)
    } finally {
      setPageLoading(false)
    }
  }

  // Get questions from checkpoint or section
  const questions = checkpoint?.interactive_lesson_questions || section?.interactive_lesson_questions || []
  const currentCheckpoint = pageData?.checkpoint || checkpoint
  // Use any to handle different property names (threshold vs pass_threshold)
  const cp = currentCheckpoint as any
  const passThreshold = cp?.threshold || cp?.pass_threshold || section?.pass_threshold || 70

  const handleQuizSubmit = async (answers: Record<string, number>) => {
    const targetId = currentCheckpoint?.id || section?.id
    if (targetId) {
      return onQuizSubmit(targetId, answers)
    }
    throw new Error('No section or checkpoint to submit quiz for')
  }

  if (!section && !checkpoint && mode === 'document_based') {
    return (
      <div className="h-full flex items-center justify-center bg-surface text-text-tertiary">
        <p>No section selected</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('page')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
            activeTab === 'page'
              ? 'text-accent border-b-2 border-accent bg-accent-muted'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <FiFileText className="w-4 h-4" />
          Page
        </button>
        <button
          onClick={() => setActiveTab('checkpoint')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
            activeTab === 'checkpoint'
              ? 'text-accent border-b-2 border-accent bg-accent-muted'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <FiHelpCircle className="w-4 h-4" />
          {showQuiz ? 'Quiz' : 'Checkpoint'}
          {questions.length > 0 && (
            <span className="text-xs bg-elevated px-1.5 py-0.5 rounded">
              {questions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
            activeTab === 'chat'
              ? 'text-accent border-b-2 border-accent bg-accent-muted'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <FiMessageCircle className="w-4 h-4" />
          Chat
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* Page Tab - Shows pedagogical explanation using vision AI */}
        {activeTab === 'page' && (
          <div className="h-full">
            {mode === 'document_based' && currentPage > 0 ? (
              <PagePedagogicalExplanation
                lessonId={lessonId}
                pageNumber={currentPage}
              />
            ) : mode === 'mcq_only' && generatedContent ? (
              <div className="h-full overflow-auto p-5">
                <div 
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: generatedContent }}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-text-tertiary p-4">
                <p className="text-sm">Navigate to a page to see its explanation</p>
              </div>
            )}
          </div>
        )}

        {/* Checkpoint Tab - Shows checkpoint info and quiz */}
        {activeTab === 'checkpoint' && (
          <div className="h-full overflow-auto">
            {showQuiz && questions.length > 0 ? (
              <QuizForm
                questions={questions}
                sectionTitle={currentCheckpoint?.title || section?.title || 'Quiz'}
                threshold={passThreshold}
                onSubmit={handleQuizSubmit}
                onPass={onQuizPass}
              />
            ) : (
              <div className="p-5">
                {/* Checkpoint/Section Header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 text-xs text-accent mb-1">
                    <span>
                      {cp ? (
                        `Checkpoint ${cp.order || cp.checkpoint_order}`
                      ) : (
                        `Section ${sectionIndex + 1} of ${totalSections}`
                      )}
                    </span>
                    {(cp?.type === 'subtopic' || cp?.checkpoint_type === 'subtopic') && (
                      <span className="text-text-tertiary">• Subtopic</span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {cp?.title || section?.title}
                  </h2>
                </div>

                {/* Summary */}
                {(cp?.summary || section?.summary) && (
                  <div className="mb-6">
                    <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                      Summary
                    </h3>
                    <p className="text-text-secondary text-sm leading-relaxed">
                      {cp?.summary || section?.summary}
                    </p>
                  </div>
                )}

                {/* Progress Info */}
                {cp?.isAtEnd && (
                  <div className="mb-6 p-3 bg-accent-muted border border-accent/20 rounded-lg">
                    <p className="text-sm text-text-secondary">
                      You've reached the end of this checkpoint. Complete the quiz to continue.
                    </p>
                  </div>
                )}

                {/* Quiz prompt */}
                {isAtSectionEnd && !showQuiz && questions.length > 0 && (
                  <div className="mt-8 p-4 bg-accent-muted border border-accent/20 rounded-lg">
                    <h3 className="font-medium text-text-primary mb-2">Ready for the quiz?</h3>
                    <p className="text-sm text-text-secondary mb-4">
                      Complete the quiz to unlock the next section. You need {passThreshold}% to pass.
                    </p>
                    <button
                      onClick={onStartQuiz}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      Start Quiz ({questions.length} questions)
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* No questions fallback */}
                {questions.length === 0 && (
                  <div className="text-center text-text-tertiary py-8">
                    <FiHelpCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No quiz questions for this checkpoint</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="h-full flex items-center justify-center text-text-tertiary p-4 text-center">
            <div>
              <FiMessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium mb-1">AI Chat Assistant</p>
              <p className="text-sm">Coming soon</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
