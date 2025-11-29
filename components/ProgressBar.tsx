'use client'

import { FiCheck, FiLock, FiPlay } from 'react-icons/fi'

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

  return (
    <div className="bg-neutral-900 border-b border-neutral-800">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                  isActive
                    ? 'bg-violet-600 text-white'
                    : status === 'completed'
                    ? 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/70'
                    : status === 'current'
                    ? 'bg-neutral-800 text-white hover:bg-neutral-700'
                    : 'bg-neutral-800/50 text-gray-500 cursor-not-allowed'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  status === 'completed'
                    ? 'bg-emerald-500 text-white'
                    : status === 'current'
                    ? 'bg-violet-500 text-white'
                    : 'bg-neutral-700 text-gray-400'
                }`}>
                  {status === 'completed' ? (
                    <FiCheck className="w-3.5 h-3.5" />
                  ) : status === 'locked' ? (
                    <FiLock className="w-3 h-3" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="text-sm font-medium whitespace-nowrap">
                  {section.title.length > 20 ? section.title.slice(0, 20) + '...' : section.title}
                </span>
                {progress?.score !== undefined && status === 'completed' && (
                  <span className="text-xs bg-emerald-500/20 px-1.5 py-0.5 rounded">
                    {progress.score}%
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-1 bg-neutral-800">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all"
          style={{
            width: `${(Array.from(progressMap.values()).filter(p => p.status === 'completed').length / sections.length) * 100}%`
          }}
        />
      </div>
    </div>
  )
}

