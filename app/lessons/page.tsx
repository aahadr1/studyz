'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiPlus, FiBook, FiFileText, FiCalendar, FiArrowLeft, FiX, FiUpload } from 'react-icons/fi'
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

  const supabase = createClient()

  useEffect(() => {
    // Check if ?new=true to auto-open modal
    if (searchParams.get('new') === 'true') {
      setShowNewLessonModal(true)
    }
  }, [searchParams])

  const loadLessons = async () => {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading lessons...</p>
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
              <a href="/dashboard" className="text-gray-600 hover:text-gray-900">
                <FiArrowLeft className="w-5 h-5" />
              </a>
              <h1 className="text-2xl font-bold text-blue-600">My Lessons</h1>
            </div>
            <button
              onClick={() => setShowNewLessonModal(true)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <FiPlus className="w-5 h-5" />
              <span>New Lesson</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {lessons.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiBook className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No lessons yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first lesson to start organizing your study materials
            </p>
            <button
              onClick={() => setShowNewLessonModal(true)}
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
            >
              <FiPlus className="w-5 h-5" />
              <span>Create Lesson</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                onClick={() => router.push(`/lessons/${lesson.id}`)}
                className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:border-blue-300 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <FiBook className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
                  {lesson.name}
                </h3>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <FiFileText className="w-4 h-4" />
                    <span>{lesson.documentCount} docs</span>
                  </div>
                  <div className="flex items-center space-x-1">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Create New Lesson</h2>
              <button
                onClick={() => setShowNewLessonModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lesson Name *
                </label>
                <input
                  type="text"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="e.g., Introduction to Biology"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Documents (Optional)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
                  <FiUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
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
                    className="cursor-pointer inline-block bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition"
                  >
                    Choose Files
                  </label>
                  <p className="text-sm text-gray-500 mt-2">
                    PDF, PPTX, DOCX files supported
                  </p>
                </div>
                
                {files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700">Selected files:</p>
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg">
                        <span className="text-sm text-gray-700">{file.name}</span>
                        <span className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowNewLessonModal(false)}
                  disabled={creating}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
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
