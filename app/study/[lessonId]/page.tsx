'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
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
    return <div className="flex items-center justify-center h-screen bg-neutral-900 text-white">Loading...</div>
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white gap-4">
        <p>No documents selected</p>
        <button onClick={() => router.push(`/lessons/${lessonId}`)} className="px-4 py-2 bg-purple-600 rounded">
          Back to lesson
        </button>
      </div>
    )
  }

  const currentDoc = docs[currentDocIndex]

  return (
    <div className="flex h-screen bg-neutral-900">
      {/* Left Sidebar - Document List */}
      <div className="w-56 border-r border-neutral-700 flex flex-col">
        <div className="p-4 border-b border-neutral-700">
          <button onClick={() => router.push(`/lessons/${lessonId}`)} className="text-white hover:underline text-sm">
            ← Back to lesson
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {docs.map((d, i) => (
            <button
              key={d.id}
              onClick={() => handleDocSelect(i)}
              className={`w-full p-3 text-left text-white text-sm border-b border-neutral-800 truncate ${
                i === currentDocIndex ? 'bg-purple-600' : 'hover:bg-neutral-800'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* Center - PDF Viewer */}
      <div className="flex-1">
        <PageViewer 
          key={currentDoc.id} 
          documentId={currentDoc.id}
          onPageChange={handlePageChange}
          onCanvasReady={handleCanvasReady}
        />
      </div>

      {/* Right Sidebar - Chat */}
      <div className="w-80">
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