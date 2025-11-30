'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiPlus, FiBook, FiFileText, FiX, FiUpload, FiChevronRight, FiArrowLeft } from 'react-icons/fi'
import { createClient } from '@/lib/supabase'

interface Lesson {
  id: string
  name: string
  created_at: string
  documentCount: number
}

export default function LessonsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewLessonModal, setShowNewLessonModal] = useState(false)
  
  const [lessonName, setLessonName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowNewLessonModal(true)
    }
  }, [searchParams])

  const loadLessons = async () => {
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: lessonsData, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const lessonsWithCounts = await Promise.all(
        (lessonsData || []).map(async (lesson) => {
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('lesson_id', lesson.id)

          return {
            ...lesson,
            documentCount: count || 0,
          }
        })
      )

      setLessons(lessonsWithCounts)
    } catch (error) {
      console.error('Error loading lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLessons()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!lessonName.trim()) {
      setError('Please enter a lesson name')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error('Not authenticated')

      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user.id,
          name: lessonName,
        })
        .select()
        .single()

      if (lessonError) throw lessonError

      for (const file of files) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${lesson.id}/${Date.now()}-${file.name}`
        
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
            lesson_id: lesson.id,
            name: file.name,
            file_path: fileName,
            file_type: fileExt || 'unknown',
            page_count: 1,
          })
      }

      setLessonName('')
      setFiles([])
      setShowNewLessonModal(false)
      loadLessons()
    } catch (err: any) {
      console.error('Error creating lesson:', err)
      setError(err.message || 'Failed to create lesson')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-3"></div>
          <p className="text-text-tertiary text-sm">Loading lessons...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border sticky top-0 bg-background z-40">
        <div className="max-w-4xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="btn-ghost p-2"
            >
              <FiArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-lg font-semibold text-text-primary">Lessons</h1>
          </div>
          <button
            onClick={() => setShowNewLessonModal(true)}
            className="btn-primary"
          >
            <FiPlus className="w-4 h-4" />
            New Lesson
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {lessons.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 bg-elevated rounded-lg flex items-center justify-center mx-auto mb-4">
              <FiBook className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No lessons yet</h3>
            <p className="text-text-secondary mb-6 max-w-sm mx-auto">
              Create your first lesson to start organizing your study materials
            </p>
            <button
              onClick={() => setShowNewLessonModal(true)}
              className="btn-primary"
            >
              <FiPlus className="w-4 h-4" />
              Create Lesson
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                onClick={() => router.push(`/lessons/${lesson.id}`)}
                className="card card-hover p-4 cursor-pointer flex items-center gap-4 group"
              >
                <div className="w-10 h-10 bg-elevated rounded-md flex items-center justify-center">
                  <FiBook className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-text-primary truncate">
                    {lesson.name}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-text-tertiary">
                    <span className="flex items-center gap-1">
                      <FiFileText className="w-3 h-3" />
                      {lesson.documentCount} docs
                    </span>
                    <span>{new Date(lesson.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <FiChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-secondary transition-colors" />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Lesson Modal */}
      {showNewLessonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-lg w-full max-w-lg shadow-lg animate-slide-up">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Create Lesson</h2>
              <button
                onClick={() => setShowNewLessonModal(false)}
                className="btn-ghost p-2"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleCreateLesson} className="p-6 space-y-5">
              <div>
                <label className="input-label">Lesson Name</label>
                <input
                  type="text"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  required
                  className="input"
                  placeholder="e.g., Introduction to Biology"
                />
              </div>

              <div>
                <label className="input-label">Documents (Optional)</label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-border-light transition-colors">
                  <FiUpload className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.pptx,.ppt,.docx,.doc"
                    onChange={handleFileChange}
                    className="hidden"
                    id="fileInput"
                  />
                  <label
                    htmlFor="fileInput"
                    className="btn-secondary cursor-pointer"
                  >
                    Choose Files
                  </label>
                  <p className="text-xs text-text-tertiary mt-2">
                    PDF, PPTX, DOCX supported
                  </p>
                </div>
                
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-elevated px-3 py-2 rounded-md">
                        <span className="text-sm text-text-secondary truncate">{file.name}</span>
                        <span className="text-xs text-text-tertiary">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 bg-error-muted border border-error/30 text-error text-sm rounded-md">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewLessonModal(false)}
                  disabled={creating}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary flex-1"
                >
                  {creating ? 'Creating...' : 'Create Lesson'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
