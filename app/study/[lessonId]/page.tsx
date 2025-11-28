'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiMessageSquare, FiMic } from 'react-icons/fi'
import { getCurrentUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PDFViewer from '@/components/PDFViewer'
import ChatAssistant from '@/components/ChatAssistant'
import VoiceAssistant from '@/components/VoiceAssistant'

interface Document {
  id: string
  name: string
  file_type: string
  page_count: number
  file_path: string
}

export default function StudyPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const lessonId = params.lessonId as string
  const documentIds = searchParams.get('documents')?.split(',') || []

  const [documents, setDocuments] = useState<Document[]>([])
  const [currentDocIndex, setCurrentDocIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [assistantMode, setAssistantMode] = useState<'chat' | 'voice'>('chat')
  const [getPageImageFn, setGetPageImageFn] = useState<(() => Promise<string | null>) | null>(null)

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const user = await getCurrentUser()

        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .in('id', documentIds)

        if (error) throw error
        setDocuments(data || [])
      } catch (error) {
        console.error('Error loading documents:', error)
      } finally {
        setLoading(false)
      }
    }

    if (documentIds.length > 0) {
      loadDocuments()
    }
  }, [documentIds])

  const currentDocument = documents[currentDocIndex]

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePreviousDocument = () => {
    if (currentDocIndex > 0) {
      setCurrentDocIndex(currentDocIndex - 1)
      setCurrentPage(1)
      setTotalPages(0)
    }
  }

  const handleNextDocument = () => {
    if (currentDocIndex < documents.length - 1) {
      setCurrentDocIndex(currentDocIndex + 1)
      setCurrentPage(1)
      setTotalPages(0)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner"></div>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No documents selected</h2>
          <button
            onClick={() => router.push(`/lessons/${lessonId}`)}
            className="text-primary-600 hover:text-primary-700"
          >
            Go back to lesson
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Document Viewer - Left Side */}
      <div className="flex-1 flex flex-col border-r border-gray-200 bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <button
            onClick={() => router.push(`/lessons/${lessonId}`)}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition mb-3"
          >
            <FiArrowLeft className="w-5 h-5" />
            <span>Back to Lesson</span>
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 line-clamp-1">
                {currentDocument?.name}
              </h2>
              <p className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || '...'}
              </p>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Document Navigation */}
          {documents.length > 1 && (
            <div className="flex items-center space-x-2 mt-3">
              <button
                onClick={handlePreviousDocument}
                disabled={currentDocIndex === 0}
                className="px-3 py-1 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous Doc
              </button>
              <span className="text-sm text-gray-600">
                Document {currentDocIndex + 1} of {documents.length}
              </span>
              <button
                onClick={handleNextDocument}
                disabled={currentDocIndex >= documents.length - 1}
                className="px-3 py-1 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Doc
              </button>
            </div>
          )}
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          <PDFViewer
            documentId={currentDocument?.id}
            filePath={currentDocument?.file_path}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            onCanvasRefReady={(getImageFn) => setGetPageImageFn(() => getImageFn)}
          />
        </div>
      </div>

      {/* AI Assistant - Right Side */}
      <div className="w-[450px] flex flex-col bg-white">
        {/* Assistant Mode Toggle */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Studyz Guy</h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setAssistantMode('chat')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition ${
                  assistantMode === 'chat'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FiMessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">Chat</span>
              </button>
              <button
                onClick={() => setAssistantMode('voice')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition ${
                  assistantMode === 'voice'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FiMic className="w-4 h-4" />
                <span className="text-sm font-medium">Voice</span>
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Your AI study assistant is ready to help you understand this page
          </p>
        </div>

        {/* Assistant Content */}
        <div className="flex-1 overflow-hidden">
          {assistantMode === 'chat' ? (
            <ChatAssistant
              documentId={currentDocument?.id}
              pageNumber={currentPage}
              lessonId={lessonId}
              getPageImage={getPageImageFn || undefined}
            />
          ) : (
            <VoiceAssistant
              documentId={currentDocument?.id}
              pageNumber={currentPage}
              lessonId={lessonId}
            />
          )}
        </div>
      </div>
    </div>
  )
}

