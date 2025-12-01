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
    color: string
    disabled?: boolean
  }> = [
    {
      id: 'study',
      label: 'Study',
      description: 'See lesson before answering',
      icon: <FiBook className="w-5 h-5" />,
      color: 'blue'
    },
    {
      id: 'test',
      label: 'Test',
      description: 'Answer first, then see lesson',
      icon: <FiEdit3 className="w-5 h-5" />,
      color: 'purple'
    },
    {
      id: 'challenge',
      label: 'Challenge',
      description: 'Timed, no hints',
      icon: <FiZap className="w-5 h-5" />,
      color: 'red'
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Focus on missed questions',
      icon: <FiRotateCcw className="w-5 h-5" />,
      color: 'orange',
      disabled: !hasIncorrectAnswers
    }
  ]

  const getColorClasses = (color: string, isActive: boolean) => {
    if (!isActive) return 'bg-elevated text-text-secondary hover:bg-border'
    
    switch (color) {
      case 'blue':
        return 'bg-blue-500 text-white'
      case 'purple':
        return 'bg-purple-500 text-white'
      case 'red':
        return 'bg-red-500 text-white'
      case 'orange':
        return 'bg-orange-500 text-white'
      default:
        return 'bg-accent text-white'
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => !mode.disabled && onModeChange(mode.id)}
          disabled={mode.disabled}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            getColorClasses(mode.color, currentMode === mode.id)
          } ${mode.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={mode.description}
        >
          {mode.icon}
          <span className="text-sm font-medium">{mode.label}</span>
        </button>
      ))}
    </div>
  )
}

