'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, BottomSheet } from '@/components/mobile/MobileLayout'
import { FiLogOut, FiChevronRight } from 'react-icons/fi'

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
        fullName: authUser.user_metadata?.full_name || 'User',
        createdAt: authUser.created_at,
      })

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
      month: 'short',
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
        <div className="px-4 py-8 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 border border-[var(--color-border)] flex items-center justify-center text-xl font-semibold mono">
              {user?.fullName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{user?.fullName}</h2>
              <p className="text-xs text-[var(--color-text-secondary)] truncate mono">{user?.email}</p>
              {user?.createdAt && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 uppercase tracking-wider">
                  Since {formatJoinDate(user.createdAt)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 border-b border-[var(--color-border)]">
          <div className="p-5 border-r border-[var(--color-border)] text-center">
            <span className="block text-2xl font-semibold mono">{stats.lessons}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Lessons</span>
          </div>
          <div className="p-5 border-r border-[var(--color-border)] text-center">
            <span className="block text-2xl font-semibold mono">{stats.quizzes}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Quizzes</span>
          </div>
          <div className="p-5 text-center">
            <span className="block text-2xl font-semibold mono">0</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Streak</span>
          </div>
        </div>

        {/* Settings */}
        <div>
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">Settings</span>
          </div>
          
          <button className="flex items-center justify-between w-full px-4 py-4 border-b border-[var(--color-border)] active:bg-[var(--color-surface)]">
            <span className="text-sm">Notifications</span>
            <FiChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
          </button>
          
          <button className="flex items-center justify-between w-full px-4 py-4 border-b border-[var(--color-border)] active:bg-[var(--color-surface)]">
            <span className="text-sm">Appearance</span>
            <span className="text-xs text-[var(--color-text-tertiary)] mono">Dark</span>
          </button>
          
          <button className="flex items-center justify-between w-full px-4 py-4 border-b border-[var(--color-border)] active:bg-[var(--color-surface)]">
            <span className="text-sm">About</span>
            <span className="text-xs text-[var(--color-text-tertiary)] mono">v1.0</span>
          </button>
        </div>

        {/* Sign Out */}
        <div className="p-4">
          <button
            onClick={() => setShowLogoutSheet(true)}
            className="btn-mobile btn-secondary-mobile w-full"
          >
            <FiLogOut className="w-4 h-4" strokeWidth={1.5} />
            Sign Out
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center py-6 gap-2">
          <Image src="/favicon.png" alt="Studyz" width={24} height={24} />
          <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-widest">
            Studyz © 2025
          </p>
        </div>
      </div>

      <BottomSheet
        isOpen={showLogoutSheet}
        onClose={() => setShowLogoutSheet(false)}
        title="Sign Out"
      >
        <div className="text-center pb-4">
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Are you sure you want to sign out?
          </p>
          <div className="space-y-3">
            <button
              onClick={handleLogout}
              className="btn-mobile btn-primary-mobile w-full"
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
