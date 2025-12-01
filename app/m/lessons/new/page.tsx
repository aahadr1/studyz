'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, LoadingOverlay } from '@/components/mobile/MobileLayout'
import { 
  FiUpload, 
  FiFile, 
  FiX, 
  FiCheck,
  FiAlertCircle
} from 'react-icons/fi'

export default function MobileNewLessonPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    
    if (selectedFile.type !== 'application/pdf') {
      setError('Please select a PDF file')
      return
    }
    
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB')
      return
    }
    
    setFile(selectedFile)
    setError('')
    
    // Auto-fill name from filename
    if (!name) {
      setName(selectedFile.name.replace('.pdf', ''))
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
    setProgress('Uploading PDF...')

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/m/login')
        return
      }

      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('file', file)

      setProgress('Converting pages to images...')

      const response = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      })

      let data
      try {
        data = await response.json()
      } catch {
        if (response.status === 413) {
          throw new Error('File is too large. Try a smaller PDF.')
        }
        throw new Error(`Server error. Please try again.`)
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create lesson')
      }

      setProgress('Lesson created!')
      router.push(`/m/lessons/${data.lesson.id}`)
    } catch (err: any) {
      console.error('Error:', err)
      setError(err.message || 'Failed to create lesson')
      setUploading(false)
      setProgress('')
    }
  }

  return (
    <MobileLayout hideTabBar={true}>
      <MobileHeader 
        title="New Lesson" 
        backHref="/m/lessons"
      />

      {uploading && <LoadingOverlay message={progress} />}

      <div className="mobile-content px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Lesson Name */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Lesson Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Chapter 5 - Quantum Mechanics"
              className="input-mobile"
              disabled={uploading}
            />
          </div>

          {/* File Upload */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">PDF Document</label>
            
            {!file ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="upload-area-mobile w-full"
                disabled={uploading}
              >
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-soft)] flex items-center justify-center mb-4">
                    <FiUpload className="w-8 h-8 text-[var(--color-accent)]" />
                  </div>
                  <p className="text-[var(--color-text-primary)] font-semibold mb-1">
                    Tap to upload
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    PDF files only (max 50MB)
                  </p>
                </div>
              </button>
            ) : (
              <div className="mobile-card p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-soft)] flex items-center justify-center flex-shrink-0">
                    <FiFile className="w-6 h-6 text-[var(--color-accent)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--color-text-primary)] truncate text-sm">
                      {file.name}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="w-10 h-10 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center"
                    >
                      <FiX className="w-5 h-5 text-[var(--color-text-tertiary)]" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-error-soft)] border border-[var(--color-error)]/20 animate-slide-down">
              <FiAlertCircle className="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-error)]">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={uploading || !name.trim() || !file}
            className="btn-mobile btn-primary-mobile w-full"
          >
            {uploading ? (
              <>
                <div className="spinner-mobile w-5 h-5" style={{ borderWidth: '2px' }} />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <FiCheck className="w-5 h-5" />
                <span>Create Lesson</span>
              </>
            )}
          </button>

          {/* Tips */}
          <div className="mobile-card p-4 bg-[var(--color-surface)]">
            <h3 className="font-semibold text-[var(--color-text-primary)] text-sm mb-2">Tips</h3>
            <ul className="space-y-2 text-xs text-[var(--color-text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-accent)]">•</span>
                Clear, high-quality PDFs work best
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-accent)]">•</span>
                Maximum 200 pages per lesson
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-accent)]">•</span>
                AI will help you understand content
              </li>
            </ul>
          </div>
        </form>
      </div>
    </MobileLayout>
  )
}

