'use client'

import { useState } from 'react'
import { FiFileText, FiHelpCircle, FiMessageCircle, FiChevronRight } from 'react-icons/fi'
import QuizForm from './QuizForm'

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
  section: Section | null
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

type Tab = 'summary' | 'quiz' | 'chat'

export default function SectionSidebar({
  section,
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
  const [activeTab, setActiveTab] = useState<Tab>(showQuiz ? 'quiz' : 'summary')

  if (showQuiz && activeTab !== 'quiz') {
    setActiveTab('quiz')
  }

  if (!section) {
    return (
      <div className="h-full flex items-center justify-center bg-surface text-text-tertiary">
        <p>No section selected</p>
      </div>
    )
  }

  const questions = section.interactive_lesson_questions || []

  const handleQuizSubmit = async (answers: Record<string, number>) => {
    return onQuizSubmit(section.id, answers)
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
            activeTab === 'summary'
              ? 'text-accent border-b-2 border-accent bg-accent-muted'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <FiFileText className="w-4 h-4" />
          Summary
        </button>
        <button
          onClick={() => setActiveTab('quiz')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
            activeTab === 'quiz'
              ? 'text-accent border-b-2 border-accent bg-accent-muted'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <FiHelpCircle className="w-4 h-4" />
          Quiz
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
        {activeTab === 'summary' && (
          <div className="h-full overflow-auto p-5">
            {/* Section header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 text-xs text-accent mb-1">
                <span>Section {sectionIndex + 1} of {totalSections}</span>
                {mode === 'document_based' && (
                  <span className="text-text-tertiary">
                    • Pages {section.start_page} - {section.end_page}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-text-primary">{section.title}</h2>
            </div>

            {/* MCQ-only: Generated content */}
            {mode === 'mcq_only' && generatedContent && (
              <div 
                className="prose prose-invert prose-sm max-w-none mb-6"
                dangerouslySetInnerHTML={{ __html: generatedContent }}
              />
            )}

            {/* Summary */}
            {section.summary && (
              <div className="mb-6">
                <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                  Summary
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">{section.summary}</p>
              </div>
            )}

            {/* Key Points */}
            {section.key_points && section.key_points.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">
                  Key Points
                </h3>
                <ul className="space-y-2">
                  {section.key_points.map((point, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-muted flex items-center justify-center mt-0.5">
                        <span className="text-xs text-accent font-medium">{index + 1}</span>
                      </div>
                      <span className="text-sm text-text-secondary">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ready for quiz prompt */}
            {isAtSectionEnd && !showQuiz && questions.length > 0 && (
              <div className="mt-8 p-4 bg-accent-muted border border-accent/20 rounded-lg">
                <h3 className="font-medium text-text-primary mb-2">Ready for the quiz?</h3>
                <p className="text-sm text-text-secondary mb-4">
                  You've reached the end of this section. Complete the quiz to unlock the next section.
                </p>
                <button
                  onClick={onStartQuiz}
                  className="btn-primary w-full"
                >
                  Start Quiz
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="h-full">
            {questions.length > 0 ? (
              <QuizForm
                questions={questions}
                sectionTitle={section.title}
                threshold={section.pass_threshold || 70}
                onSubmit={handleQuizSubmit}
                onPass={onQuizPass}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-text-tertiary p-4 text-center">
                <div>
                  <FiHelpCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No quiz questions for this section</p>
                </div>
              </div>
            )}
          </div>
        )}

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
