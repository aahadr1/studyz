'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, FloatingActionButton, EmptyState } from '@/components/mobile/MobileLayout'
import { 
  FiPlus, 
  FiBook, 
  FiCheckSquare, 
  FiArrowRight, 
  FiClock,
  FiTrendingUp,
  FiAward,
  FiZap,
  FiUpload,
  FiFileText
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

  useEffect(() => {
    // Set greeting based on time
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    loadDashboard()
  }, [])

  const loadDashboard = async () => {
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
  }

  const firstName = user?.fullName?.split(' ')[0] || 'there'

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Home" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
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
      <div className="mobile-content">
        {/* Quick Stats */}
        <section className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="feature-card p-4 text-center">
              <div className="feature-card-icon cyan mx-auto mb-2 w-10 h-10">
                <FiBook className="w-5 h-5" />
              </div>
              <div className="text-xl font-bold text-[var(--color-text-primary)]">{recentLessons.length}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Lessons</div>
            </div>
            <div className="feature-card p-4 text-center">
              <div className="feature-card-icon purple mx-auto mb-2 w-10 h-10">
                <FiCheckSquare className="w-5 h-5" />
              </div>
              <div className="text-xl font-bold text-[var(--color-text-primary)]">{recentMcqs.length}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Quizzes</div>
            </div>
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
            <Link href="/m/lessons/new" className="feature-card p-4 active:scale-[0.98] transition-transform">
              <div className="feature-card-icon cyan mb-3">
                <FiUpload className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1">New Lesson</h3>
              <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
                Upload a PDF to study
              </p>
            </Link>
            <Link href="/m/mcq/new" className="feature-card p-4 active:scale-[0.98] transition-transform">
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
            <Link href="/m/lessons" className="text-xs font-semibold text-[var(--color-accent)]">
              See all
            </Link>
          </div>
          
          {recentLessons.length > 0 ? (
            <div 
              ref={horizontalScrollRef}
              className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar"
            >
              {recentLessons.map((lesson, index) => (
                <Link
                  key={lesson.id}
                  href={`/m/lessons/${lesson.id}`}
                  className="flex-shrink-0 w-[200px] mobile-card p-4 active:scale-[0.98] transition-transform animate-slide-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-soft)] flex items-center justify-center mb-3">
                    <FiBook className="w-5 h-5 text-[var(--color-accent)]" />
                  </div>
                  <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-1 line-clamp-2">
                    {lesson.name}
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {lesson.total_pages} page{lesson.total_pages !== 1 ? 's' : ''}
                  </p>
                </Link>
              ))}
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
            <Link href="/m/mcq" className="text-xs font-semibold text-[var(--color-accent)]">
              See all
            </Link>
          </div>
          
          {recentMcqs.length > 0 ? (
            <div className="px-4 space-y-2 stagger-children">
              {recentMcqs.slice(0, 3).map((mcq) => (
                <Link
                  key={mcq.id}
                  href={`/m/mcq/${mcq.id}`}
                  className="item-card"
                >
                  <div className="item-card-icon bg-[var(--color-secondary-soft)]">
                    <FiCheckSquare className="text-[var(--color-secondary)]" />
                  </div>
                  <div className="item-card-content">
                    <h3 className="item-card-title">{mcq.name}</h3>
                    <p className="item-card-meta">
                      {mcq.total_questions} question{mcq.total_questions !== 1 ? 's' : ''}
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

