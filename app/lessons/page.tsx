'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiPlus, FiBook, FiFileText, FiCalendar, FiArrowLeft, FiX, FiUpload, FiChevronRight } from 'react-icons/fi'
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
  
  // New lesson form state
  const [lessonName, setLessonName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if ?new=true to auto-open modal
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

      // Get document counts
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Create lesson
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user.id,
          name: lessonName,
        })
        .select()
        .single()

      if (lessonError) throw lessonError

      // Upload files if any
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

      // Reset and reload
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-400">Loading lessons...</p>
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
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-dark-surface rounded-lg"
              >
                <FiArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold gradient-text">My Lessons</h1>
            </div>
            <button
              onClick={() => setShowNewLessonModal(true)}
              className="btn-accent flex items-center space-x-2"
            >
              <FiPlus className="w-5 h-5" />
              <span>New Lesson</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto section-padding">
        {lessons.length === 0 ? (
          <div className="glass-card p-12 text-center animate-scale-in">
            <div className="w-20 h-20 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto mb-6 flex items-center justify-center glow-primary">
              <FiBook className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">No lessons yet</h3>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Create your first lesson to start organizing your study materials and learning with AI assistance
            </p>
            <button
              onClick={() => setShowNewLessonModal(true)}
              className="btn-accent flex items-center space-x-2 mx-auto group"
            >
              <FiPlus className="w-5 h-5" />
              <span>Create Lesson</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lessons.map((lesson, index) => (
              <div
                key={lesson.id}
                onClick={() => router.push(`/lessons/${lesson.id}`)}
                className="glass-card p-6 card-hover cursor-pointer group animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-accent-purple to-accent-blue rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <FiBook className="w-6 h-6 text-white" />
                  </div>
                  <FiChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" />
                </div>
                
                <h3 className="text-lg font-semibold text-white mb-3 line-clamp-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-accent-purple group-hover:to-accent-blue transition-all duration-300">
                  {lesson.name}
                </h3>
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-1 text-gray-400">
                    <FiFileText className="w-4 h-4" />
                    <span>{lesson.documentCount} docs</span>
                  </div>
                  <div className="flex items-center space-x-1 text-gray-500">
                    <FiCalendar className="w-4 h-4" />
                    <span>{new Date(lesson.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Lesson Modal */}
      {showNewLessonModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
            {/* Modal Header */}
            <div className="sticky top-0 bg-dark-elevated/95 backdrop-blur-xl border-b border-dark-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-2xl font-bold text-white">Create New Lesson</h2>
              <button
                onClick={() => setShowNewLessonModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-dark-surface rounded-lg"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleCreateLesson} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Lesson Name *
                </label>
                <input
                  type="text"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  required
                  className="input-field"
                  placeholder="e.g., Introduction to Biology"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Upload Documents (Optional)
                </label>
                <div className="border-2 border-dashed border-dark-border rounded-xl p-8 text-center hover:border-primary-500/50 transition-colors bg-dark-surface/50">
                  <FiUpload className="w-12 h-12 text-gray-500 mx-auto mb-4" />
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
                    className="cursor-pointer inline-block btn-secondary"
                  >
                    Choose Files
                  </label>
                  <p className="text-sm text-gray-500 mt-2">
                    PDF, PPTX, DOCX files supported
                  </p>
                </div>
                
                {files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-gray-300">Selected files:</p>
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-dark-surface px-4 py-3 rounded-lg border border-dark-border">
                        <span className="text-sm text-gray-300">{file.name}</span>
                        <span className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowNewLessonModal(false)}
                  disabled={creating}
                  className="flex-1 btn-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 btn-accent disabled:opacity-50"
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
