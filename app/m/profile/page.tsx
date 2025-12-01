'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, BottomSheet } from '@/components/mobile/MobileLayout'
import { 
  FiUser, 
  FiMail, 
  FiLogOut, 
  FiChevronRight,
  FiBook,
  FiCheckSquare,
  FiAward,
  FiSettings,
  FiHelpCircle,
  FiInfo,
  FiMoon,
  FiBell
} from 'react-icons/fi'

export default function MobileProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showLogoutSheet, setShowLogoutSheet] = useState(false)
  const [stats, setStats] = useState({ lessons: 0, quizzes: 0 })

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const supabase = createClient()
    
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser()
      
      if (error || !authUser) {
        router.push('/m/login')
        return
      }

      setUser({
        email: authUser.email,
        fullName: authUser.user_metadata?.full_name || 'Student',
        createdAt: authUser.created_at,
      })

      // Load stats
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const [lessonsRes, mcqRes] = await Promise.all([
          fetch('/api/lessons', { headers: { 'Authorization': `Bearer ${session.access_token}` }}),
          fetch('/api/mcq/list', { headers: { 'Authorization': `Bearer ${session.access_token}` }}),
        ])
        
        if (lessonsRes.ok) {
          const data = await lessonsRes.json()
          setStats(prev => ({ ...prev, lessons: (data.lessons || []).length }))
        }
        if (mcqRes.ok) {
          const data = await mcqRes.json()
          setStats(prev => ({ ...prev, quizzes: (data.sets || []).length }))
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/m/login')
  }

  const formatJoinDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Profile" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      <MobileHeader title="Profile" />

      <div className="mobile-content">
        {/* Profile Header */}
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center text-3xl font-bold text-[var(--color-bg-primary)]">
              {user?.fullName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-[var(--color-text-primary)] truncate">
                {user?.fullName}
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] truncate">
                {user?.email}
              </p>
              {user?.createdAt && (
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  Joined {formatJoinDate(user.createdAt)}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="mobile-card p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-soft)] flex items-center justify-center mx-auto mb-2">
                <FiBook className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.lessons}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Lessons</div>
            </div>
            <div className="mobile-card p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-secondary-soft)] flex items-center justify-center mx-auto mb-2">
                <FiCheckSquare className="w-5 h-5 text-[var(--color-secondary)]" />
              </div>
              <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.quizzes}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Quizzes</div>
            </div>
            <div className="mobile-card p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-tertiary-soft)] flex items-center justify-center mx-auto mb-2">
                <FiAward className="w-5 h-5 text-[var(--color-tertiary)]" />
              </div>
              <div className="text-lg font-bold text-[var(--color-text-primary)]">0</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] font-medium">Streak</div>
            </div>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="px-4 py-4">
          {/* Preferences */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3 px-1">
              Preferences
            </h3>
            <div className="mobile-card overflow-hidden">
              <button className="flex items-center gap-4 w-full p-4 border-b border-[var(--color-border)] active:bg-[var(--color-surface-hover)]">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center">
                  <FiBell className="w-4 h-4 text-[var(--color-text-secondary)]" />
                </div>
                <span className="flex-1 text-left font-medium text-[var(--color-text-primary)]">Notifications</span>
                <FiChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)]" />
              </button>
              <button className="flex items-center gap-4 w-full p-4 active:bg-[var(--color-surface-hover)]">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center">
                  <FiMoon className="w-4 h-4 text-[var(--color-text-secondary)]" />
                </div>
                <span className="flex-1 text-left font-medium text-[var(--color-text-primary)]">Appearance</span>
                <span className="text-sm text-[var(--color-text-tertiary)]">Dark</span>
                <FiChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)]" />
              </button>
            </div>
          </div>

          {/* Support */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3 px-1">
              Support
            </h3>
            <div className="mobile-card overflow-hidden">
              <button className="flex items-center gap-4 w-full p-4 border-b border-[var(--color-border)] active:bg-[var(--color-surface-hover)]">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center">
                  <FiHelpCircle className="w-4 h-4 text-[var(--color-text-secondary)]" />
                </div>
                <span className="flex-1 text-left font-medium text-[var(--color-text-primary)]">Help Center</span>
                <FiChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)]" />
              </button>
              <button className="flex items-center gap-4 w-full p-4 active:bg-[var(--color-surface-hover)]">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center">
                  <FiInfo className="w-4 h-4 text-[var(--color-text-secondary)]" />
                </div>
                <span className="flex-1 text-left font-medium text-[var(--color-text-primary)]">About</span>
                <span className="text-sm text-[var(--color-text-tertiary)]">v1.0.0</span>
                <FiChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)]" />
              </button>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={() => setShowLogoutSheet(true)}
            className="btn-mobile btn-danger-mobile w-full"
          >
            <FiLogOut className="w-5 h-5" />
            Sign Out
          </button>

          {/* App Info */}
          <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-6">
            Studyz © 2025 • AI-Powered Learning
          </p>
        </div>
      </div>

      {/* Logout Confirmation Sheet */}
      <BottomSheet
        isOpen={showLogoutSheet}
        onClose={() => setShowLogoutSheet(false)}
        title="Sign Out"
      >
        <div className="text-center pb-4">
          <div className="w-16 h-16 rounded-full bg-[var(--color-error-soft)] flex items-center justify-center mx-auto mb-4">
            <FiLogOut className="w-8 h-8 text-[var(--color-error)]" />
          </div>
          <p className="text-[var(--color-text-secondary)] mb-6">
            Are you sure you want to sign out?
          </p>
          <div className="space-y-3">
            <button
              onClick={handleLogout}
              className="btn-mobile btn-danger-mobile w-full"
            >
              Yes, Sign Out
            </button>
            <button
              onClick={() => setShowLogoutSheet(false)}
              className="btn-mobile btn-secondary-mobile w-full"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}

