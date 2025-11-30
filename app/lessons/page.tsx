'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiPlus, FiBook, FiTrash2, FiArrowLeft } from 'react-icons/fi'
import Link from 'next/link'
import type { Lesson } from '@/types/db'

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadLessons()
  }, [])

  const loadLessons = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/lessons', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

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

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return

    setDeleting(lessonId)
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/lessons/${lessonId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 gap-4">
        <Link href="/dashboard" className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Interactive Lessons</h1>
      </header>

      {/* Content */}
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-text-primary mb-1">Your Lessons</h2>
            <p className="text-text-secondary">Upload documents and learn with AI assistance</p>
          </div>
          <Link href="/lessons/new" className="btn-primary">
            <FiPlus className="w-4 h-4" />
            New Lesson
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
              <FiBook className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No lessons yet
            </h3>
            <p className="text-text-secondary max-w-sm mx-auto mb-4">
              Create your first interactive lesson by uploading a PDF document.
            </p>
            <Link href="/lessons/new" className="btn-primary inline-flex">
              <FiPlus className="w-4 h-4" />
              Create Lesson
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="card p-4 flex items-center justify-between card-hover"
              >
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="flex items-center gap-4 flex-1"
                >
                  <div className="w-10 h-10 bg-accent-muted rounded-lg flex items-center justify-center">
                    <FiBook className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-medium text-text-primary">{lesson.name}</h3>
                    <p className="text-sm text-text-tertiary">
                      {lesson.total_pages} page{lesson.total_pages !== 1 ? 's' : ''} • 
                      Created {new Date(lesson.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(lesson.id)}
                  disabled={deleting === lesson.id}
                  className="btn-ghost text-text-tertiary hover:text-error"
                >
                  {deleting === lesson.id ? (
                    <div className="spinner w-4 h-4" />
                  ) : (
                    <FiTrash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
