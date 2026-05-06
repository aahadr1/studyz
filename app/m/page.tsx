'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { 
  FloatingActionButton, 
  PullToRefreshIndicator 
} from '@/components/mobile/MobileLayout'
import { usePullToRefresh, useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { FiPlus, FiArrowRight } from 'react-icons/fi'
interface McqSet {
  id: string
  name: string
  total_questions: number
  created_at: string
}

interface InteractiveLessonSummary {
  id: string
  name: string
  status: string
  created_at: string
}

interface PodcastSummary {
  id: string
  title: string
  duration: number
  status: string
  created_at: string
}

export default function MobileHomePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [recentMcqs, setRecentMcqs] = useState<McqSet[]>([])
  const [recentInteractive, setRecentInteractive] = useState<InteractiveLessonSummary[]>([])
  const [recentPodcasts, setRecentPodcasts] = useState<PodcastSummary[]>([])
  const [loading, setLoading] = useState(true)
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

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const [mcqRes, interactiveRes] = await Promise.all([
          fetch('/api/mcq/list', { headers: { 'Authorization': `Bearer ${session.access_token}` }}),
          fetch('/api/interactive-lessons', { headers: { 'Authorization': `Bearer ${session.access_token}` }}),
        ])

        if (mcqRes.ok) {
          const data = await mcqRes.json()
          setRecentMcqs((data.sets || []).slice(0, 5))
        }

        if (interactiveRes.ok) {
          const data = await interactiveRes.json()
          setRecentInteractive((data.lessons || []).slice(0, 5))
        }

        // Fetch podcasts
        const { data: podcastsData } = await supabase
          .from('intelligent_podcasts')
          .select('id,title,duration,status,created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        
        if (podcastsData) {
          setRecentPodcasts(podcastsData)
        }
      }
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

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

  const firstName = user?.fullName?.split(' ')[0] || 'User'

  if (loading) {
    return (
      <MobileLayout>
        <header className="mobile-header">
          <div className="flex-1">
            <div className="skeleton h-4 w-24 mb-1" />
            <div className="skeleton h-5 w-32" />
          </div>
        </header>
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      {/* Minimal Header */}
      <header className="mobile-header">
        <div className="flex items-center gap-3 flex-1">
          <Image src="/favicon.png" alt="Studyz" width={28} height={28} priority />
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] mono">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <h1 className="text-sm font-semibold text-[var(--color-text)]">{firstName}</h1>
          </div>
        </div>
        <Link href="/m/profile" className="mobile-header-action">
          <div className="w-8 h-8 border border-[var(--color-border)] flex items-center justify-center text-xs font-semibold mono">
            {firstName[0]?.toUpperCase() || 'U'}
          </div>
        </Link>
      </header>

      <div ref={containerRef} className="mobile-content">
        <PullToRefreshIndicator progress={pullProgress} isRefreshing={isRefreshing} />
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 border-b border-[var(--color-border)]">
          <Link 
            href="/m/interactive-lessons"
            className="p-5 border-r border-[var(--color-border)] text-center active:bg-[var(--color-surface)]"
            onClick={() => triggerHaptic('light')}
          >
            <span className="block text-2xl font-semibold mono">{recentInteractive.length}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Lessons</span>
          </Link>
          <Link 
            href="/m/mcq"
            className="p-5 border-r border-[var(--color-border)] text-center active:bg-[var(--color-surface)]"
            onClick={() => triggerHaptic('light')}
          >
            <span className="block text-2xl font-semibold mono">{recentMcqs.length}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Quizzes</span>
          </Link>
          <Link 
            href="/m/intelligent-podcast"
            className="p-5 text-center active:bg-[var(--color-surface)]"
            onClick={() => triggerHaptic('light')}
          >
            <span className="block text-2xl font-semibold mono">{recentPodcasts.length}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Podcasts</span>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2">
          <Link 
            href="/m/interactive-lessons/new" 
            className="p-6 border-r border-b border-[var(--color-border)] active:bg-[var(--color-surface)]"
            onClick={() => triggerHaptic('light')}
          >
            <div className="w-8 h-8 border border-[var(--color-border)] flex items-center justify-center mb-4">
              <FiPlus className="w-4 h-4" strokeWidth={1} />
            </div>
            <h3 className="font-medium text-sm mb-1">New Lesson</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">Interactive + MCQs</p>
          </Link>
          <Link 
            href="/m/mcq/new" 
            className="p-6 border-b border-[var(--color-border)] active:bg-[var(--color-surface)]"
            onClick={() => triggerHaptic('light')}
          >
            <div className="w-8 h-8 border border-[var(--color-border)] flex items-center justify-center mb-4">
              <FiPlus className="w-4 h-4" strokeWidth={1} />
            </div>
            <h3 className="font-medium text-sm mb-1">New Quiz</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">Extract MCQs</p>
          </Link>
          <Link 
            href="/m/intelligent-podcast/new" 
            className="p-6 border-r active:bg-[var(--color-surface)]"
            onClick={() => triggerHaptic('light')}
          >
            <div className="w-8 h-8 border border-[var(--color-border)] flex items-center justify-center mb-4">
              <FiPlus className="w-4 h-4" strokeWidth={1} />
            </div>
            <h3 className="font-medium text-sm mb-1">New Podcast</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">AI Audio</p>
          </Link>
        </div>

        {/* Recent Interactive Lessons */}
        <section className="border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)] font-medium">Recent Lessons</h2>
            <Link 
              href="/m/interactive-lessons" 
              className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
            >
              All →
            </Link>
          </div>
          
          {recentInteractive.length > 0 ? (
            <div>
              {recentInteractive.slice(0, 3).map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/m/interactive-lessons/${lesson.id}`}
                  className="flex items-center justify-between px-4 py-4 border-b border-[var(--color-border)] last:border-b-0 active:bg-[var(--color-surface)]"
                  onClick={() => triggerHaptic('light')}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{lesson.name}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mono mt-0.5">
                      {lesson.status}
                    </p>
                  </div>
                  <FiArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] ml-4" strokeWidth={1} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)] mb-4">No lessons yet</p>
              <Link href="/m/interactive-lessons/new" className="btn-mobile btn-primary-mobile inline-flex">
                Create Lesson
              </Link>
            </div>
          )}
        </section>

        {/* Recent Quizzes */}
        <section>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)] font-medium">Recent Quizzes</h2>
            <Link 
              href="/m/mcq" 
              className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
            >
              All →
            </Link>
          </div>
          
          {recentMcqs.length > 0 ? (
            <div>
              {recentMcqs.slice(0, 3).map((mcq) => (
                <Link
                  key={mcq.id}
                  href={`/m/mcq/${mcq.id}`}
                  className="flex items-center justify-between px-4 py-4 border-b border-[var(--color-border)] last:border-b-0 active:bg-[var(--color-surface)]"
                  onClick={() => triggerHaptic('light')}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{mcq.name}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mono mt-0.5">
                      {mcq.total_questions}q
                    </p>
                  </div>
                  <FiArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] ml-4" strokeWidth={1} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)] mb-4">No quizzes yet</p>
              <Link href="/m/mcq/new" className="btn-mobile btn-primary-mobile inline-flex">
                Create Quiz
                </Link>
            </div>
          )}
        </section>
      </div>

      <FloatingActionButton
        href="/m/interactive-lessons/new"
        icon={<FiPlus strokeWidth={1.5} />}
        label="Create"
      />
    </MobileLayout>
  )
}
