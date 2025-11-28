'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiMessageSquare, FiMic, FiSkipBack, FiSkipForward, FiMaximize2 } from 'react-icons/fi'
import { createClient } from '@/lib/supabase'
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
  const [getPageImageFn, setGetPageImageFn] = useState<(() => Promise<string | null>) | undefined>(undefined)

  useEffect(() => {
    const loadDocuments = async () => {
      const supabase = createClient()
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          window.location.href = '/login'
          return
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentIds.join(',')])

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
        <div className="text-center animate-fade-in">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-400">Loading study session...</p>
        </div>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">No documents selected</h2>
          <button
            onClick={() => router.push(`/lessons/${lessonId}`)}
            className="btn-accent"
          >
            Go back to lesson
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-dark-bg overflow-hidden">
      {/* Document Viewer - Left Side */}
      <div className="flex-1 flex flex-col border-r border-dark-border bg-dark-surface">
        {/* Header */}
        <div className="glass-card border-b border-dark-border p-4">
          <button
            onClick={() => router.push(`/lessons/${lessonId}`)}
            className="flex items-center space-x-2 text-gray-400 hover:text-white transition mb-3 group"
          >
            <FiArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Lesson</span>
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-white line-clamp-1 mb-1">
                {currentDocument?.name}
              </h2>
              <p className="text-sm text-gray-400">
                Page {currentPage} of {totalPages || '...'}
              </p>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="p-2 rounded-lg glass-button disabled:opacity-30 disabled:cursor-not-allowed hover:text-primary-400 transition-colors"
                title="Previous page"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <div className="px-3 py-1 rounded-lg bg-dark-elevated text-sm font-medium text-gray-300">
                {currentPage} / {totalPages || '..'}
              </div>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg glass-button disabled:opacity-30 disabled:cursor-not-allowed hover:text-primary-400 transition-colors"
                title="Next page"
              >
                <FiChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Document Navigation (if multiple) */}
          {documents.length > 1 && (
            <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-dark-elevated border border-dark-border">
              <button
                onClick={handlePreviousDocument}
                disabled={currentDocIndex === 0}
                className="flex items-center space-x-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <FiSkipBack className="w-4 h-4" />
                <span>Previous Doc</span>
              </button>
              
              <span className="text-sm text-gray-400">
                Document {currentDocIndex + 1} of {documents.length}
              </span>
              
              <button
                onClick={handleNextDocument}
                disabled={currentDocIndex === documents.length - 1}
                className="flex items-center space-x-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <span>Next Doc</span>
                <FiSkipForward className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Document Content Area */}
        <div className="flex-1 overflow-auto bg-dark-bg p-4">
          <div className="max-w-4xl mx-auto">
            {currentDocument?.file_type === 'pdf' ? (
              <PDFViewer
                documentId={currentDocument.id}
                filePath={currentDocument.file_path}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                totalPages={totalPages}
                onTotalPagesChange={setTotalPages}
                onCanvasRefReady={setGetPageImageFn}
              />
            ) : (
              <div className="glass-card p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <FiMaximize2 className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Document Preview Unavailable
                </h3>
                <p className="text-gray-400 mb-6">
                  This file type ({currentDocument?.file_type}) cannot be previewed.
                  You can still ask the AI assistant questions about this document.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Assistant - Right Side */}
      <div className="w-full md:w-96 lg:w-[450px] flex flex-col bg-dark-elevated border-l border-dark-border">
        {/* Assistant Header */}
        <div className="glass-card border-b border-dark-border p-4">
          <h3 className="text-lg font-semibold text-white mb-4">AI Study Assistant</h3>
          
          {/* Mode Toggle */}
          <div className="flex space-x-2 bg-dark-surface rounded-xl p-1">
            <button
              onClick={() => setAssistantMode('chat')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-all duration-200 ${
                assistantMode === 'chat'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FiMessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">Chat</span>
            </button>
            <button
              onClick={() => setAssistantMode('voice')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-all duration-200 ${
                assistantMode === 'voice'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FiMic className="w-4 h-4" />
              <span className="text-sm font-medium">Voice</span>
            </button>
          </div>
        </div>

        {/* Assistant Content */}
        <div className="flex-1 overflow-hidden">
          {currentDocument && assistantMode === 'chat' && (
            <ChatAssistant
              documentId={currentDocument.id}
              pageNumber={currentPage}
              lessonId={lessonId}
              getPageImage={getPageImageFn}
            />
          )}
          {currentDocument && assistantMode === 'voice' && (
            <VoiceAssistant
              documentId={currentDocument.id}
              pageNumber={currentPage}
              lessonId={lessonId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
