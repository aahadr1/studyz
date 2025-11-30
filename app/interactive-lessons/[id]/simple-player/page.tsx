'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { FiArrowLeft } from 'react-icons/fi'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'

const SimplePdfViewer = dynamic(() => import('@/components/SimplePdfViewer'), { ssr: false })
const SimpleInteractiveSidebar = dynamic(() => import('@/components/SimpleInteractiveSidebar'), { ssr: false })

interface InteractiveLesson {
  id: string
  name: string
  status: string
  interactive_lesson_documents?: Array<{
    id: string
    name: string
    file_path: string
    category: string
  }>
}

export default function SimpleInteractiveLessonPlayerPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<InteractiveLesson | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [getPageImage, setGetPageImage] = useState<() => string | null>(() => () => null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  const loadLesson = async () => {
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}`)
      if (!response.ok) throw new Error('Failed to load lesson')
      
      const data = await response.json()
      setLesson(data.lesson)

      // Get the first lesson document
      const lessonDocs = data.lesson.interactive_lesson_documents?.filter(
        (d: any) => d.category === 'lesson'
      ) || []

      if (lessonDocs.length > 0) {
        // Get signed URL for the PDF
        const docResponse = await fetch(`/api/documents/${lessonDocs[0].id}/signed-url`, { 
          credentials: 'include' 
        })
        if (docResponse.ok) {
          const docData = await docResponse.json()
          setPdfUrl(docData.signedUrl)
        }
      }
    } catch (err) {
      console.error('Error loading lesson:', err)
      setError('Failed to load lesson')
    } finally {
      setLoading(false)
    }
  }

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
            onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
            className="text-accent hover:underline"
          >
            ← Retour à la leçon
          </button>
        </div>
      </div>
    )
  }

  if (!pdfUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-tertiary mb-4">Aucun document PDF disponible pour cette leçon</p>
          <button 
            onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
            className="text-accent hover:underline"
          >
            ← Retour à la leçon
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
          onClick={() => router.push(`/interactive-lessons/${lessonId}`)}
          className="btn-ghost p-2 mr-4"
        >
          <FiArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary truncate">
          {lesson.name}
        </h1>
        <div className="ml-auto text-sm text-text-tertiary">
          Page {currentPage} / {totalPages}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: PDF Viewer */}
        <div className="flex-1 min-w-0">
          <SimplePdfViewer 
            url={pdfUrl}
            onPageChange={handlePageChange}
            onCanvasReady={handleCanvasReady}
          />
        </div>

        {/* Right: Interactive Sidebar */}
        <div className="w-96 flex-shrink-0 border-l border-border">
          <SimpleInteractiveSidebar
            lessonId={lessonId}
            currentPage={currentPage}
            totalPages={totalPages}
            getPageImage={getPageImage}
          />
        </div>
      </div>
    </div>
  )
}
