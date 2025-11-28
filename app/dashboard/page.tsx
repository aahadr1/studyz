'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiBook, FiFileText, FiLogOut, FiPlus } from 'react-icons/fi'

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-blue-600">Studyz</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">{user?.email || 'Loading...'}</span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-600 hover:text-red-600 transition"
              >
                <FiLogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome{user?.fullName ? `, ${user.fullName}` : ''}!
          </h2>
          <p className="text-gray-600 mt-2">Ready to study?</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Lessons</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalLessons}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <FiBook className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Documents</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalDocuments}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <FiFileText className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="/lessons"
              className="flex items-center space-x-4 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-200"
            >
              <div className="bg-blue-600 p-3 rounded-lg">
                <FiBook className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">View Lessons</p>
                <p className="text-sm text-gray-600">Browse your lessons</p>
              </div>
            </a>

            <a
              href="/lessons?new=true"
              className="flex items-center space-x-4 p-4 bg-green-50 hover:bg-green-100 rounded-lg transition border border-green-200"
            >
              <div className="bg-green-600 p-3 rounded-lg">
                <FiPlus className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">New Lesson</p>
                <p className="text-sm text-gray-600">Create a lesson</p>
              </div>
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
