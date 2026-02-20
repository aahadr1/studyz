'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLogOut, FiHome, FiPlus, FiArrowRight, FiCheckSquare, FiZap, FiMic } from 'react-icons/fi'
import Link from 'next/link'
import type { InteractiveLesson } from '@/types/db'
import Logo from '@/components/Logo'

interface McqSet {
  id: string
  name: string
  total_questions: number
  created_at: string
}

interface InteractiveLessonWithCounts extends InteractiveLesson {
  lessonDocCount?: number
  mcqDocCount?: number
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [recentInteractive, setRecentInteractive] = useState<InteractiveLessonWithCounts[]>([])
  const [recentMcqs, setRecentMcqs] = useState<McqSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadDashboard = async () => {
      const supabase = createClient()
      
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !authUser) {
          window.location.href = '/login'
          return
        }

        setUser({
          email: authUser.email,
          fullName: authUser.user_metadata?.full_name || 'Student',
        })

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const [interactiveRes, mcqRes] = await Promise.all([
          fetch('/api/interactive-lessons', { headers: { 'Authorization': `Bearer ${session.access_token}` }}),
          fetch('/api/mcq/list', { headers: { 'Authorization': `Bearer ${session.access_token}` }}),
        ])
        
        if (interactiveRes.ok) {
          const data = await interactiveRes.json()
          setRecentInteractive((data.lessons || []).slice(0, 5))
        }
        if (mcqRes.ok) {
          const data = await mcqRes.json()
          setRecentMcqs((data.sets || []).slice(0, 5))
        }
      }
      } catch (err: any) {
        console.error('Dashboard error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Logo size="md" href="/dashboard" />
        </div>

        <nav className="flex-1 py-4">
          <div className="sidebar-section-title">Menu</div>
          <Link href="/dashboard" className="sidebar-item sidebar-item-active">
            <FiHome className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link href="/interactive-lessons" className="sidebar-item">
            <FiZap className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Lessons</span>
          </Link>
          <Link href="/mcq" className="sidebar-item">
            <FiCheckSquare className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Quiz Sets</span>
          </Link>
          <Link href="/intelligent-podcast" className="sidebar-item">
            <FiMic className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Podcasts</span>
          </Link>
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 border border-border rounded-lg flex items-center justify-center text-sm font-medium mono bg-elevated">
              {user?.fullName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary truncate mono">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-text-tertiary hover:text-error"
          >
            <FiLogOut className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-border flex items-center px-8">
          <h1 className="text-sm font-medium text-text-primary uppercase tracking-wider">Dashboard</h1>
        </header>

        <div className="p-8 max-w-5xl">
          {/* Welcome */}
          <div className="mb-10">
            <p className="text-xs text-text-tertiary uppercase tracking-widest mb-2 mono">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <h2 className="text-3xl font-semibold text-text-primary">
              {user?.fullName ? `Hello, ${user.fullName.split(' ')[0]}` : 'Welcome back'}
            </h2>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="p-6 bg-elevated border border-border rounded-xl">
              <span className="block text-3xl font-semibold mono text-text-primary">{recentInteractive.length}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Lessons</span>
            </div>
            <div className="p-6 bg-elevated border border-border rounded-xl">
              <span className="block text-3xl font-semibold mono text-text-primary">{recentMcqs.length}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Quizzes</span>
            </div>
            <div className="p-6 bg-elevated border border-border rounded-xl">
              <span className="block text-3xl font-semibold mono text-text-primary">0</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Podcasts</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <Link href="/interactive-lessons/new" className="bg-elevated border border-border rounded-xl p-6 group hover:bg-hover hover:border-border-light hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="w-12 h-12 border border-border rounded-xl flex items-center justify-center mb-4 group-hover:border-text-primary group-hover:bg-surface transition-all">
                    <FiZap className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-medium text-text-primary mb-1">New Lesson</h3>
                  <p className="text-sm text-text-secondary">Interactive with MCQ checkpoints</p>
                </div>
                <FiArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" strokeWidth={1.5} />
              </div>
            </Link>

            <Link href="/mcq/new" className="bg-elevated border border-border rounded-xl p-6 group hover:bg-hover hover:border-border-light hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="w-12 h-12 border border-border rounded-xl flex items-center justify-center mb-4 group-hover:border-text-primary group-hover:bg-surface transition-all">
                    <FiCheckSquare className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-medium text-text-primary mb-1">New Quiz Set</h3>
                  <p className="text-sm text-text-secondary">Extract MCQs from documents</p>
                </div>
                <FiArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" strokeWidth={1.5} />
              </div>
            </Link>

            <Link href="/intelligent-podcast/new" className="bg-elevated border border-border rounded-xl p-6 group hover:bg-hover hover:border-border-light hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="w-12 h-12 border border-border rounded-xl flex items-center justify-center mb-4 group-hover:border-text-primary group-hover:bg-surface transition-all">
                    <FiMic className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-medium text-text-primary mb-1">New Podcast</h3>
                  <p className="text-sm text-text-secondary">AI-generated audio conversations</p>
                </div>
                <FiArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" strokeWidth={1.5} />
              </div>
            </Link>
          </div>

          {/* Recent Interactive Lessons */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-widest">Recent Lessons</h3>
              <Link href="/interactive-lessons" className="text-xs text-text-secondary hover:text-text-primary transition-colors">
                View all →
              </Link>
            </div>
            
            {recentInteractive.length > 0 ? (
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border bg-elevated">
                {recentInteractive.map((lesson) => (
                  <Link
                    key={lesson.id}
                    href={`/interactive-lessons/${lesson.id}`}
                    className="flex items-center justify-between p-4 hover:bg-hover transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 border border-border rounded-lg flex items-center justify-center text-text-tertiary bg-surface">
                        <FiZap className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-medium text-text-primary truncate">{lesson.name}</h4>
                        <p className="text-xs text-text-tertiary mono">
                          {lesson.status}
                        </p>
                      </div>
                    </div>
                    <FiArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-8 text-center bg-elevated">
                <div className="w-12 h-12 border border-border rounded-xl flex items-center justify-center mx-auto mb-4 text-text-tertiary bg-surface">
                  <FiZap className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h4 className="font-medium text-text-primary mb-2">No lessons yet</h4>
                <p className="text-sm text-text-secondary mb-4">Create your first interactive lesson</p>
                <Link href="/interactive-lessons/new" className="btn-primary inline-flex">
                  <FiPlus className="w-4 h-4" strokeWidth={1.5} />
                  Create Lesson
                </Link>
              </div>
            )}
          </section>

          {/* Recent Quizzes */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-widest">Recent Quizzes</h3>
              <Link href="/mcq" className="text-xs text-text-secondary hover:text-text-primary transition-colors">
                View all →
              </Link>
            </div>
            
            {recentMcqs.length > 0 ? (
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border bg-elevated">
                {recentMcqs.map((mcq) => (
                  <Link
                    key={mcq.id}
                    href={`/mcq/${mcq.id}`}
                    className="flex items-center justify-between p-4 hover:bg-hover transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 border border-border rounded-lg flex items-center justify-center text-text-tertiary bg-surface">
                        <FiCheckSquare className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-medium text-text-primary truncate">{mcq.name}</h4>
                        <p className="text-xs text-text-tertiary mono">
                          {mcq.total_questions} questions
                        </p>
                      </div>
                    </div>
                    <FiArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-8 text-center bg-elevated">
                <div className="w-12 h-12 border border-border rounded-xl flex items-center justify-center mx-auto mb-4 text-text-tertiary bg-surface">
                  <FiCheckSquare className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h4 className="font-medium text-text-primary mb-2">No quizzes yet</h4>
                <p className="text-sm text-text-secondary mb-4">Create your first quiz set to practice</p>
                <Link href="/mcq/new" className="btn-primary inline-flex">
                  <FiPlus className="w-4 h-4" strokeWidth={1.5} />
                  Create Quiz
              </Link>
            </div>
          )}
          </section>
        </div>
      </main>
    </div>
  )
}
