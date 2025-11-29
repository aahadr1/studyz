'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { FiArrowLeft, FiFileText, FiUpload, FiCheck, FiPlay, FiTrash2 } from 'react-icons/fi'
import { createClient } from '@/lib/supabase'

interface Document {
  id: string
  name: string
  file_type: string
  created_at: string
  file_path: string
}

interface Lesson {
  id: string
  name: string
  created_at: string
}

export default function LessonDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const loadLessonData = async () => {
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      // Load lesson
      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .eq('user_id', user.id)
        .single()

      if (lessonError) throw lessonError
      setLesson(lessonData)

      // Load documents
      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: false })

      if (documentsError) throw documentsError
      setDocuments(documentsData || [])
    } catch (error) {
      console.error('Error loading lesson data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (lessonId) {
      loadLessonData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error('Not authenticated')

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${lessonId}/${Date.now()}-${file.name}`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Upload error:', uploadError)
          continue
        }

        await supabase
          .from('documents')
          .insert({
            lesson_id: lessonId,
            name: file.name,
            file_path: fileName,
            file_type: fileExt || 'unknown',
            page_count: 1,
          })
      }

      await loadLessonData()
    } catch (error) {
      console.error('Error uploading files:', error)
      alert('Failed to upload files')
    } finally {
      setUploading(false)
    }
  }

  const toggleDocumentSelection = (documentId: string) => {
    const newSelected = new Set(selectedDocuments)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocuments(newSelected)
  }

  const handleStudyLesson = () => {
    if (selectedDocuments.size === 0) {
      alert('Please select at least one document to study')
      return
    }

    const selectedIds = Array.from(selectedDocuments).join(',')
    router.push(`/study-next/${lessonId}?documents=${selectedIds}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-400">Loading lesson...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="glass-card border-b border-dark-border sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <button
                onClick={() => router.push('/lessons')}
                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-dark-surface rounded-lg flex-shrink-0"
              >
                <FiArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-white truncate">{lesson?.name}</h1>
            </div>
            
            <div className="flex space-x-3 flex-shrink-0">
              <label className="btn-secondary flex items-center space-x-2 cursor-pointer">
                <FiUpload className="w-5 h-5" />
                <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload'}</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.pptx,.ppt,.docx,.doc"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              
              {selectedDocuments.size > 0 && (
                <button
                  onClick={handleStudyLesson}
                  className="btn-accent flex items-center space-x-2"
                >
                  <FiPlay className="w-5 h-5" />
                  <span>Study ({selectedDocuments.size})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto section-padding">
        {documents.length === 0 ? (
          <div className="glass-card p-12 text-center animate-scale-in">
            <div className="w-20 h-20 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto mb-6 flex items-center justify-center glow-primary">
              <FiFileText className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">No documents yet</h3>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Upload documents to start studying this lesson with AI assistance
            </p>
            <label className="btn-accent flex items-center space-x-2 mx-auto cursor-pointer group">
              <FiUpload className="w-5 h-5" />
              <span>Upload Documents</span>
              <input
                type="file"
                multiple
                accept=".pdf,.pptx,.ppt,.docx,.doc"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="glass-card p-4 border-l-4 border-primary-500">
              <p className="text-sm text-gray-300 font-medium mb-1">📚 Select documents to study</p>
              <p className="text-sm text-gray-500">
                Click on documents below to select them, then click "Study" to begin your AI-assisted learning session.
              </p>
            </div>

            {/* Documents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc, index) => {
                const isSelected = selectedDocuments.has(doc.id)
                
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleDocumentSelection(doc.id)}
                    className={`glass-card p-6 cursor-pointer transition-all duration-300 animate-slide-up group ${
                      isSelected
                        ? 'border-2 border-primary-500 bg-primary-500/10'
                        : 'border border-dark-border hover:border-primary-500/50'
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        isSelected 
                          ? 'bg-gradient-to-br from-accent-purple to-accent-blue glow-primary' 
                          : 'bg-dark-surface group-hover:bg-gradient-to-br group-hover:from-accent-purple group-hover:to-accent-blue'
                      }`}>
                        <FiFileText className="w-6 h-6 text-white" />
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                        isSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-dark-border group-hover:border-primary-500'
                      }`}>
                        {isSelected && <FiCheck className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-white mb-3 line-clamp-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-accent-purple group-hover:to-accent-blue transition-all duration-300">
                      {doc.name}
                    </h3>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="uppercase text-gray-400 font-medium">{doc.file_type}</span>
                      <span className="text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
