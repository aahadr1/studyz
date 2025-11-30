'use client'

import { FiCheck, FiLock, FiCircle, FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { useState } from 'react'

interface Checkpoint {
  id: string
  checkpoint_order: number
  title: string
  checkpoint_type: 'topic' | 'subtopic'
  start_page: number
  end_page: number
  summary?: string
  parent_id?: string | null
}

interface CheckpointProgress {
  checkpoint_id: string
  status: 'locked' | 'current' | 'completed'
  score?: number
}

interface CheckpointProgressProps {
  checkpoints: Checkpoint[]
  progress: CheckpointProgress[]
  currentCheckpointId?: string | null
  onCheckpointClick: (checkpoint: Checkpoint) => void
}

// Group checkpoints by parent (topics with their subtopics)
function groupCheckpoints(checkpoints: Checkpoint[]): Map<string | null, Checkpoint[]> {
  const groups = new Map<string | null, Checkpoint[]>()
  
  // First pass: add all topics
  checkpoints
    .filter(cp => cp.checkpoint_type === 'topic')
    .forEach(cp => {
      if (!groups.has(null)) groups.set(null, [])
      groups.get(null)!.push(cp)
    })
  
  // Second pass: add subtopics under their parents
  checkpoints
    .filter(cp => cp.checkpoint_type === 'subtopic')
    .forEach(cp => {
      if (!groups.has(cp.parent_id || null)) {
        groups.set(cp.parent_id || null, [])
      }
      groups.get(cp.parent_id || null)!.push(cp)
    })
  
  return groups
}

export default function CheckpointProgress({
  checkpoints,
  progress,
  currentCheckpointId,
  onCheckpointClick
}: CheckpointProgressProps) {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  
  const progressMap = new Map(progress.map(p => [p.checkpoint_id, p]))
  const groups = groupCheckpoints(checkpoints)
  const topics = groups.get(null) || []

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  const getStatus = (checkpointId: string): 'locked' | 'current' | 'completed' => {
    return progressMap.get(checkpointId)?.status || 'locked'
  }

  const getScore = (checkpointId: string): number | undefined => {
    return progressMap.get(checkpointId)?.score
  }

  const getStatusIcon = (status: 'locked' | 'current' | 'completed') => {
    switch (status) {
      case 'completed':
        return <FiCheck className="w-3.5 h-3.5 text-success" />
      case 'current':
        return <FiCircle className="w-3 h-3 text-accent fill-accent" />
      case 'locked':
        return <FiLock className="w-3 h-3 text-text-tertiary" />
    }
  }

  const getStatusStyles = (status: 'locked' | 'current' | 'completed', isCurrent: boolean) => {
    if (isCurrent) {
      return 'bg-accent-muted border-accent text-text-primary'
    }
    switch (status) {
      case 'completed':
        return 'bg-success-muted border-success/30 text-text-secondary'
      case 'current':
        return 'bg-surface border-accent/50 text-text-primary'
      case 'locked':
        return 'bg-surface/50 border-border text-text-tertiary cursor-not-allowed'
    }
  }

  // Calculate overall progress
  const completedCount = progress.filter(p => p.status === 'completed').length
  const totalCount = checkpoints.filter(cp => cp.checkpoint_type === 'topic').length || checkpoints.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="h-full flex flex-col">
      {/* Progress Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-primary">Progress</span>
          <span className="text-sm text-accent">{progressPercent}%</span>
        </div>
        <div className="h-2 bg-elevated rounded-full overflow-hidden">
          <div 
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-text-tertiary mt-2">
          {completedCount} of {totalCount} checkpoints completed
        </p>
      </div>

      {/* Checkpoint List */}
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-1">
          {topics.map((topic) => {
            const subtopics = groups.get(topic.id) || []
            const hasSubtopics = subtopics.length > 0
            const isExpanded = expandedTopics.has(topic.id)
            const status = getStatus(topic.id)
            const isCurrent = currentCheckpointId === topic.id
            const score = getScore(topic.id)
            const isClickable = status !== 'locked'

            return (
              <div key={topic.id}>
                {/* Topic */}
                <div
                  className={`
                    flex items-center gap-2 p-2 rounded-lg border transition-all
                    ${getStatusStyles(status, isCurrent)}
                    ${isClickable ? 'hover:ring-1 hover:ring-accent/50 cursor-pointer' : ''}
                  `}
                  onClick={() => {
                    if (hasSubtopics) {
                      toggleTopic(topic.id)
                    }
                    if (isClickable) {
                      onCheckpointClick(topic)
                    }
                  }}
                >
                  {/* Expand/collapse for topics with subtopics */}
                  {hasSubtopics && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleTopic(topic.id)
                      }}
                      className="p-0.5 hover:bg-elevated rounded"
                    >
                      {isExpanded ? (
                        <FiChevronDown className="w-4 h-4" />
                      ) : (
                        <FiChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Status icon */}
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {getStatusIcon(status)}
                  </div>

                  {/* Title and info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{topic.title}</span>
                      {score !== undefined && (
                        <span className="text-xs text-success">{score}%</span>
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary">
                      Pages {topic.start_page}-{topic.end_page}
                    </span>
                  </div>

                  {/* Order badge */}
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-elevated flex items-center justify-center">
                    <span className="text-xs font-medium">{topic.checkpoint_order}</span>
                  </div>
                </div>

                {/* Subtopics */}
                {hasSubtopics && isExpanded && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-border pl-2">
                    {subtopics.map((subtopic) => {
                      const subStatus = getStatus(subtopic.id)
                      const isSubCurrent = currentCheckpointId === subtopic.id
                      const subScore = getScore(subtopic.id)
                      const isSubClickable = subStatus !== 'locked'

                      return (
                        <div
                          key={subtopic.id}
                          className={`
                            flex items-center gap-2 p-2 rounded-lg border transition-all
                            ${getStatusStyles(subStatus, isSubCurrent)}
                            ${isSubClickable ? 'hover:ring-1 hover:ring-accent/50 cursor-pointer' : ''}
                          `}
                          onClick={() => {
                            if (isSubClickable) {
                              onCheckpointClick(subtopic)
                            }
                          }}
                        >
                          {/* Status icon */}
                          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {getStatusIcon(subStatus)}
                          </div>

                          {/* Title and info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate">{subtopic.title}</span>
                              {subScore !== undefined && (
                                <span className="text-xs text-success">{subScore}%</span>
                              )}
                            </div>
                            <span className="text-xs text-text-tertiary">
                              Pages {subtopic.start_page}-{subtopic.end_page}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

