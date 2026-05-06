'use client'

import { useState } from 'react'
import { 
  FiZap, 
  FiLayers, 
  FiFileText, 
  FiList,
  FiVolume2,
  FiVolumeX,
  FiHelpCircle
} from 'react-icons/fi'
import type { AssistantMessage } from './AssistantPanel'

interface StudyToolbarProps {
  messages: AssistantMessage[]
  lessonId: string
  currentPage: number
  eli5Mode: boolean
  onToggleEli5: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
  onQuickAction: (prompt: string) => void
}

export default function StudyToolbar({
  messages,
  lessonId,
  currentPage,
  eli5Mode,
  onToggleEli5,
  autoSpeak,
  onToggleAutoSpeak,
  onQuickAction,
}: StudyToolbarProps) {
  const [generating, setGenerating] = useState<string | null>(null)

  const handleGenerateFlashcards = async () => {
    setGenerating('flashcards')
    onQuickAction('Based on our conversation, create 5 flashcards in Q&A format that would help me remember the key concepts we discussed.')
    setGenerating(null)
  }

  const handleGenerateMCQ = async () => {
    setGenerating('mcq')
    onQuickAction('Create 3 multiple choice questions to test my understanding of what we discussed. Include 4 options each and explain the correct answer.')
    setGenerating(null)
  }

  const handleSummarize = async () => {
    setGenerating('summary')
    onQuickAction('Summarize our entire conversation into a concise study note I can review later.')
    setGenerating(null)
  }

  return (
    <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Left: Generate tools */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleGenerateFlashcards}
            disabled={messages.length < 2 || generating === 'flashcards'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Generate flashcards from conversation"
          >
            <FiLayers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Flashcards</span>
          </button>
          
          <button
            onClick={handleGenerateMCQ}
            disabled={messages.length < 2 || generating === 'mcq'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Generate practice questions"
          >
            <FiList className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quiz</span>
          </button>

          <button
            onClick={handleSummarize}
            disabled={messages.length < 2 || generating === 'summary'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Summarize conversation"
          >
            <FiFileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Summarize</span>
          </button>
        </div>

        {/* Right: Mode toggles */}
        <div className="flex items-center gap-1">
          {/* ELI5 Mode */}
          <button
            onClick={onToggleEli5}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
              eli5Mode 
                ? 'text-mode-study bg-mode-study/10 border border-mode-study/30' 
                : 'text-text-secondary hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border'
            }`}
            title="Explain Like I'm 5 mode"
          >
            <FiHelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ELI5</span>
          </button>

          {/* Auto-speak */}
          <button
            onClick={onToggleAutoSpeak}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
              autoSpeak 
                ? 'text-mode-study bg-mode-study/10 border border-mode-study/30' 
                : 'text-text-secondary hover:text-text-primary hover:bg-elevated border border-transparent hover:border-border'
            }`}
            title={autoSpeak ? 'Disable auto-speak' : 'Enable auto-speak'}
          >
            {autoSpeak ? <FiVolume2 className="w-3.5 h-3.5" /> : <FiVolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Auto-read</span>
          </button>
        </div>
      </div>
    </div>
  )
}

