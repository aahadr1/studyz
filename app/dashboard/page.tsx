'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { 
  FiBook, FiFileText, FiLogOut, FiPlus, FiChevronRight, 
  FiLayers, FiHome, FiSettings 
} from 'react-icons/fi'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({ totalLessons: 0, totalDocuments: 0, interactiveLessons: 0 })

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

        const { count: lessonsCount } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', authUser.id)

        const { count: interactiveLessonsCount } = await supabase
          .from('interactive_lessons')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', authUser.id)

        setStats({
          totalLessons: lessonsCount || 0,
          totalDocuments: 0,
          interactiveLessons: interactiveLessonsCount || 0,
        })
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

  const navItems = [
    { icon: FiHome, label: 'Dashboard', href: '/dashboard', active: true },
    { icon: FiBook, label: 'Lessons', href: '/lessons' },
    { icon: FiLayers, label: 'Interactive', href: '/interactive-lessons' },
  ]

  const quickActions = [
    {
      title: 'Interactive Lessons',
      description: 'Gamified learning with PDF pages & quizzes',
      href: '/interactive-lessons',
      badge: stats.interactiveLessons > 0 ? stats.interactiveLessons.toString() : null,
      highlight: true,
    },
    {
      title: 'My Lessons',
      description: 'Browse and manage your lessons',
      href: '/lessons',
      badge: stats.totalLessons > 0 ? stats.totalLessons.toString() : null,
    },
    {
      title: 'New Lesson',
      description: 'Create and upload new materials',
      href: '/lessons?new=true',
    },
  ]

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
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`sidebar-item ${item.active ? 'sidebar-item-active' : ''}`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm">{item.label}</span>
            </a>
          ))}
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
            <p className="text-text-secondary">Continue your learning journey</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-accent-muted rounded-md flex items-center justify-center">
                  <FiBook className="w-4 h-4 text-accent" />
                </div>
                <span className="text-2xl font-semibold text-text-primary">{stats.totalLessons}</span>
              </div>
              <p className="text-sm text-text-tertiary">Lessons</p>
            </div>
            
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-accent-muted rounded-md flex items-center justify-center">
                  <FiLayers className="w-4 h-4 text-accent" />
                </div>
                <span className="text-2xl font-semibold text-text-primary">{stats.interactiveLessons}</span>
              </div>
              <p className="text-sm text-text-tertiary">Interactive</p>
            </div>
            
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-accent-muted rounded-md flex items-center justify-center">
                  <FiFileText className="w-4 h-4 text-accent" />
                </div>
                <span className="text-2xl font-semibold text-text-primary">{stats.totalDocuments}</span>
              </div>
              <p className="text-sm text-text-tertiary">Documents</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <h3 className="text-sm font-medium text-text-tertiary uppercase tracking-wider mb-4">
              Quick Actions
            </h3>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <a
                  key={action.title}
                  href={action.href}
                  className={`card card-hover p-4 flex items-center gap-4 group ${
                    action.highlight ? 'border-accent/30' : ''
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-text-primary font-medium">{action.title}</span>
                      {action.badge && (
                        <span className="badge badge-accent">{action.badge}</span>
                      )}
                    </div>
                    <p className="text-sm text-text-tertiary">{action.description}</p>
                  </div>
                  <FiChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-secondary transition-colors" />
                </a>
              ))}
            </div>
          </div>

          {/* Empty state for new users */}
          {stats.totalLessons === 0 && stats.interactiveLessons === 0 && (
            <div className="card p-8 text-center">
              <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
                <FiBook className="w-6 h-6 text-text-tertiary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Start your learning journey
              </h3>
              <p className="text-text-secondary mb-6 max-w-sm mx-auto">
                Create your first lesson by uploading study materials. Our AI will help you learn more effectively.
              </p>
              <a href="/lessons?new=true" className="btn-primary">
                <FiPlus className="w-4 h-4" />
                Create First Lesson
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
