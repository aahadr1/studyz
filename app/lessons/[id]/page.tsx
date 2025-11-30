'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { FiArrowLeft, FiFileText, FiUpload, FiCheck, FiPlay } from 'react-icons/fi'
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

      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .eq('user_id', user.id)
        .single()

      if (lessonError) throw lessonError
      setLesson(lessonData)

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-text-tertiary text-sm">Loading lesson...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border sticky top-0 bg-background z-40">
        <div className="max-w-4xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button
              onClick={() => router.push('/lessons')}
              className="btn-ghost p-2"
            >
              <FiArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-lg font-semibold text-text-primary truncate">{lesson?.name}</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="btn-secondary cursor-pointer">
              <FiUpload className="w-4 h-4" />
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
                className="btn-primary"
              >
                <FiPlay className="w-4 h-4" />
                Study ({selectedDocuments.size})
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {documents.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
              <FiFileText className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No documents yet</h3>
            <p className="text-text-secondary mb-6 max-w-sm mx-auto">
              Upload documents to start studying with AI assistance
            </p>
            <label className="btn-primary cursor-pointer">
              <FiUpload className="w-4 h-4" />
              Upload Documents
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
            {/* Info */}
            <div className="text-sm text-text-secondary mb-6">
              Select documents to study, then click "Study" to begin your AI-assisted learning session.
            </div>

            {/* Documents */}
            <div className="space-y-2">
              {documents.map((doc) => {
                const isSelected = selectedDocuments.has(doc.id)
                
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleDocumentSelection(doc.id)}
                    className={`card card-hover p-4 cursor-pointer flex items-center gap-4 ${
                      isSelected ? 'border-accent bg-accent-muted' : ''
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center ${
                      isSelected ? 'bg-accent text-white' : 'bg-elevated'
                    }`}>
                      <FiFileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-text-primary truncate">{doc.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-text-tertiary">
                        <span className="uppercase">{doc.file_type}</span>
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-accent border-accent'
                        : 'border-border'
                    }`}>
                      {isSelected && <FiCheck className="w-3 h-3 text-white" />}
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
