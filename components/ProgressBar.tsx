'use client'

import { FiCheck, FiLock } from 'react-icons/fi'

interface Section {
  id: string
  section_order: number
  title: string
}

interface SectionProgress {
  status: 'locked' | 'current' | 'completed'
  score?: number
}

interface ProgressBarProps {
  sections: Section[]
  progressMap: Map<string, SectionProgress>
  currentSectionIndex: number
  onSectionClick: (index: number) => void
}

export default function ProgressBar({
  sections,
  progressMap,
  currentSectionIndex,
  onSectionClick
}: ProgressBarProps) {
  const getProgressStatus = (sectionId: string, index: number) => {
    const progress = progressMap.get(sectionId)
    if (progress) return progress.status
    return index === 0 ? 'current' : 'locked'
  }

  const completedCount = Array.from(progressMap.values()).filter(p => p.status === 'completed').length
  const progressPercent = sections.length > 0 ? (completedCount / sections.length) * 100 : 0

  return (
    <div className="bg-surface border-b border-border">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {sections.map((section, index) => {
            const status = getProgressStatus(section.id, index)
            const isActive = index === currentSectionIndex
            const isClickable = status !== 'locked'
            const progress = progressMap.get(section.id)

            return (
              <button
                key={section.id}
                onClick={() => isClickable && onSectionClick(index)}
                disabled={!isClickable}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-white'
                    : status === 'completed'
                    ? 'bg-success-muted text-success hover:bg-success/20'
                    : status === 'current'
                    ? 'bg-elevated text-text-primary hover:bg-subtle'
                    : 'bg-elevated/50 text-text-tertiary cursor-not-allowed'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  status === 'completed'
                    ? 'bg-success text-white'
                    : status === 'current'
                    ? 'bg-accent text-white'
                    : 'bg-border text-text-tertiary'
                }`}>
                  {status === 'completed' ? (
                    <FiCheck className="w-3 h-3" />
                  ) : status === 'locked' ? (
                    <FiLock className="w-2.5 h-2.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="whitespace-nowrap">
                  {section.title.length > 18 ? section.title.slice(0, 18) + '...' : section.title}
                </span>
                {progress?.score !== undefined && status === 'completed' && (
                  <span className="text-xs bg-success/20 px-1.5 py-0.5 rounded">
                    {progress.score}%
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Progress indicator */}
      <div className="h-0.5 bg-border">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}
