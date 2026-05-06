'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiFileText } from 'react-icons/fi'
import PageViewer from '@/components/PageViewer'
import ChatSidebar from '@/components/ChatSidebar'

interface Doc {
  id: string
  name: string
}

export default function StudyPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const lessonId = params.lessonId as string
  const docIds = searchParams.get('documents')?.split(',') || []

  const [docs, setDocs] = useState<Doc[]>([])
  const [currentDocIndex, setCurrentDocIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [getPageImage, setGetPageImage] = useState<() => string | null>(() => () => null)

  useEffect(() => {
    if (docIds.length === 0) {
      setLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from('documents')
      .select('id, name')
      .in('id', docIds)
      .then(({ data }) => {
        setDocs(data || [])
        setLoading(false)
      })
  }, [])

  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page)
    setTotalPages(total)
  }, [])

  const handleCanvasReady = useCallback((getImage: () => string | null) => {
    setGetPageImage(() => getImage)
  }, [])

  const handleDocSelect = (index: number) => {
    setCurrentDocIndex(index)
    setCurrentPage(1)
    setTotalPages(1)
  }

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

  if (docs.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">No documents selected</p>
          <button 
            onClick={() => router.push(`/lessons/${lessonId}`)} 
            className="btn-primary"
          >
            Back to lesson
          </button>
        </div>
      </div>
    )
  }

  const currentDoc = docs[currentDocIndex]

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Document List */}
      <aside className="w-56 border-r border-border flex flex-col bg-surface">
        <div className="h-12 flex items-center px-4 border-b border-border">
          <button 
            onClick={() => router.push(`/lessons/${lessonId}`)} 
            className="btn-ghost p-1.5 mr-2"
          >
            <FiArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-text-primary truncate">Documents</span>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {docs.map((d, i) => (
            <button
              key={d.id}
              onClick={() => handleDocSelect(i)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                i === currentDocIndex 
                  ? 'bg-accent text-white' 
                  : 'text-text-secondary hover:bg-elevated hover:text-text-primary'
              }`}
            >
              <FiFileText className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Center - PDF Viewer */}
      <div className="flex-1 min-w-0">
        <PageViewer 
          key={currentDoc.id} 
          documentId={currentDoc.id}
          onPageChange={handlePageChange}
          onCanvasReady={handleCanvasReady}
        />
      </div>

      {/* Right Sidebar - Chat */}
      <div className="w-80 border-l border-border">
        <ChatSidebar
          documentId={currentDoc.id}
          currentPage={currentPage}
          totalPages={totalPages}
          getPageImage={getPageImage}
        />
      </div>
    </div>
  )
}
