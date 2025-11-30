'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLogOut, FiHome, FiBook, FiPlus, FiArrowRight } from 'react-icons/fi'
import Link from 'next/link'
import type { Lesson } from '@/types/db'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [recentLessons, setRecentLessons] = useState<Lesson[]>([])

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

        // Load recent lessons
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const response = await fetch('/api/lessons', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            setRecentLessons((data.lessons || []).slice(0, 3))
          }
        }
      } catch (err: any) {
        console.error('Dashboard error:', err)
      }
    }

    loadDashboard()
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 sidebar flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border">
          <span className="text-lg font-semibold text-text-primary">Studyz</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <div className="sidebar-section-title">Menu</div>
          <Link
            href="/dashboard"
            className="sidebar-item sidebar-item-active"
          >
            <FiHome className="w-4 h-4" />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link
            href="/lessons"
            className="sidebar-item"
          >
            <FiBook className="w-4 h-4" />
            <span className="text-sm">Interactive Lessons</span>
          </Link>
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-accent rounded-md flex items-center justify-center text-white text-sm font-medium">
              {user?.fullName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-text-tertiary hover:text-error"
          >
            <FiLogOut className="w-4 h-4" />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-8">
          <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
        </header>

        {/* Content */}
        <div className="p-8 max-w-4xl">
          {/* Welcome */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-text-primary mb-2">
              Welcome back{user?.fullName ? `, ${user.fullName}` : ''}
            </h2>
            <p className="text-text-secondary">Start learning with AI-powered interactive lessons</p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Create Interactive Lesson Card */}
            <Link href="/lessons/new" className="card p-6 card-hover group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-accent-muted rounded-lg flex items-center justify-center group-hover:bg-accent transition-colors">
                  <FiPlus className="w-6 h-6 text-accent group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-text-primary mb-1">
                    Create Interactive Lesson
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Upload a PDF and learn with AI assistance
                  </p>
                </div>
                <FiArrowRight className="w-5 h-5 text-text-tertiary group-hover:text-accent transition-colors" />
              </div>
            </Link>

            {/* View All Lessons Card */}
            <Link href="/lessons" className="card p-6 card-hover group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center group-hover:bg-accent-muted transition-colors">
                  <FiBook className="w-6 h-6 text-text-tertiary group-hover:text-accent transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-text-primary mb-1">
                    View All Lessons
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Continue learning from your saved lessons
                  </p>
                </div>
                <FiArrowRight className="w-5 h-5 text-text-tertiary group-hover:text-accent transition-colors" />
              </div>
            </Link>
          </div>

          {/* Recent Lessons */}
          {recentLessons.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">Recent Lessons</h3>
                <Link href="/lessons" className="text-sm text-accent hover:underline">
                  View all
                </Link>
              </div>
              <div className="grid gap-3">
                {recentLessons.map((lesson) => (
                  <Link
                    key={lesson.id}
                    href={`/lessons/${lesson.id}`}
                    className="card p-4 flex items-center gap-4 card-hover"
                  >
                    <div className="w-10 h-10 bg-accent-muted rounded-lg flex items-center justify-center">
                      <FiBook className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-text-primary truncate">{lesson.name}</h4>
                      <p className="text-sm text-text-tertiary">
                        {lesson.total_pages} page{lesson.total_pages !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <FiArrowRight className="w-4 h-4 text-text-tertiary" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no lessons */}
          {recentLessons.length === 0 && (
            <div className="card p-8 text-center">
              <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiBook className="w-6 h-6 text-text-tertiary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                No lessons yet
              </h3>
              <p className="text-text-secondary max-w-sm mx-auto mb-4">
                Create your first interactive lesson to start learning with AI assistance.
              </p>
              <Link href="/lessons/new" className="btn-primary inline-flex">
                <FiPlus className="w-4 h-4" />
                Create Your First Lesson
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
