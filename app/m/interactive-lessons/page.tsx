'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { 
  MobileHeader, 
  FloatingActionButton, 
  EmptyState, 
  BottomSheet,
  PullToRefreshIndicator
} from '@/components/mobile/MobileLayout'
import { usePullToRefresh, useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { FiPlus, FiTrash2, FiMoreVertical, FiArrowRight, FiZap } from 'react-icons/fi'
import type { InteractiveLesson } from '@/types/db'

interface InteractiveLessonWithCounts extends InteractiveLesson {
  lessonDocCount?: number
  mcqDocCount?: number
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  ready: { label: 'Ready', class: 'text-[var(--color-success)]' },
  processing: { label: 'Processing', class: 'text-[var(--color-warning)]' },
  error: { label: 'Error', class: 'text-[var(--color-error)]' },
  draft: { label: 'Draft', class: 'text-[var(--color-text-tertiary)]' },
}

export default function MobileInteractiveLessonsPage() {
  const router = useRouter()
  const [lessons, setLessons] = useState<InteractiveLessonWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState<InteractiveLessonWithCounts | null>(null)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { triggerHaptic } = useHapticFeedback()

  const loadLessons = useCallback(async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/m/login')
        return
      }

      const response = await fetch('/api/interactive-lessons', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setLessons(data.lessons || [])
      }
    } catch (error) {
      console.error('Error loading interactive lessons:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadLessons()
  }, [loadLessons])

  const {
    containerRef,
    isRefreshing,
    pullProgress
  } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic('medium')
      await loadLessons()
    }
  })

  const handleDelete = async () => {
    if (!selectedLesson) return
    
    setDeleting(true)
    triggerHaptic('warning')
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/interactive-lessons/${selectedLesson.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        triggerHaptic('success')
        setLessons(lessons.filter(l => l.id !== selectedLesson.id))
      }
    } catch (error) {
      console.error('Error deleting lesson:', error)
    } finally {
      setDeleting(false)
      setShowActionSheet(false)
      setSelectedLesson(null)
    }
  }

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Interactive" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      <MobileHeader 
        title="Interactive" 
        rightAction={
          <Link href="/m/interactive-lessons/new" className="mobile-header-action">
            <FiPlus className="w-5 h-5" strokeWidth={1.5} />
          </Link>
        }
      />

      <div ref={containerRef} className="mobile-content">
        <PullToRefreshIndicator progress={pullProgress} isRefreshing={isRefreshing} />

        {lessons.length === 0 ? (
          <EmptyState
            icon={<FiZap className="w-6 h-6" strokeWidth={1} />}
            title="No Interactive Lessons"
            description="Create lessons with MCQ checkpoints for better learning"
            action={
              <Link href="/m/interactive-lessons/new" className="btn-mobile btn-primary-mobile">
                Create Lesson
              </Link>
            }
          />
        ) : (
          <div>
            {/* Count */}
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)] mono">
                {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
              </span>
            </div>
            
            {/* List */}
            {lessons.map((lesson) => {
              const status = STATUS_CONFIG[lesson.status] || STATUS_CONFIG.draft

              return (
                <div 
                  key={lesson.id} 
                  className="flex items-center border-b border-[var(--color-border)]"
                >
                  <Link
                    href={`/m/interactive-lessons/${lesson.id}`}
                    className="flex-1 flex items-center justify-between px-4 py-4 active:bg-[var(--color-surface)]"
                    onClick={() => triggerHaptic('light')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-medium text-sm truncate">{lesson.name}</h3>
                        <span className={`text-[8px] uppercase tracking-wider ${status.class}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] mono">
                        {lesson.lessonDocCount || 0} docs · {new Date(lesson.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <FiArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] ml-4" strokeWidth={1} />
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      triggerHaptic('light')
                      setSelectedLesson(lesson)
                      setShowActionSheet(true)
                    }}
                    className="px-4 py-4 text-[var(--color-text-tertiary)] active:opacity-50"
                  >
                    <FiMoreVertical className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <FloatingActionButton
        href="/m/interactive-lessons/new"
        icon={<FiPlus strokeWidth={1.5} />}
        label="New"
      />

      <BottomSheet
        isOpen={showActionSheet}
        onClose={() => {
          setShowActionSheet(false)
          setSelectedLesson(null)
        }}
        title={selectedLesson?.name}
      >
        <div className="space-y-2">
          <Link
            href={`/m/interactive-lessons/${selectedLesson?.id}`}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)]"
            onClick={() => setShowActionSheet(false)}
          >
            <span className="font-medium text-sm">Open</span>
            <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)] w-full"
          >
            <span className="font-medium text-sm">Delete</span>
            {deleting ? (
              <div className="spinner-mobile w-4 h-4" />
            ) : (
              <FiTrash2 className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}
