'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import MobileLayout, { MobileHeader } from '@/components/mobile/MobileLayout'
import { useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { FiUpload, FiX, FiCheck, FiAlertCircle } from 'react-icons/fi'

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

export default function MobileNewPodcastPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { triggerHaptic } = useHapticFeedback()

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [targetDuration, setTargetDuration] = useState(30)
  const [language, setLanguage] = useState('auto')
  const [style, setStyle] = useState('conversational')
  const [userPrompt, setUserPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
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
        router.push('/m/login')
        return
      }
      setUserId(user.id)
      setIsCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return
    triggerHaptic('light')
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
        triggerHaptic('success')
      } catch (err: any) {
        console.error('[Podcast Upload] Upload error:', err)
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'error', error: err.message } : f
          )
        )
        triggerHaptic('error')
      }
    }
  }

  const removeFile = (id: string) => {
    triggerHaptic('light')
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
      triggerHaptic('error')
      return
    }

    setIsGenerating(true)
    setError(null)
    triggerHaptic('medium')

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
          voiceProvider: 'gemini',
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
      triggerHaptic('error')
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
          triggerHaptic('success')
          await new Promise((r) => setTimeout(r, 1000))
          router.push(`/m/intelligent-podcast/${podcastId}`)
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
          triggerHaptic('success')
          await new Promise((r) => setTimeout(r, 1000))
          router.push(`/m/intelligent-podcast/${podcastId}`)
          return
        }
        if (after?.status === 'error') {
          throw new Error(after.description || 'Podcast generation failed')
        }

        await new Promise((r) => setTimeout(r, 2000))
        pollCount++
      }
      setError('Generation is taking longer than expected. Check back later.')
      triggerHaptic('error')
    } catch (err: any) {
      console.error('[Podcast] Polling error:', err)
      setError(err.message || 'Failed to track podcast generation')
      triggerHaptic('error')
    } finally {
      clearInterval(statusInterval)
      setIsGenerating(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  const fileStatusText = (file: UploadedFile) => {
    switch (file.status) {
      case 'uploading_pdf': return 'Uploading...'
      case 'converting': return 'Processing...'
      case 'uploading_pages': return 'Preparing...'
      case 'ready': return file.pageImages ? `${file.pageImages.length}p` : 'Ready'
      case 'error': return file.error || 'Error'
      default: return 'Pending'
    }
  }

  if (isCheckingAuth) {
    return (
      <MobileLayout hideTabBar>
        <MobileHeader title="New Podcast" backHref="/m/intelligent-podcast" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  const readyCount = uploadedFiles.filter(f => f.status === 'ready').length

  return (
    <MobileLayout hideTabBar>
      <MobileHeader title="New Podcast" backHref="/m/intelligent-podcast" />

      <div className="mobile-content px-4 py-6 space-y-6">
        {/* Documents */}
        <section>
          <label className="input-label-mobile">Documents</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-[var(--color-border)] p-8 text-center active:bg-[var(--color-surface)]"
          >
            <FiUpload className="w-8 h-8 mx-auto mb-3 text-[var(--color-text-tertiary)]" strokeWidth={1} />
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">
              Tap to upload PDF files
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Max 50MB per file
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
            <div className="mt-3 space-y-2">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-3 bg-[var(--color-surface)] border border-[var(--color-border)]"
                >
                  <div className="flex-shrink-0">
                    {file.status === 'ready' ? (
                      <FiCheck className="w-4 h-4 text-[var(--color-success)]" strokeWidth={2} />
                    ) : file.status === 'error' ? (
                      <FiAlertCircle className="w-4 h-4 text-[var(--color-error)]" strokeWidth={2} />
                    ) : (
                      <div className="spinner-mobile w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{file.name}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mono">
                      {formatFileSize(file.size)} · {fileStatusText(file)}
                    </p>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(file.id) }}
                    className="p-1 text-[var(--color-text-tertiary)] active:opacity-50"
                  >
                    <FiX className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-[var(--color-border)]" />

        {/* Focus */}
        <section>
          <label className="input-label-mobile">Focus Instructions</label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="e.g. Explain like a university lecture..."
            className="input-mobile min-h-[80px] resize-y"
          />
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">
            Optional. Guides conversation focus.
          </p>
        </section>

        {/* Duration */}
        <section>
          <label className="input-label-mobile">Duration · {targetDuration} min</label>
          <input
            type="range"
            min="10"
            max="60"
            step="5"
            value={targetDuration}
            onChange={(e) => setTargetDuration(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[var(--color-text-tertiary)] mono mt-1">
            <span>10m</span>
            <span>60m</span>
          </div>
        </section>

        {/* Settings Row */}
        <div className="grid grid-cols-2 gap-4">
          <section>
            <label className="input-label-mobile">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input-mobile"
            >
              <option value="auto">Auto</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
            </select>
          </section>

          <section>
            <label className="input-label-mobile">Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="input-mobile"
            >
              <option value="conversational">Conversational</option>
              <option value="educational">Educational</option>
              <option value="technical">Technical</option>
              <option value="storytelling">Storytelling</option>
            </select>
          </section>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[var(--color-error-soft)] border border-[var(--color-error)] p-3">
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || readyCount === 0}
          className="btn-mobile btn-primary-mobile w-full"
        >
          {isGenerating ? 'Generating...' : 'Generate Podcast'}
        </button>

        {/* Progress */}
        {isGenerating && (
          <div className="border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-[var(--color-text-secondary)]">{progressMessage || 'Starting...'}</span>
              <span className="mono text-xs">{generationProgress}%</span>
            </div>
            <div className="w-full bg-[var(--color-surface)] h-1 overflow-hidden">
              <div
                className="bg-[var(--color-text)] h-full transition-all duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-3 text-center">
              This takes a few minutes. You'll be redirected.
            </p>
          </div>
        )}
      </div>
    </MobileLayout>
  )
}
