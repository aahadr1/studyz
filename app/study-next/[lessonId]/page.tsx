'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { 
  FiArrowLeft, 
  FiChevronLeft, 
  FiChevronRight, 
  FiSkipBack, 
  FiSkipForward, 
  FiMessageSquare, 
  FiMic,
  FiFile,
  FiBook,
  FiClock,
  FiUsers,
  FiMaximize2,
  FiMinimize2
} from 'react-icons/fi'
import { createClient } from '@/lib/supabase'
import PageViewer from '@/components/PageViewer'
import VoiceAssistantNext from '@/components/VoiceAssistantNext'
import ChatAssistant from '@/components/ChatAssistant'

interface Document {
  id: string
  name: string
  file_type: string
  page_count: number
  file_path: string
  created_at: string
}

interface Lesson {
  id: string
  name: string
  created_at: string
}

export default function StudyPageNext() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const lessonId = params.lessonId as string
  const documentsParam = searchParams.get('documents')
  const documentIds = documentsParam ? documentsParam.split(',') : []

  // State
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [currentDocIndex, setCurrentDocIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [assistantMode, setAssistantMode] = useState<'chat' | 'voice'>('chat')
  const [getPageContentFn, setGetPageContentFn] = useState<(() => Promise<string | null>) | undefined>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [documentsPanelCollapsed, setDocumentsPanelCollapsed] = useState(false)
  const [sessionStartTime] = useState(Date.now())

  // Load lesson and documents
  useEffect(() => {
    async function loadData() {
      if (documentIds.length === 0) {
        setLoading(false)
        return
      }

      const supabase = createClient()
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        // Load lesson info
        const { data: lessonData } = await supabase
          .from('lessons')
          .select('*')
          .eq('id', lessonId)
          .eq('user_id', user.id)
          .single()

        if (lessonData) {
          setLesson(lessonData)
        }

        // Load documents
        const { data: documentsData, error: docsError } = await supabase
          .from('documents')
          .select('*')
          .in('id', documentIds)
          .order('created_at', { ascending: true })

        if (docsError) {
          console.error('Error loading documents:', docsError)
          throw docsError
        }
        
        setDocuments(documentsData || [])
      } catch (error) {
        console.error('Error loading study data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [lessonId, documentsParam, router])

  // Get current document
  const currentDocument = documents[currentDocIndex] || null

  // Navigation handlers
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

  const handleDocumentSelect = (index: number) => {
    setCurrentDocIndex(index)
    setCurrentPage(1)
    setTotalPages(0)
  }

  const handleDocumentChange = (direction: 'next' | 'previous') => {
    if (direction === 'next') {
      handleNextDocument()
    } else {
      handlePreviousDocument()
    }
  }

  const handleBackToLesson = () => {
    router.push(`/lessons/${lessonId}`)
  }

  const calculateStudyTime = () => {
    const minutes = Math.floor((Date.now() - sessionStartTime) / 60000)
    return minutes < 1 ? '< 1 min' : `${minutes} min`
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-bg">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-2 border-accent-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading study session...</p>
        </div>
      </div>
    )
  }

  // No documents state
  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-bg">
        <div className="text-center p-8 glass-card max-w-md">
          <div className="w-16 h-16 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <FiFile className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No Documents Selected</h2>
          <p className="text-gray-400 mb-6">
            Please select documents from your lesson to start studying.
          </p>
          <button
            onClick={handleBackToLesson}
            className="btn-accent"
          >
            <FiArrowLeft className="w-4 h-4 mr-2" />
            Back to Lesson
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-dark-bg overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-dark-elevated border-b border-dark-border">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left section */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBackToLesson}
              className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
              title="Back to lesson"
            >
              <FiArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">
                {lesson?.name || 'Study Session'}
              </h1>
              <p className="text-sm text-gray-400">
                {documents.length} document{documents.length !== 1 ? 's' : ''} • Study time: {calculateStudyTime()}
              </p>
            </div>
          </div>

          {/* Center - Document navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePreviousDocument}
              className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
              disabled={currentDocIndex === 0}
              title="Previous document"
            >
              <FiSkipBack className="w-4 h-4" />
            </button>
            <div className="text-sm text-gray-400 min-w-[120px] text-center">
              Document {currentDocIndex + 1} of {documents.length}
            </div>
            <button
              onClick={handleNextDocument}
              className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
              disabled={currentDocIndex === documents.length - 1}
              title="Next document"
            >
              <FiSkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right section - Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDocumentsPanelCollapsed(!documentsPanelCollapsed)}
              className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
              title="Toggle documents panel"
            >
              <FiFile className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-dark-border"></div>
            <button
              onClick={() => setAssistantMode('chat')}
              className={`glass-button p-2 rounded-lg transition ${
                assistantMode === 'chat' ? 'bg-accent-purple text-white' : 'hover:bg-dark-surface'
              }`}
              title="Chat assistant"
            >
              <FiMessageSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAssistantMode('voice')}
              className={`glass-button p-2 rounded-lg transition ${
                assistantMode === 'voice' ? 'bg-accent-purple text-white' : 'hover:bg-dark-surface'
              }`}
              title="Voice assistant"
            >
              <FiMic className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
              title="Toggle assistant"
            >
              {sidebarCollapsed ? <FiMaximize2 className="w-4 h-4" /> : <FiMinimize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex mt-16">
        {/* Documents Panel */}
        {!documentsPanelCollapsed && (
          <div className="w-64 bg-dark-elevated border-r border-dark-border flex flex-col">
            <div className="p-4 border-b border-dark-border">
              <h3 className="font-medium text-white mb-2">Documents</h3>
              <div className="text-xs text-gray-400">
                Click to switch between documents
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {documents.map((doc, index) => (
                <button
                  key={doc.id}
                  onClick={() => handleDocumentSelect(index)}
                  className={`w-full p-3 text-left border-b border-dark-border/50 hover:bg-dark-surface transition ${
                    index === currentDocIndex ? 'bg-dark-surface border-l-2 border-l-accent-purple' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-accent-purple to-accent-blue rounded-lg flex items-center justify-center flex-shrink-0">
                      <FiFile className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {doc.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {doc.page_count} pages • {doc.file_type.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Document Viewer */}
        <div className="flex-1 flex flex-col">
          {currentDocument ? (
            <>
              {/* Page Navigation */}
              <div className="flex items-center justify-between p-4 bg-dark-elevated border-b border-dark-border">
                <div className="flex items-center space-x-4">
                  <h2 className="font-medium text-white truncate max-w-md">
                    {currentDocument.name}
                  </h2>
                  <div className="text-sm text-gray-400">
                    {currentDocument.file_type.toUpperCase()}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handlePreviousPage}
                    className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
                    disabled={currentPage <= 1}
                    title="Previous page"
                  >
                    <FiChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="text-sm text-gray-400 min-w-[80px] text-center">
                    {totalPages > 0 ? `${currentPage} / ${totalPages}` : 'Loading...'}
                  </div>
                  <button
                    onClick={handleNextPage}
                    className="glass-button p-2 rounded-lg hover:bg-dark-surface transition"
                    disabled={currentPage >= totalPages}
                    title="Next page"
                  >
                    <FiChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Document Display */}
              <PageViewer
                documentId={currentDocument.id}
                currentPage={currentPage}
                onTotalPagesChange={setTotalPages}
                onPageImageReady={setGetPageContentFn}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400">No document selected</p>
            </div>
          )}
        </div>

        {/* Assistant Panel */}
        {!sidebarCollapsed && (
          <div className="w-96 bg-dark-elevated border-l border-dark-border flex flex-col">
            {assistantMode === 'voice' ? (
              <VoiceAssistantNext
                documentId={currentDocument?.id || ''}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                onDocumentChange={handleDocumentChange}
                getPageContent={getPageContentFn}
                className="flex-1 m-4"
              />
            ) : (
              <ChatAssistant
                lessonId={lessonId}
                documentId={currentDocument?.id || ''}
                pageNumber={currentPage}
                getPageImage={getPageContentFn}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
