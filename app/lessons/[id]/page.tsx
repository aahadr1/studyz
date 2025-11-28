'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { FiArrowLeft, FiFileText, FiUpload, FiCheck } from 'react-icons/fi'
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
    router.push(`/study/${lessonId}?documents=${selectedIds}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading lesson...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/lessons')}
                className="text-gray-600 hover:text-gray-900"
              >
                <FiArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">{lesson?.name}</h1>
            </div>
            
            <div className="flex space-x-3">
              <label className="flex items-center space-x-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition cursor-pointer">
                <FiUpload className="w-5 h-5" />
                <span>{uploading ? 'Uploading...' : 'Upload'}</span>
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
                  className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  <span className="font-semibold">Study ({selectedDocuments.size})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {documents.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiFileText className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No documents yet</h3>
            <p className="text-gray-600 mb-6">
              Upload documents to start studying this lesson
            </p>
            <label className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition cursor-pointer">
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
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium">Select documents to study</p>
              <p className="text-sm text-blue-700 mt-1">
                Click on documents below to select them, then click "Study" to begin.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => {
                const isSelected = selectedDocuments.has(doc.id)
                
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleDocumentSelection(doc.id)}
                    className={`bg-white rounded-xl shadow-sm p-6 border-2 cursor-pointer transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-lg ${
                        isSelected ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <FiFileText className={`w-6 h-6 ${
                          isSelected ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && <FiCheck className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                      {doc.name}
                    </h3>
                    
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span className="uppercase">{doc.file_type}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
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
