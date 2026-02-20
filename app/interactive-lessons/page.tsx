'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiPlus, FiZap, FiTrash2, FiArrowRight, FiLogOut, FiHome, FiBook, FiCheckSquare, FiMic } from 'react-icons/fi'
import Link from 'next/link'
import type { InteractiveLesson } from '@/types/db'
import Logo from '@/components/Logo'

interface InteractiveLessonWithCounts extends InteractiveLesson {
  lessonDocCount?: number
  mcqDocCount?: number
}

export default function InteractiveLessonsPage() {
  const [user, setUser] = useState<any>(null)
  const [lessons, setLessons] = useState<InteractiveLessonWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadLessons()
  }, [])

  const loadLessons = async () => {
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
      if (!session) {
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/interactive-lessons', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
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
  }

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Delete this interactive lesson?')) return

    setDeleting(lessonId)
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/interactive-lessons/${lessonId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        setLessons(lessons.filter(l => l.id !== lessonId))
      }
    } catch (error) {
      console.error('Error deleting interactive lesson:', error)
    } finally {
      setDeleting(null)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="text-xs px-2 py-0.5 bg-success-muted text-success rounded">Ready</span>
      case 'processing':
        return <span className="text-xs px-2 py-0.5 bg-warning-muted text-warning rounded">Processing</span>
      case 'error':
        return <span className="text-xs px-2 py-0.5 bg-error-muted text-error rounded">Error</span>
      default:
        return <span className="text-xs px-2 py-0.5 bg-surface text-text-tertiary rounded">Draft</span>
    }
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
          <Link href="/dashboard" className="sidebar-item">
            <FiHome className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link href="/lessons" className="sidebar-item">
            <FiBook className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Lessons</span>
          </Link>
          <Link href="/interactive-lessons" className="sidebar-item sidebar-item-active">
            <FiZap className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Interactive</span>
          </Link>
          <Link href="/mcq" className="sidebar-item">
            <FiCheckSquare className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Quiz Sets</span>
          </Link>
          <Link href="/intelligent-podcast" className="sidebar-item">
            <FiMic className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">AI Podcasts</span>
          </Link>
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 border border-border flex items-center justify-center text-sm font-medium mono">
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
        <header className="h-14 border-b border-border flex items-center justify-between px-8">
          <h1 className="text-sm font-medium text-text-primary uppercase tracking-wider">Interactive Lessons</h1>
          <Link href="/interactive-lessons/new" className="btn-primary">
            <FiPlus className="w-4 h-4" strokeWidth={1.5} />
            New Interactive
          </Link>
        </header>

        <div className="p-8 max-w-4xl">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner" />
          </div>
        ) : lessons.length === 0 ? (
            <div className="border border-border p-10 text-center">
              <div className="w-12 h-12 border border-border flex items-center justify-center mx-auto mb-4 text-text-tertiary">
                <FiZap className="w-5 h-5" strokeWidth={1.5} />
            </div>
              <h3 className="font-medium text-text-primary mb-2">No interactive lessons yet</h3>
              <p className="text-sm text-text-secondary mb-6 max-w-xs mx-auto">
              Create your first interactive lesson or convert an existing lesson.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/interactive-lessons/new" className="btn-primary inline-flex">
                  <FiPlus className="w-4 h-4" strokeWidth={1.5} />
                Create New
              </Link>
              <Link href="/lessons" className="btn-secondary inline-flex">
                  <FiBook className="w-4 h-4" strokeWidth={1.5} />
                From Lesson
              </Link>
            </div>
          </div>
        ) : (
            <div className="border border-border divide-y divide-border">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                  className="flex items-center justify-between p-4 hover:bg-elevated transition-colors"
              >
                <Link
                  href={`/interactive-lessons/${lesson.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                >
                    <div className="w-10 h-10 border border-border flex items-center justify-center text-text-tertiary">
                      <FiZap className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-text-primary truncate">{lesson.name}</h3>
                        {getStatusBadge(lesson.status)}
                      </div>
                      <p className="text-xs text-text-tertiary mono">
                        {lesson.lessonDocCount || 0} docs · {new Date(lesson.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                  <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDelete(lesson.id)}
                  disabled={deleting === lesson.id}
                      className="p-2 text-text-tertiary hover:text-error transition-colors"
                >
                  {deleting === lesson.id ? (
                        <div className="spinner spinner-sm" />
                  ) : (
                        <FiTrash2 className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
                    <Link
                      href={`/interactive-lessons/${lesson.id}`}
                      className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </Link>
                  </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </main>
    </div>
  )
}

