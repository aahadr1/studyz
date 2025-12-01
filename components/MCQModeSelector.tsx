'use client'

import { FiBook, FiEdit3, FiZap, FiRotateCcw } from 'react-icons/fi'

export type MCQMode = 'study' | 'test' | 'challenge' | 'review'

interface MCQModeSelectorProps {
  currentMode: MCQMode
  onModeChange: (mode: MCQMode) => void
  hasIncorrectAnswers: boolean
}

export default function MCQModeSelector({ 
  currentMode, 
  onModeChange,
  hasIncorrectAnswers 
}: MCQModeSelectorProps) {
  const modes: Array<{
    id: MCQMode
    label: string
    description: string
    icon: React.ReactNode
    disabled?: boolean
  }> = [
    {
      id: 'study',
      label: 'Study',
      description: 'See lesson before answering',
      icon: <FiBook className="w-4 h-4" strokeWidth={1.5} />
    },
    {
      id: 'test',
      label: 'Test',
      description: 'Answer first, then see lesson',
      icon: <FiEdit3 className="w-4 h-4" strokeWidth={1.5} />
    },
    {
      id: 'challenge',
      label: 'Challenge',
      description: '30s per question',
      icon: <FiZap className="w-4 h-4" strokeWidth={1.5} />
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Focus on missed questions',
      icon: <FiRotateCcw className="w-4 h-4" strokeWidth={1.5} />,
      disabled: !hasIncorrectAnswers
    }
  ]

  const getModeClasses = (modeId: MCQMode, isActive: boolean, isDisabled?: boolean) => {
    if (isDisabled) return 'border-border text-text-tertiary opacity-40 cursor-not-allowed'
    
    if (!isActive) return 'border-border text-text-secondary hover:border-border-light hover:text-text-primary'
    
    switch (modeId) {
      case 'study':
        return 'border-mode-study text-mode-study bg-mode-study/10'
      case 'test':
        return 'border-mode-test text-mode-test bg-mode-test/10'
      case 'challenge':
        return 'border-mode-challenge text-mode-challenge bg-mode-challenge/10'
      case 'review':
        return 'border-mode-review text-mode-review bg-mode-review/10'
      default:
        return 'border-text-primary text-text-primary'
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => !mode.disabled && onModeChange(mode.id)}
          disabled={mode.disabled}
          className={`flex items-center gap-2 px-4 py-2.5 border text-sm font-medium uppercase tracking-wider transition-colors ${
            getModeClasses(mode.id, currentMode === mode.id, mode.disabled)
          }`}
          title={mode.description}
        >
          {mode.icon}
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  )
}
