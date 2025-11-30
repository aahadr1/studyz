'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft } from 'react-icons/fi'
import InteractiveLessonPageViewer from '@/components/InteractiveLessonPageViewer'
import TranscriptionSidebar from '@/components/TranscriptionSidebar'

interface LessonDocument {
  id: string
  file_name: string
}

export default function InteractiveLessonPlayerPage() {
  const router = useRouter()
  const params = useParams()
  
  const lessonId = params.id as string

  const [lessonName, setLessonName] = useState('')
  const [documents, setDocuments] = useState<LessonDocument[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [getPageImage, setGetPageImage] = useState<() => string | null>(() => () => null)

  useEffect(() => {
    const supabase = createClient()
    
    // Fetch lesson info and documents
    Promise.all([
      supabase
        .from('interactive_lessons')
        .select('name')
        .eq('id', lessonId)
        .single(),
      supabase
        .from('interactive_lesson_documents')
        .select('id, file_name')
        .eq('interactive_lesson_id', lessonId)
        .eq('category', 'lesson')
    ]).then(([lessonRes, docsRes]) => {
      if (lessonRes.data) {
        setLessonName(lessonRes.data.name)
      }
      if (docsRes.data) {
        setDocuments(docsRes.data)
      }
      setLoading(false)
    })
  }, [lessonId])

  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page)
    setTotalPages(total)
  }, [])

  const handleCanvasReady = useCallback((getImage: () => string | null) => {
    setGetPageImage(() => getImage)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-text-tertiary text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">No documents found for this lesson</p>
          <button onClick={() => router.push('/interactive-lessons')} className="btn-primary">
            Back to Lessons
          </button>
        </div>
      </div>
    )
  }

  const currentDoc = documents[0] // For now, just use the first document

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-6 gap-4">
        <button 
          onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
          className="btn-ghost p-2"
        >
          <FiArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">{lessonName}</h1>
          <p className="text-xs text-text-tertiary">Page {currentPage} / {totalPages}</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Center - PDF Viewer */}
        <div className="flex-1 min-w-0">
          <InteractiveLessonPageViewer 
            key={currentDoc.id}
            lessonId={lessonId}
            documentId={currentDoc.id}
            onPageChange={handlePageChange}
            onCanvasReady={handleCanvasReady}
          />
        </div>

        {/* Right Sidebar - Transcription */}
        <div className="w-80 border-l border-border">
          <TranscriptionSidebar
            lessonId={lessonId}
            documentId={currentDoc.id}
            currentPage={currentPage}
            totalPages={totalPages}
            getPageImage={getPageImage}
          />
        </div>
      </div>
    </div>
  )
}
