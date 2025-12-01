'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { 
  FloatingActionButton, 
  PullToRefreshIndicator,
  ListSkeleton,
  Skeleton 
} from '@/components/mobile/MobileLayout'
import { usePullToRefresh, useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { 
  FiPlus, 
  FiBook, 
  FiCheckSquare, 
  FiArrowRight, 
  FiAward,
  FiUpload,
  FiFileText,
  FiTrendingUp,
  FiCalendar
} from 'react-icons/fi'
import type { Lesson } from '@/types/db'

interface McqSet {
  id: string
  name: string
  total_questions: number
  created_at: string
}

export default function MobileHomePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [recentLessons, setRecentLessons] = useState<Lesson[]>([])
  const [recentMcqs, setRecentMcqs] = useState<McqSet[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Hello')
  const horizontalScrollRef = useRef<HTMLDivElement>(null)
  const { triggerHaptic } = useHapticFeedback()

  const loadDashboard = useCallback(async () => {
    const supabase = createClient()
    
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !authUser) {
        router.push('/m/login')
        return
      }

      setUser({
        email: authUser.email,
        fullName: authUser.user_metadata?.full_name || 'Student',
      })

      // Load data
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Load lessons
        const lessonsRes = await fetch('/api/lessons', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        if (lessonsRes.ok) {
          const data = await lessonsRes.json()
          setRecentLessons((data.lessons || []).slice(0, 5))
        }

        // Load MCQ sets
        const mcqRes = await fetch('/api/mcq/list', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        if (mcqRes.ok) {
          const data = await mcqRes.json()
          setRecentMcqs((data.sets || []).slice(0, 5))
        }
      }
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    // Set greeting based on time
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    loadDashboard()
  }, [loadDashboard])

  // Pull to refresh
  const {
    containerRef,
    isRefreshing,
    pullProgress
  } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic('medium')
      setLoading(true)
      await loadDashboard()
    }
  })

  const firstName = user?.fullName?.split(' ')[0] || 'there'

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <MobileLayout>
        {/* Custom Header Skeleton */}
        <header className="mobile-header">
          <div className="flex-1">
            <Skeleton className="w-20 h-3 mb-1" />
            <Skeleton className="w-32 h-5" />
          </div>
          <Skeleton variant="circular" className="w-10 h-10" />
        </header>

        <div 
          className="mobile-content"
        >
          {/* Stats Skeleton */}
          <section className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} variant="rectangular" className="h-24" />
              ))}
            </div>
          </section>

          {/* Quick Actions Skeleton */}
          <section className="px-4 py-4">
            <Skeleton className="w-28 h-5 mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton variant="rectangular" className="h-32" />
              <Skeleton variant="rectangular" className="h-32" />
            </div>
          </section>
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      {/* Custom Header with User Greeting */}
      <header className="mobile-header">
        <div className="flex-1">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-0.5">{greeting}</p>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">{firstName} 👋</h1>
        </div>
        <Link href="/m/profile" className="mobile-header-action">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center text-[var(--color-bg-primary)] font-bold text-sm">
            {firstName[0]?.toUpperCase() || 'S'}
          </div>
        </Link>
      </header>

      {/* Scrollable Content */}
      <div 
        ref={containerRef}
        className="mobile-content"
      >
        <PullToRefreshIndicator progress={pullProgress} isRefreshing={isRefreshing} />
        
        {/* Quick Stats */}
        <section className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-3 gap-3">
            <Link 
              href="/m/lessons"
              className="feature-card p-4 text-center active:scale-[0.97] transition-transform"
              onClick={() => triggerHaptic('light')}
            >
              <div className="feature-card-icon cyan mx-auto mb-2 w-10 h-10">
                <FiBook className="w-5 h-5" />
              </div>
              <div className="text-xl font-bold text-[var(--color-text-primary)]">{recentLessons.length}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Lessons</div>
            </Link>
            <Link 
              href="/m/mcq"
              className="feature-card p-4 text-center active:scale-[0.97] transition-transform"
              onClick={() => triggerHaptic('light')}
            >
              <div className="feature-card-icon purple mx-auto mb-2 w-10 h-10">
                <FiCheckSquare className="w-5 h-5" />
              </div>
              <div className="text-xl font-bold text-[var(--color-text-primary)]">{recentMcqs.length}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Quizzes</div>
            </Link>
            <div className="feature-card p-4 text-center">
              <div className="feature-card-icon gold mx-auto mb-2 w-10 h-10">
                <FiAward className="w-5 h-5" />
              </div>
              <div className="text-xl font-bold text-[var(--color-text-primary)]">0</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Streak</div>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="px-4 py-4">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link 
              href="/m/lessons/new" 
              className="feature-card p-4 active:scale-[0.98] transition-transform"
              onClick={() => triggerHaptic('light')}
            >
              <div className="feature-card-icon cyan mb-3">
                <FiUpload className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1">New Lesson</h3>
              <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
                Upload a PDF to study
              </p>
            </Link>
            <Link 
              href="/m/mcq/new" 
              className="feature-card p-4 active:scale-[0.98] transition-transform"
              onClick={() => triggerHaptic('light')}
            >
              <div className="feature-card-icon purple mb-3">
                <FiFileText className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1">New Quiz</h3>
              <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
                Extract MCQs from PDF
              </p>
            </Link>
          </div>
        </section>

        {/* Recent Lessons */}
        <section className="py-4">
          <div className="flex items-center justify-between px-4 mb-3">
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">Recent Lessons</h2>
            <Link 
              href="/m/lessons" 
              className="text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1"
              onClick={() => triggerHaptic('light')}
            >
              See all
              <FiArrowRight className="w-3 h-3" />
            </Link>
          </div>
          
          {recentLessons.length > 0 ? (
            <div 
              ref={horizontalScrollRef}
              className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar snap-x snap-mandatory"
            >
              {recentLessons.map((lesson, index) => (
                <Link
                  key={lesson.id}
                  href={`/m/lessons/${lesson.id}`}
                  className="flex-shrink-0 w-[180px] mobile-card p-4 active:scale-[0.98] transition-transform animate-slide-in snap-start"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => triggerHaptic('light')}
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-soft)] flex items-center justify-center mb-3">
                    <FiBook className="w-5 h-5 text-[var(--color-accent)]" />
                  </div>
                  <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1 line-clamp-2">
                    {lesson.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <span>{lesson.total_pages}p</span>
                    <span>•</span>
                    <span>{formatDate(lesson.created_at)}</span>
                  </div>
                </Link>
              ))}
              
              {/* Add More Card */}
              <Link
                href="/m/lessons/new"
                className="flex-shrink-0 w-[180px] mobile-card p-4 flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border)] bg-transparent active:scale-[0.98] transition-transform snap-start"
                onClick={() => triggerHaptic('light')}
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center mb-2">
                  <FiPlus className="w-5 h-5 text-[var(--color-text-tertiary)]" />
                </div>
                <span className="text-xs font-medium text-[var(--color-text-tertiary)]">Add Lesson</span>
              </Link>
            </div>
          ) : (
            <div className="px-4">
              <div className="mobile-card p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-hover)] flex items-center justify-center mx-auto mb-3">
                  <FiBook className="w-6 h-6 text-[var(--color-text-tertiary)]" />
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] mb-3">No lessons yet</p>
                <Link href="/m/lessons/new" className="btn-mobile btn-primary-mobile text-sm py-2.5">
                  <FiPlus className="w-4 h-4" />
                  Create First Lesson
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Recent Quizzes */}
        <section className="py-4 pb-8">
          <div className="flex items-center justify-between px-4 mb-3">
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">Recent Quizzes</h2>
            <Link 
              href="/m/mcq" 
              className="text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1"
              onClick={() => triggerHaptic('light')}
            >
              See all
              <FiArrowRight className="w-3 h-3" />
            </Link>
          </div>
          
          {recentMcqs.length > 0 ? (
            <div className="px-4 space-y-2 stagger-children">
              {recentMcqs.slice(0, 3).map((mcq, index) => (
                <Link
                  key={mcq.id}
                  href={`/m/mcq/${mcq.id}`}
                  className="item-card"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => triggerHaptic('light')}
                >
                  <div className="item-card-icon bg-[var(--color-secondary-soft)]">
                    <FiCheckSquare className="text-[var(--color-secondary)]" />
                  </div>
                  <div className="item-card-content">
                    <h3 className="item-card-title">{mcq.name}</h3>
                    <p className="item-card-meta">
                      {mcq.total_questions} question{mcq.total_questions !== 1 ? 's' : ''} • {formatDate(mcq.created_at)}
                    </p>
                  </div>
                  <FiArrowRight className="item-card-chevron w-5 h-5" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4">
              <div className="mobile-card p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-hover)] flex items-center justify-center mx-auto mb-3">
                  <FiCheckSquare className="w-6 h-6 text-[var(--color-text-tertiary)]" />
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] mb-3">No quizzes yet</p>
                <Link href="/m/mcq/new" className="btn-mobile btn-primary-mobile text-sm py-2.5">
                  <FiPlus className="w-4 h-4" />
                  Create First Quiz
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Study Tip */}
        <section className="px-4 pb-8">
          <div className="mobile-card-gradient p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-tertiary-soft)] flex items-center justify-center flex-shrink-0">
                <FiTrendingUp className="w-5 h-5 text-[var(--color-tertiary)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1">Study Tip</h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Review your quizzes regularly to reinforce learning. Spaced repetition helps retain information longer!
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Floating Action Button */}
      <FloatingActionButton
        href="/m/lessons/new"
        icon={<FiPlus />}
        label="Create new"
      />
    </MobileLayout>
  )
}
