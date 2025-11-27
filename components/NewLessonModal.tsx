'use client'

import { useState } from 'react'
import { FiX, FiUpload } from 'react-icons/fi'
import { getCurrentUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

interface NewLessonModalProps {
  onClose: () => void
  onSuccess: () => void
}

export default function NewLessonModal({ onClose, onSuccess }: NewLessonModalProps) {
  const [lessonName, setLessonName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!lessonName.trim()) {
      setError('Please enter a lesson name')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const user = await getCurrentUser()
      
      // Create lesson
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user?.id,
          name: lessonName,
        })
        .select()
        .single()

      if (lessonError) throw lessonError

      // Upload files if any
      if (files.length > 0) {
        for (const file of files) {
          const fileExt = file.name.split('.').pop()
          const fileName = `${user?.id}/${lesson.id}/${Date.now()}-${file.name}`
          
          // Upload file to storage
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, file)

          if (uploadError) throw uploadError

          // Create document record
          const { data: document, error: docError } = await supabase
            .from('documents')
            .insert({
              lesson_id: lesson.id,
              name: file.name,
              file_path: fileName,
              file_type: fileExt || 'unknown',
            })
            .select()
            .single()

          if (docError) throw docError

          // Trigger document processing (convert to images)
          await fetch('/api/process-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentId: document.id,
              filePath: fileName,
              fileType: fileExt,
            }),
          })
        }
      }

      onSuccess()
    } catch (err: any) {
      console.error('Error creating lesson:', err)
      setError(err.message || 'Failed to create lesson')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Create New Lesson</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <FiX className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label htmlFor="lessonName" className="block text-sm font-medium text-gray-700 mb-2">
              Lesson Name *
            </label>
            <input
              id="lessonName"
              type="text"
              value={lessonName}
              onChange={(e) => setLessonName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="e.g., Introduction to Biology"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Documents (Optional)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition">
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
                className="cursor-pointer inline-block bg-primary-50 text-primary-600 px-4 py-2 rounded-lg hover:bg-primary-100 transition"
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
              onClick={onClose}
              disabled={uploading}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {uploading ? 'Creating...' : 'Create Lesson'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

