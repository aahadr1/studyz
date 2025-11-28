'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiBook, FiFileText, FiLogOut, FiPlus, FiTrendingUp, FiClock, FiArrowRight } from 'react-icons/fi'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({ totalLessons: 0, totalDocuments: 0 })

  useEffect(() => {
    const loadDashboard = async () => {
      const supabase = createClient()
      
      try {
        // Get user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !authUser) {
          window.location.href = '/login'
          return
        }

        setUser({
          email: authUser.email,
          fullName: authUser.user_metadata?.full_name || 'Student',
        })

        // Get stats
        const { count: lessonsCount } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', authUser.id)

        setStats({
          totalLessons: lessonsCount || 0,
          totalDocuments: 0,
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

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="glass-card border-b border-dark-border sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-accent-purple to-accent-blue rounded-lg flex items-center justify-center">
                <FiBook className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text">Studyz</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-accent-purple to-accent-blue rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {user?.fullName?.[0]?.toUpperCase() || 'S'}
                </div>
                <span className="text-gray-300">{user?.email || 'Loading...'}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-400 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-dark-surface"
              >
                <FiLogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto section-padding">
        {/* Welcome Section */}
        <div className="mb-10 animate-fade-in">
          <h1 className="text-4xl font-bold text-white mb-2">
            Welcome back{user?.fullName ? `, ${user.fullName}` : ''}! 👋
          </h1>
          <p className="text-gray-400 text-lg">Ready to continue your learning journey?</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Total Lessons Card */}
          <div className="glass-card p-6 card-hover animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-accent-purple to-purple-600 rounded-xl flex items-center justify-center">
                <FiBook className="w-6 h-6 text-white" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{stats.totalLessons}</p>
                <p className="text-sm text-gray-400">Total Lessons</p>
              </div>
            </div>
            <div className="flex items-center text-green-400 text-sm">
              <FiTrendingUp className="w-4 h-4 mr-1" />
              <span>Active learning</span>
            </div>
          </div>

          {/* Total Documents Card */}
          <div className="glass-card p-6 card-hover animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-accent-blue to-cyan-600 rounded-xl flex items-center justify-center">
                <FiFileText className="w-6 h-6 text-white" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{stats.totalDocuments}</p>
                <p className="text-sm text-gray-400">Documents</p>
              </div>
            </div>
            <div className="flex items-center text-blue-400 text-sm">
              <FiClock className="w-4 h-4 mr-1" />
              <span>Ready to study</span>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="glass-card p-6 card-hover animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-accent-cyan to-blue-600 rounded-xl flex items-center justify-center">
                <FiTrendingUp className="w-6 h-6 text-white" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">
                  {stats.totalLessons > 0 ? Math.round((stats.totalLessons / 10) * 100) : 0}%
                </p>
                <p className="text-sm text-gray-400">Progress</p>
              </div>
            </div>
            <div className="flex items-center text-cyan-400 text-sm">
              <FiTrendingUp className="w-4 h-4 mr-1" />
              <span>Keep it up!</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-8 mb-10 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <h2 className="text-2xl font-bold text-white mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* View Lessons */}
            <a
              href="/lessons"
              className="group relative overflow-hidden rounded-xl p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20 hover:border-purple-500/50 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-600/0 group-hover:from-purple-500/10 group-hover:to-purple-600/10 transition-all duration-300"></div>
              <div className="relative flex items-center space-x-4">
                <div className="w-14 h-14 bg-gradient-to-br from-accent-purple to-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <FiBook className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">View Lessons</h3>
                  <p className="text-sm text-gray-400">Browse and manage your lessons</p>
                </div>
                <FiArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-2 transition-all duration-300" />
              </div>
            </a>

            {/* Create Lesson */}
            <a
              href="/lessons?new=true"
              className="group relative overflow-hidden rounded-xl p-6 bg-gradient-to-br from-blue-500/10 to-cyan-600/10 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-cyan-600/0 group-hover:from-blue-500/10 group-hover:to-cyan-600/10 transition-all duration-300"></div>
              <div className="relative flex items-center space-x-4">
                <div className="w-14 h-14 bg-gradient-to-br from-accent-blue to-accent-cyan rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <FiPlus className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">New Lesson</h3>
                  <p className="text-sm text-gray-400">Create and upload new materials</p>
                </div>
                <FiArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-2 transition-all duration-300" />
              </div>
            </a>
          </div>
        </div>

        {/* Getting Started Guide (if no lessons) */}
        {stats.totalLessons === 0 && (
          <div className="glass-card p-8 text-center animate-slide-up" style={{ animationDelay: '400ms' }}>
            <div className="w-20 h-20 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto mb-6 flex items-center justify-center glow-primary">
              <FiBook className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Start Your Learning Journey</h3>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Create your first lesson by uploading study materials. Our AI will help you learn more effectively.
            </p>
            <a href="/lessons?new=true">
              <button className="btn-accent flex items-center space-x-2 mx-auto group">
                <FiPlus className="w-5 h-5" />
                <span>Create Your First Lesson</span>
                <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
