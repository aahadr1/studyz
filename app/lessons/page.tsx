'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { FiPlus, FiBook, FiFileText, FiCalendar } from 'react-icons/fi'
import { getCurrentUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import NewLessonModal from '@/components/NewLessonModal'

interface Lesson {
  id: string
  name: string
  created_at: string
  documentCount: number
}

export default function LessonsPage() {
  const router = useRouter()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewLessonModal, setShowNewLessonModal] = useState(false)

  const loadLessons = async () => {
    try {
      const user = await getCurrentUser()
      
      const { data: lessonsData, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get document counts for each lesson
      const lessonsWithCounts = await Promise.all(
        (lessonsData || []).map(async (lesson) => {
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('lesson_id', lesson.id)

          return {
            ...lesson,
            documentCount: count || 0,
          }
        })
      )

      setLessons(lessonsWithCounts)
    } catch (error) {
      console.error('Error loading lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLessons()
  }, [])

  const handleLessonCreated = () => {
    setShowNewLessonModal(false)
    loadLessons()
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Lessons</h1>
            <p className="text-gray-600 mt-2">Organize your study materials into lessons</p>
          </div>
          <button
            onClick={() => setShowNewLessonModal(true)}
            className="flex items-center space-x-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition shadow-sm"
          >
            <FiPlus className="w-5 h-5" />
            <span className="font-semibold">New Lesson</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner"></div>
          </div>
        ) : lessons.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
            <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiBook className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No lessons yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first lesson to start organizing your study materials
            </p>
            <button
              onClick={() => setShowNewLessonModal(true)}
              className="inline-flex items-center space-x-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition"
            >
              <FiPlus className="w-5 h-5" />
              <span>Create Lesson</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                onClick={() => router.push(`/lessons/${lesson.id}`)}
                className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:border-primary-300 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-primary-100 p-3 rounded-lg">
                    <FiBook className="w-6 h-6 text-primary-600" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
                  {lesson.name}
                </h3>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <FiFileText className="w-4 h-4" />
                    <span>{lesson.documentCount} docs</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <FiCalendar className="w-4 h-4" />
                    <span>{new Date(lesson.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewLessonModal && (
        <NewLessonModal
          onClose={() => setShowNewLessonModal(false)}
          onSuccess={handleLessonCreated}
        />
      )}
    </DashboardLayout>
  )
}

