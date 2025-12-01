'use client'

import { FiBook, FiTarget, FiStar, FiCheckCircle } from 'react-icons/fi'

export interface LessonCardData {
  title: string
  conceptOverview: string
  detailedExplanation: string
  keyPoints: string[]
  example: string
  memoryHook: string
}

interface LessonCardProps {
  card: LessonCardData
  questionNumber: number
  isActive: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export default function LessonCard({ 
  card, 
  questionNumber, 
  isActive,
  isExpanded = false,
  onToggleExpand
}: LessonCardProps) {
  if (!card) {
    return (
      <div className={`p-4 rounded-lg ${isActive ? 'bg-accent-muted border-2 border-accent' : 'bg-elevated'}`}>
        <div className="flex items-center gap-2 text-text-tertiary">
          <FiBook className="w-4 h-4" />
          <span className="text-sm">No lesson card available</span>
        </div>
      </div>
    )
  }

  return (
    <div 
      className={`rounded-lg transition-all ${
        isActive 
          ? 'bg-accent-muted border-2 border-accent shadow-lg' 
          : 'bg-elevated border border-border hover:border-accent-muted'
      }`}
    >
      {/* Header - Always visible */}
      <button
        onClick={onToggleExpand}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            isActive ? 'bg-accent text-white' : 'bg-background text-text-secondary'
          }`}>
            {questionNumber}
          </span>
          <div className="flex-1 min-w-0">
            <h4 className={`font-semibold text-sm leading-tight ${
              isActive ? 'text-accent' : 'text-text-primary'
            }`}>
              {card.title}
            </h4>
            {!isExpanded && (
              <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                {card.conceptOverview}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Concept Overview */}
          <div className="pl-10">
            <p className="text-sm text-text-secondary leading-relaxed">
              {card.conceptOverview}
            </p>
          </div>

          {/* Detailed Explanation */}
          <div className="pl-10">
            <div className="flex items-center gap-2 mb-2">
              <FiBook className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                Explanation
              </span>
            </div>
            <div className="text-sm text-text-secondary leading-relaxed space-y-2">
              {card.detailedExplanation.split('\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>

          {/* Key Points */}
          {card.keyPoints && card.keyPoints.length > 0 && (
            <div className="pl-10">
              <div className="flex items-center gap-2 mb-2">
                <FiTarget className="w-4 h-4 text-green-500" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                  Key Points
                </span>
              </div>
              <ul className="space-y-1">
                {card.keyPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <FiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Example */}
          {card.example && (
            <div className="pl-10">
              <div className="flex items-center gap-2 mb-2">
                <FiStar className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                  Example
                </span>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-900 leading-relaxed">
                  {card.example}
                </p>
              </div>
            </div>
          )}

          {/* Memory Hook */}
          {card.memoryHook && (
            <div className="pl-10">
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">💡</span>
                  <span className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
                    Remember This
                  </span>
                </div>
                <p className="text-sm text-purple-900 font-medium">
                  {card.memoryHook}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

