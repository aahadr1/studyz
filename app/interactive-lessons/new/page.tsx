'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiUpload, FiFile, FiX } from 'react-icons/fi'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

export default function NewInteractiveLessonPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

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
    setProgress('Creating interactive lesson...')

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      // Create interactive lesson record
      const createResponse = await fetch('/api/interactive-lessons', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      })

      const createData = await createResponse.json()
      if (!createResponse.ok) {
        throw new Error(createData.error || 'Failed to create interactive lesson')
      }

      const lessonId = createData.lesson.id

      // Get upload URL
      setProgress('Preparing upload...')
      const uploadUrlResponse = await fetch(`/api/interactive-lessons/${lessonId}/upload-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          category: 'lesson',
        }),
      })

      const uploadUrlData = await uploadUrlResponse.json()
      if (!uploadUrlResponse.ok) {
        throw new Error(uploadUrlData.error || 'Failed to get upload URL')
      }

      // Upload file
      setProgress('Uploading PDF...')
      const uploadResponse = await fetch(uploadUrlData.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file')
      }

      // Confirm upload
      setProgress('Processing document...')
      const confirmResponse = await fetch(`/api/interactive-lessons/${lessonId}/confirm-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: uploadUrlData.documentId,
          filePath: uploadUrlData.filePath,
        }),
      })

      if (!confirmResponse.ok) {
        const confirmData = await confirmResponse.json()
        throw new Error(confirmData.error || 'Failed to confirm upload')
      }

      setProgress('Interactive lesson created successfully!')
      
      // Redirect to the new interactive lesson
      router.push(`/interactive-lessons/${lessonId}`)
    } catch (err: any) {
      console.error('Error creating interactive lesson:', err)
      setError(err.message || 'Failed to create interactive lesson')
      setUploading(false)
      setProgress('')
      setCurrentPage(0)
      setTotalPages(0)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 gap-4">
        <Link href="/interactive-lessons" className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Create Interactive Lesson</h1>
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
              <div className="p-3 bg-accent-muted rounded-lg text-sm text-accent">
                <div className="flex items-center gap-2 mb-2">
                  <div className="spinner w-4 h-4" />
                  {progress}
                </div>
                {totalPages > 0 && currentPage > 0 && (
                  <div className="w-full bg-accent/20 rounded-full h-2">
                    <div 
                      className="bg-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(currentPage / totalPages) * 100}%` }}
                    />
                  </div>
                )}
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
                  Creating...
                </>
              ) : (
                'Create Interactive Lesson'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

