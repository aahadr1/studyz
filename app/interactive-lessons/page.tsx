'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiPlus, FiBook, FiFileText, FiCheckCircle, FiClock, FiAlertCircle, FiTrash2, FiPlay, FiArrowLeft, FiMoreHorizontal } from 'react-icons/fi'

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
    if (!confirm('Are you sure you want to delete this lesson?')) return

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
        return <span className="badge badge-default">Draft</span>
      case 'processing':
        return <span className="badge badge-warning"><FiClock className="w-3 h-3" /> Processing</span>
      case 'ready':
        return <span className="badge badge-success"><FiCheckCircle className="w-3 h-3" /> Ready</span>
      case 'error':
        return <span className="badge badge-error"><FiAlertCircle className="w-3 h-3" /> Error</span>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-text-tertiary text-sm">Loading lessons...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-4xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/dashboard')}
              className="btn-ghost p-2"
            >
              <FiArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-lg font-semibold text-text-primary">Interactive Lessons</h1>
          </div>
          <button
            onClick={() => router.push('/interactive-lessons/new')}
            className="btn-primary"
          >
            <FiPlus className="w-4 h-4" />
            New Lesson
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {lessons.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
              <FiBook className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No interactive lessons</h3>
            <p className="text-text-secondary mb-6 max-w-sm mx-auto">
              Create your first interactive lesson by uploading study materials. The AI will structure them into sections with quizzes.
            </p>
            <button
              onClick={() => router.push('/interactive-lessons/new')}
              className="btn-primary"
            >
              <FiPlus className="w-4 h-4" />
              Create Lesson
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="card card-hover p-4 group"
              >
                <div className="flex items-start justify-between">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => router.push(`/interactive-lessons/${lesson.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-text-primary">{lesson.name}</h3>
                      {getStatusBadge(lesson.status)}
                    </div>
                    
                    <div className="flex items-center gap-3 text-sm text-text-tertiary">
                      {lesson.subject && <span>{lesson.subject}</span>}
                      {lesson.level && <span>• {lesson.level}</span>}
                      <span>• {lesson.lessonDocCount} doc{lesson.lessonDocCount !== 1 ? 's' : ''}</span>
                      {lesson.mcqDocCount > 0 && (
                        <span>• {lesson.mcqDocCount} MCQ{lesson.mcqDocCount !== 1 ? 's' : ''}</span>
                      )}
                      <span>• {new Date(lesson.created_at).toLocaleDateString()}</span>
                    </div>

                    {lesson.status === 'error' && lesson.error_message && (
                      <p className="mt-2 text-sm text-error">{lesson.error_message}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {lesson.status === 'ready' && (
                      <button
                        onClick={() => router.push(`/interactive-lessons/${lesson.id}/player`)}
                        className="btn-primary py-1.5 px-3 text-sm"
                      >
                        <FiPlay className="w-3 h-3" />
                        Start
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/interactive-lessons/${lesson.id}`)}
                      className="btn-ghost py-1.5 px-3 text-sm"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDelete(lesson.id)}
                      disabled={deleting === lesson.id}
                      className="btn-ghost p-1.5 text-text-tertiary hover:text-error"
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
