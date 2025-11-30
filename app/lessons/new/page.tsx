'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiUpload, FiFile, FiX } from 'react-icons/fi'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NewLessonPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file')
        return
      }
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB')
        return
      }
      // Estimate page count (rough: ~50KB per page for average PDFs)
      const estimatedPages = Math.max(1, Math.round(selectedFile.size / (50 * 1024)))
      if (estimatedPages > 200) {
        setError(`This file may have around ${estimatedPages} pages. Maximum allowed is 200 pages.`)
        return
      }
      setFile(selectedFile)
      setError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Please enter a lesson name')
      return
    }
    if (!file) {
      setError('Please select a PDF file')
      return
    }

    setUploading(true)
    setError('')
    setProgress('Uploading and processing PDF...')

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('file', file)

      setProgress('Converting PDF pages to images...')

      const response = await fetch('/api/lessons', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        // If response isn't JSON (e.g., HTML error page), create a generic error
        if (response.status === 413) {
          throw new Error('File is too large. Please try a smaller PDF file (under 50MB).')
        }
        throw new Error(`Server error (${response.status}). Please try again.`)
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create lesson')
      }

      setProgress('Lesson created successfully!')
      
      // Redirect to the new lesson
      router.push(`/lessons/${data.lesson.id}`)
    } catch (err: any) {
      console.error('Error creating lesson:', err)
      setError(err.message || 'Failed to create lesson')
      setUploading(false)
      setProgress('')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 gap-4">
        <Link href="/lessons" className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Create New Lesson</h1>
      </header>

      {/* Content */}
      <div className="p-8 max-w-xl mx-auto">
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Lesson Name */}
            <div>
              <label htmlFor="name" className="input-label">
                Lesson Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Chapter 5 - Quantum Mechanics"
                className="input"
                disabled={uploading}
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="input-label">PDF Document</label>
              {!file ? (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-border border-dashed rounded-lg cursor-pointer bg-surface hover:bg-elevated transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <FiUpload className="w-8 h-8 text-text-tertiary mb-3" />
                    <p className="text-sm text-text-secondary mb-1">
                      <span className="font-medium text-accent">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-text-tertiary">PDF files only (max 50MB, 200 pages)</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-elevated rounded-lg">
                  <div className="w-10 h-10 bg-accent-muted rounded-lg flex items-center justify-center">
                    <FiFile className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="btn-ghost text-text-tertiary hover:text-error"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-error-muted rounded-lg text-sm text-error">
                {error}
              </div>
            )}

            {/* Progress Message */}
            {progress && (
              <div className="p-3 bg-accent-muted rounded-lg text-sm text-accent flex items-center gap-2">
                <div className="spinner w-4 h-4" />
                {progress}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading || !name.trim() || !file}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <div className="spinner w-4 h-4" />
                  Creating Lesson...
                </>
              ) : (
                'Create Lesson'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

