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
  ListSkeleton,
  PullToRefreshIndicator 
} from '@/components/mobile/MobileLayout'
import { usePullToRefresh, useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { 
  FiPlus, 
  FiBook, 
  FiTrash2, 
  FiMoreVertical,
  FiCalendar,
  FiFileText,
  FiSearch
} from 'react-icons/fi'
import type { Lesson } from '@/types/db'

export default function MobileLessonsPage() {
  const router = useRouter()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const { triggerHaptic } = useHapticFeedback()

  const loadLessons = useCallback(async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/m/login')
        return
      }

      const response = await fetch('/api/lessons', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setLessons(data.lessons || [])
      }
    } catch (error) {
      console.error('Error loading lessons:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadLessons()
  }, [loadLessons])

  // Pull to refresh
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

      const response = await fetch(`/api/lessons/${selectedLesson.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        triggerHaptic('success')
        setLessons(lessons.filter(l => l.id !== selectedLesson.id))
      }
    } catch (error) {
      console.error('Error deleting lesson:', error)
      triggerHaptic('error')
    } finally {
      setDeleting(false)
      setShowActionSheet(false)
      setSelectedLesson(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const filteredLessons = searchQuery.trim()
    ? lessons.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : lessons

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Lessons" />
        <div className="mobile-content">
          <ListSkeleton count={5} />
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      <MobileHeader 
        title="Lessons" 
        rightAction={
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSearch(!showSearch)} 
              className="mobile-header-action"
            >
              <FiSearch className="w-5 h-5" />
            </button>
            <Link href="/m/lessons/new" className="mobile-header-action">
              <FiPlus className="w-6 h-6" />
            </Link>
          </div>
        }
      />

      <div 
        ref={containerRef}
        className="mobile-content"
      >
        <PullToRefreshIndicator progress={pullProgress} isRefreshing={isRefreshing} />
        
        {/* Search Bar */}
        {showSearch && (
          <div className="px-4 py-3 border-b border-[var(--color-border)] animate-slide-down">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lessons..."
                className="input-mobile pl-10 py-2.5 text-sm"
                autoFocus
              />
            </div>
          </div>
        )}

        {lessons.length === 0 ? (
          <EmptyState
            icon={<FiBook />}
            title="No lessons yet"
            description="Upload a PDF document to create your first interactive lesson"
            action={
              <Link href="/m/lessons/new" className="btn-mobile btn-primary-mobile">
                <FiPlus className="w-5 h-5" />
                Create Lesson
              </Link>
            }
          />
        ) : filteredLessons.length === 0 ? (
          <EmptyState
            icon={<FiSearch />}
            title="No results"
            description={`No lessons matching "${searchQuery}"`}
          />
        ) : (
          <div className="px-4 py-4 space-y-3 stagger-children">
            {filteredLessons.map((lesson, index) => (
              <div 
                key={lesson.id} 
                className="item-card pr-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Link
                  href={`/m/lessons/${lesson.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                  onClick={() => triggerHaptic('light')}
                >
                  <div className="item-card-icon bg-[var(--color-accent-soft)]">
                    <FiBook className="text-[var(--color-accent)]" />
                  </div>
                  <div className="item-card-content">
                    <h3 className="item-card-title">{lesson.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                      <span className="flex items-center gap-1">
                        <FiFileText className="w-3 h-3" />
                        {lesson.total_pages} page{lesson.total_pages !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <FiCalendar className="w-3 h-3" />
                        {formatDate(lesson.created_at)}
                      </span>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    triggerHaptic('light')
                    setSelectedLesson(lesson)
                    setShowActionSheet(true)
                  }}
                  className="p-2 -mr-1 text-[var(--color-text-tertiary)] active:scale-90 transition-transform"
                >
                  <FiMoreVertical className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <FloatingActionButton
        href="/m/lessons/new"
        icon={<FiPlus />}
        label="New lesson"
      />

      {/* Action Sheet */}
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
            href={`/m/lessons/${selectedLesson?.id}`}
            className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] active:bg-[var(--color-surface-hover)] transition-colors"
            onClick={() => {
              triggerHaptic('light')
              setShowActionSheet(false)
            }}
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center">
              <FiBook className="w-5 h-5 text-[var(--color-accent)]" />
            </div>
            <span className="font-medium text-[var(--color-text-primary)]">Open Lesson</span>
          </Link>
          
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] active:bg-[var(--color-error-soft)] transition-colors w-full"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-error-soft)] flex items-center justify-center">
              {deleting ? (
                <div className="spinner-mobile w-5 h-5" style={{ borderWidth: '2px', borderTopColor: 'var(--color-error)' }} />
              ) : (
                <FiTrash2 className="w-5 h-5 text-[var(--color-error)]" />
              )}
            </div>
            <span className="font-medium text-[var(--color-error)]">
              {deleting ? 'Deleting...' : 'Delete Lesson'}
            </span>
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}
