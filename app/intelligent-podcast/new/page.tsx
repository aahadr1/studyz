'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

interface UploadedFile {
  file: File
  id: string
  name: string
  size: number
  status: 'pending' | 'uploading_pdf' | 'converting' | 'uploading_pages' | 'ready' | 'error'
  pdfStoragePath?: string
  pageImages?: Array<{ page_number: number; url: string }>
  pageImageStoragePaths?: string[]
  error?: string
}

export default function NewPodcastPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [targetDuration, setTargetDuration] = useState(30)
  const [language, setLanguage] = useState('auto')
  const [style, setStyle] = useState('conversational')
  const voiceProvider = 'gemini'
  const [userPrompt, setUserPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setIsCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return
    const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      status: 'pending',
    }))
    setUploadedFiles((prev) => [...prev, ...newFiles])
    await prepareFilesInBackground(newFiles)
  }

  const prepareFilesInBackground = async (filesToPrepare: UploadedFile[]) => {
    const supabase = createClient()
    if (!userId) throw new Error('Not authenticated')

    for (const fileObj of filesToPrepare) {
      try {
        const isPdf = fileObj.file.type === 'application/pdf' || fileObj.name.toLowerCase().endsWith('.pdf')
        if (!isPdf) throw new Error('Please upload a PDF file')

        const safeName = fileObj.name.replace(/[^\w.\-() ]+/g, '_')

        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'uploading_pdf' } : f))
        )

        const pdfStoragePath = `${userId}/intelligent-podcasts/uploads/${Date.now()}-${fileObj.id}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('podcast-documents')
          .upload(pdfStoragePath, fileObj.file, { contentType: 'application/pdf', upsert: true })

        if (uploadError) throw new Error(uploadError.message || 'Upload failed')

        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, pdfStoragePath } : f))
        )

        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'converting' } : f))
        )

        const pageImages = await convertPdfToImagesClient(fileObj.file, 1.2, 0.6)

        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'uploading_pages' } : f))
        )

        const uploaded: Array<{ page_number: number; url: string }> = []
        const uploadedPaths: string[] = []

        for (const p of pageImages) {
          const blob = await (await fetch(p.dataUrl)).blob()
          const pagePath = `${userId}/intelligent-podcasts/pages/${Date.now()}-${fileObj.id}/${String(p.pageNumber).padStart(3, '0')}.jpg`
          const { error: pageUploadError } = await supabase.storage
            .from('podcast-documents')
            .upload(pagePath, blob, { contentType: 'image/jpeg', upsert: true })

          if (pageUploadError) throw new Error(pageUploadError.message || 'Failed to upload page image')

          const { data } = supabase.storage.from('podcast-documents').getPublicUrl(pagePath)
          uploaded.push({ page_number: p.pageNumber, url: data.publicUrl })
          uploadedPaths.push(pagePath)
        }

        uploaded.sort((a, b) => a.page_number - b.page_number)

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { ...f, status: 'ready', pageImages: uploaded, pageImageStoragePaths: uploadedPaths }
              : f
          )
        )
      } catch (err: any) {
        console.error('[Podcast Upload] Upload error:', err)
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'error', error: err.message } : f
          )
        )
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.pdfStoragePath) {
        const supabase = createClient()
        void supabase.storage.from('podcast-documents').remove([file.pdfStoragePath])
      }
      if (file?.pageImageStoragePaths && file.pageImageStoragePaths.length > 0) {
        const supabase = createClient()
        void supabase.storage.from('podcast-documents').remove(file.pageImageStoragePaths)
      }
      return prev.filter((f) => f.id !== id)
    })
  }

  const handleGenerate = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please add at least one PDF document')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const maxWaitTime = 120000
      const startTime = Date.now()

      while (Date.now() - startTime < maxWaitTime) {
        const pendingOrBusy = uploadedFiles.filter(
          (f) => f.status === 'pending' || f.status === 'uploading_pdf' || f.status === 'converting' || f.status === 'uploading_pages'
        )
        if (pendingOrBusy.length === 0) break
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const readyFiles = uploadedFiles.filter((f) => f.status === 'ready' && f.pageImages && f.pageImages.length > 0)

      if (readyFiles.length === 0) {
        throw new Error('No documents were successfully prepared. Please check the errors and try again.')
      }

      const documents = readyFiles.map((f) => ({
        name: f.name,
        storage_path: f.pdfStoragePath || '',
        page_images: f.pageImages!,
      }))

      const response = await fetch('/api/intelligent-podcast/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documents,
          targetDuration,
          language,
          style,
          voiceProvider,
          userPrompt,
        }),
      })

      const responseData = await response.json()

      if (!response.ok) {
        throw new Error(responseData.error || responseData.details || 'Failed to generate podcast')
      }

      const podcastId = responseData.id
      startProcessing(podcastId, responseData.documents, responseData.config)
      await pollPodcastStatus(podcastId, responseData.documents, responseData.config)
    } catch (err: any) {
      console.error('[Podcast] Generation error:', err)
      setError(err.message || 'Failed to generate podcast')
      setIsGenerating(false)
    }
  }

  const startProcessing = async (podcastId: string, documents: any, config: any) => {
    try {
      const response = await fetch(`/api/intelligent-podcast/${podcastId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documents, config }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || 'Processing failed')
      }

      setError(null)
      return true
    } catch (err: any) {
      console.error('[Podcast] Failed to start processing:', err)
      setError(`Processing retry: ${err.message}`)
      return false
    }
  }

  const pollPodcastStatus = async (podcastId: string, documents: any, config: any) => {
    const maxPolls = 600
    let pollCount = 0

    const fetchStatus = async () => {
      const res = await fetch(`/api/intelligent-podcast/${podcastId}/status`, { credentials: 'include' })
      if (!res.ok) return null
      return res.json()
    }

    const POLL_MS = 800
    const statusInterval = setInterval(async () => {
      try {
        const data = await fetchStatus()
        if (!data) return
        setGenerationProgress(data.progress ?? 0)
        setProgressMessage(data.description || 'Processing...')
      } catch {
        // ignore
      }
    }, POLL_MS)

    try {
      while (pollCount < maxPolls) {
        const data = await fetchStatus()
        if (data?.status === 'ready') {
          clearInterval(statusInterval)
          setGenerationProgress(100)
          setProgressMessage('Complete! Redirecting...')
          await new Promise((r) => setTimeout(r, 1000))
          router.push(`/intelligent-podcast/${podcastId}`)
          return
        }
        if (data?.status === 'error') {
          throw new Error(data.description || 'Podcast generation failed')
        }

        await startProcessing(podcastId, documents, config)

        const after = await fetchStatus()
        if (after?.status === 'ready') {
          clearInterval(statusInterval)
          setGenerationProgress(100)
          setProgressMessage('Complete! Redirecting...')
          await new Promise((r) => setTimeout(r, 1000))
          router.push(`/intelligent-podcast/${podcastId}`)
          return
        }
        if (after?.status === 'error') {
          throw new Error(after.description || 'Podcast generation failed')
        }

        await new Promise((r) => setTimeout(r, 2000))
        pollCount++
      }
      setError('Generation is taking longer than expected. Check back later.')
    } catch (err: any) {
      console.error('[Podcast] Polling error:', err)
      setError(err.message || 'Failed to track podcast generation')
    } finally {
      clearInterval(statusInterval)
      setIsGenerating(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const fileStatusText = (file: UploadedFile) => {
    switch (file.status) {
      case 'uploading_pdf': return 'Uploading...'
      case 'converting': return 'Processing pages...'
      case 'uploading_pages': return 'Preparing...'
      case 'ready': return file.pageImages ? `${file.pageImages.length} pages` : 'Ready'
      case 'error': return file.error || 'Error'
      default: return 'Pending'
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  const readyCount = uploadedFiles.filter(f => f.status === 'ready').length

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="heading-1">New podcast</h1>
          <p className="caption mt-1">Transform your documents into a natural conversation</p>
        </div>

        <div className="space-y-8">
          {/* Documents */}
          <section>
            <label className="input-label">Documents</label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
                isDragging
                  ? 'border-text-tertiary bg-elevated'
                  : 'border-border hover:border-border-light hover:bg-surface'
              }`}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-text-muted">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm text-text-secondary mb-1">
                {isDragging ? 'Drop files here' : 'Drop PDF files here, or click to browse'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-1">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-surface border border-border rounded-lg"
                  >
                    {/* Status indicator */}
                    <div className="flex-shrink-0">
                      {file.status === 'ready' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : file.status === 'error' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      ) : (
                        <div className="spinner spinner-sm" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{file.name}</p>
                      <p className="text-xs text-text-muted">
                        {formatFileSize(file.size)} · {fileStatusText(file)}
                      </p>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(file.id) }}
                      className="btn-ghost text-text-muted hover:text-error p-1"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="divider" />

          {/* Focus / Instructions */}
          <section>
            <label className="input-label" htmlFor="focus">Focus instructions</label>
            <textarea
              id="focus"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="e.g. Explain like a university lecture, focus on problem-solving, include real-world examples..."
              className="input min-h-[80px] resize-y"
            />
            <p className="text-xs text-text-muted mt-1.5">
              Optional. Guides what the conversation focuses on.
            </p>
          </section>

          {/* Duration */}
          <section>
            <label className="input-label">Duration · {targetDuration} min</label>
            <div className="mt-1">
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full accent-text-primary"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>10 min</span>
                <span>60 min</span>
              </div>
            </div>
          </section>

          {/* Language & Style row */}
          <div className="grid grid-cols-2 gap-4">
            <section>
              <label className="input-label" htmlFor="language">Language</label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="input"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </section>

            <section>
              <label className="input-label" htmlFor="style">Style</label>
              <select
                id="style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="input"
              >
                <option value="conversational">Conversational</option>
                <option value="educational">Educational</option>
                <option value="technical">Technical</option>
                <option value="storytelling">Storytelling</option>
              </select>
            </section>
          </div>

          <div className="divider" />

          {/* Error */}
          {error && (
            <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || readyCount === 0}
            className="btn-primary w-full py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isGenerating ? 'Generating...' : 'Generate podcast'}
          </button>

          {/* Progress */}
          {isGenerating && (
            <div className="card p-5">
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-text-secondary">{progressMessage || 'Starting...'}</span>
                <span className="text-text-primary font-medium mono text-xs">{generationProgress}%</span>
              </div>
              <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-text-primary h-full transition-[width] duration-300 ease-out rounded-full"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-3 text-center">
                This usually takes a few minutes. You'll be redirected automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
