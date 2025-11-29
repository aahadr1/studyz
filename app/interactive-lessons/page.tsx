'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiPlus, FiBook, FiFileText, FiCheckCircle, FiClock, FiAlertCircle, FiTrash2, FiPlay } from 'react-icons/fi'

interface InteractiveLesson {
  id: string
  name: string
  subject: string | null
  level: string | null
  language: string
  mode: 'document_based' | 'mcq_only'
  status: 'draft' | 'processing' | 'ready' | 'error'
  error_message: string | null
  created_at: string
  lessonDocCount: number
  mcqDocCount: number
}

export default function InteractiveLessonsPage() {
  const router = useRouter()
  const [lessons, setLessons] = useState<InteractiveLesson[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadLessons = async () => {
    try {
      const response = await fetch('/api/interactive-lessons')
      if (response.ok) {
        const data = await response.json()
        setLessons(data.lessons || [])
      }
    } catch (error) {
      console.error('Error loading lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLessons()
  }, [])

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Are you sure you want to delete this interactive lesson?')) return

    setDeleting(lessonId)
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setLessons(lessons.filter(l => l.id !== lessonId))
      }
    } catch (error) {
      console.error('Error deleting lesson:', error)
    } finally {
      setDeleting(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
            <FiFileText className="w-3 h-3" />
            Draft
          </span>
        )
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-900/50 text-amber-400">
            <FiClock className="w-3 h-3 animate-spin" />
            Processing
          </span>
        )
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-900/50 text-emerald-400">
            <FiCheckCircle className="w-3 h-3" />
            Ready
          </span>
        )
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-900/50 text-red-400">
            <FiAlertCircle className="w-3 h-3" />
            Error
          </span>
        )
      default:
        return null
    }
  }

  const getModeBadge = (mode: string) => {
    if (mode === 'document_based') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-violet-900/50 text-violet-400">
          <FiBook className="w-3 h-3" />
          PDF-based
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-900/50 text-blue-400">
        <FiFileText className="w-3 h-3" />
        QCM-only
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading interactive lessons...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/dashboard')}
              className="text-gray-400 hover:text-white transition"
            >
              ← Dashboard
            </button>
            <h1 className="text-xl font-semibold text-white">Interactive Lessons</h1>
          </div>
          <button
            onClick={() => router.push('/interactive-lessons/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition"
          >
            <FiPlus className="w-4 h-4" />
            New Interactive Lesson
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {lessons.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FiBook className="w-8 h-8 text-gray-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No interactive lessons yet</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Create your first interactive lesson by uploading your study materials. 
              The AI will structure them into sections with quizzes.
            </p>
            <button
              onClick={() => router.push('/interactive-lessons/new')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition"
            >
              <FiPlus className="w-5 h-5" />
              Create Interactive Lesson
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{lesson.name}</h3>
                      {getStatusBadge(lesson.status)}
                      {getModeBadge(lesson.mode)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      {lesson.subject && <span>{lesson.subject}</span>}
                      {lesson.level && <span>• {lesson.level}</span>}
                      <span>• {lesson.lessonDocCount} lesson doc{lesson.lessonDocCount !== 1 ? 's' : ''}</span>
                      {lesson.mcqDocCount > 0 && (
                        <span>• {lesson.mcqDocCount} MCQ doc{lesson.mcqDocCount !== 1 ? 's' : ''}</span>
                      )}
                      <span>• Created {new Date(lesson.created_at).toLocaleDateString()}</span>
                    </div>

                    {lesson.status === 'error' && lesson.error_message && (
                      <p className="mt-2 text-sm text-red-400">{lesson.error_message}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    {lesson.status === 'ready' && (
                      <button
                        onClick={() => router.push(`/interactive-lessons/${lesson.id}/player`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition"
                      >
                        <FiPlay className="w-4 h-4" />
                        Start
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/interactive-lessons/${lesson.id}`)}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDelete(lesson.id)}
                      disabled={deleting === lesson.id}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition disabled:opacity-50"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

