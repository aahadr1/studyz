'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLogOut, FiHome } from 'react-icons/fi'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)

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
          <a
            href="/dashboard"
            className="sidebar-item sidebar-item-active"
          >
            <FiHome className="w-4 h-4" />
            <span className="text-sm">Dashboard</span>
          </a>
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
            <p className="text-text-secondary">Your dashboard is ready for new features</p>
          </div>

          {/* Empty state */}
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
              <FiHome className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Ready for something new
            </h3>
            <p className="text-text-secondary max-w-sm mx-auto">
              This dashboard is ready for new features to be built.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
