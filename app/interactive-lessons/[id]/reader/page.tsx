'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { FiArrowLeft } from 'react-icons/fi'
import InteractiveLessonReader from '@/components/InteractiveLessonReader'

interface InteractiveLesson {
  id: string
  name: string
  status: string
}

export default function InteractiveLessonReaderPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<InteractiveLesson | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  const loadLesson = async () => {
    try {
      // Load lesson info
      const lessonResponse = await fetch(`/api/interactive-lessons/${lessonId}`)
      if (!lessonResponse.ok) {
        throw new Error('Failed to load lesson')
      }
      
      const lessonData = await lessonResponse.json()
      setLesson(lessonData.lesson)

      // Get the first lesson document
      const documents = lessonData.lesson.interactive_lesson_documents?.filter(
        (d: any) => d.category === 'lesson'
      ) || []

      if (documents.length === 0) {
        throw new Error('No lesson document found')
      }

      const documentId = documents[0].id
      const pageCount = documents[0].page_count || 0

      if (pageCount === 0) {
        throw new Error('Document has no pages')
      }

      setTotalPages(pageCount)
      setLoading(false)

    } catch (err: any) {
      console.error('Error loading lesson:', err)
      setError(err.message || 'Failed to load lesson')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-text-tertiary text-sm">Chargement de la leçon...</p>
        </div>
      </div>
    )
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-error mb-4">{error || 'Leçon non trouvée'}</p>
          <button 
            onClick={() => router.push('/interactive-lessons')}
            className="text-accent hover:underline"
          >
            ← Retour aux leçons
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-6">
        <button 
          onClick={() => router.push('/interactive-lessons')}
          className="btn-ghost p-2 mr-4"
        >
          <FiArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary truncate">
          {lesson.name}
        </h1>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0">
        <InteractiveLessonReader
          lessonId={lessonId}
          lessonName={lesson.name}
          totalPages={totalPages}
        />
      </div>
    </div>
  )
}

