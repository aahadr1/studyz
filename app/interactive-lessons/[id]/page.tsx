'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { FiPlay, FiLoader, FiArrowLeft, FiBook, FiFileText } from 'react-icons/fi'
import { createClient } from '@/lib/supabase'

interface Document {
  id: string
  file_name: string
  category: 'lesson' | 'mcq'
}

interface InteractiveLesson {
  id: string
  name: string
  subject: string | null
  level: string | null
  language: string
  mode: 'document_based' | 'mcq_only'
  status: 'draft' | 'processing' | 'ready' | 'error'
  created_at: string
}

export default function InteractiveLessonDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<InteractiveLesson | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    
    // Fetch lesson and documents
    Promise.all([
      supabase
        .from('interactive_lessons')
        .select('*')
        .eq('id', lessonId)
        .single(),
      supabase
        .from('interactive_lesson_documents')
        .select('id, file_name, category')
        .eq('interactive_lesson_id', lessonId)
    ]).then(([lessonRes, docsRes]) => {
      if (lessonRes.data) {
        setLesson(lessonRes.data)
      }
      if (docsRes.data) {
        setDocuments(docsRes.data)
      }
      setLoading(false)
    })
  }, [lessonId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <FiLoader className="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
          <p className="text-text-tertiary">Loading lesson...</p>
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">Lesson not found</p>
          <button onClick={() => router.push('/interactive-lessons')} className="btn-primary">
            Back to Lessons
          </button>
        </div>
      </div>
    )
  }

  const lessonDocs = documents.filter(d => d.category === 'lesson')
  const mcqDocs = documents.filter(d => d.category === 'mcq')

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-5xl mx-auto px-6 h-full flex items-center gap-4">
          <button 
            onClick={() => router.push('/interactive-lessons')}
            className="btn-ghost p-2"
          >
            <FiArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">{lesson.name}</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Lesson Info Card */}
          <div className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-text-primary mb-2">{lesson.name}</h2>
                <div className="flex items-center gap-4 text-sm text-text-tertiary">
                  {lesson.subject && <span>{lesson.subject}</span>}
                  {lesson.level && <span>{lesson.level}</span>}
                  {lesson.language && <span>{lesson.language.toUpperCase()}</span>}
                </div>
              </div>
              <span className="px-3 py-1 bg-accent-muted text-accent text-sm font-medium rounded-full">
                {lesson.mode === 'document_based' ? 'Document-based' : 'MCQ-only'}
              </span>
            </div>

            {/* Documents */}
            <div className="space-y-3">
              {lessonDocs.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-text-secondary mb-2 flex items-center gap-2">
                    <FiBook className="w-4 h-4" />
                    Lesson Documents
                  </p>
                  <div className="space-y-1">
                    {lessonDocs.map(doc => (
                      <div key={doc.id} className="text-sm text-text-tertiary pl-6">
                        {doc.file_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mcqDocs.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-text-secondary mb-2 flex items-center gap-2">
                    <FiFileText className="w-4 h-4" />
                    MCQ Documents
                  </p>
                  <div className="space-y-1">
                    {mcqDocs.map(doc => (
                      <div key={doc.id} className="text-sm text-text-tertiary pl-6">
                        {doc.file_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Start Learning Button */}
          {lessonDocs.length > 0 && (
            <div className="card p-6 text-center">
              <h3 className="text-lg font-semibold text-text-primary mb-2">Ready to Learn</h3>
              <p className="text-text-tertiary mb-6">
                Navigate through the lesson page by page with AI-powered explanations
              </p>
              <button
                onClick={() => router.push(`/interactive-lessons/${lessonId}/reader`)}
                className="btn-primary px-8"
              >
                <FiPlay className="w-4 h-4" />
                Start Learning
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
