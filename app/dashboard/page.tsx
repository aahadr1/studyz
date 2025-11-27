'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { FiBook, FiFileText, FiTrendingUp } from 'react-icons/fi'
import { getCurrentUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalLessons: 0,
    totalDocuments: 0,
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)

        // Get lessons count
        const { count: lessonsCount } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUser?.id)

        // Get documents count
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('user_id', currentUser?.id)

        if (lessons) {
          const lessonIds = lessons.map(l => l.id)
          const { count: documentsCount } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .in('lesson_id', lessonIds.length > 0 ? lessonIds : [''])

          setStats({
            totalLessons: lessonsCount || 0,
            totalDocuments: documentsCount || 0,
          })
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error)
      }
    }

    loadData()
  }, [])

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.user_metadata?.full_name || 'Student'}!
          </h1>
          <p className="text-gray-600 mt-2">Ready to continue your learning journey?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Lessons</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalLessons}</p>
              </div>
              <div className="bg-primary-100 p-3 rounded-lg">
                <FiBook className="w-6 h-6 text-primary-600" />
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

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Study Progress</p>
                <p className="text-3xl font-bold text-gray-900">0%</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <FiTrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/lessons')}
              className="w-full text-left px-6 py-4 bg-primary-50 hover:bg-primary-100 rounded-lg transition border border-primary-200"
            >
              <div className="flex items-center space-x-3">
                <FiBook className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="font-semibold text-gray-900">Go to Lessons</p>
                  <p className="text-sm text-gray-600">View and manage your study lessons</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

