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
  status: 'pending' | 'converting' | 'ready' | 'error'
  pageImages?: Array<{ page_number: number; url: string }>
  error?: string
}

export default function NewPodcastPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [targetDuration, setTargetDuration] = useState(30)
  const [language, setLanguage] = useState('auto')
  const [style, setStyle] = useState('conversational')
  const [voiceProvider, setVoiceProvider] = useState('openai')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        router.push('/login')
        return
      }
      
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
    
    // Automatically convert PDFs to images (same as MCQ flow)
    await convertFilesInBackground(newFiles)
  }
  
  const convertFilesInBackground = async (filesToConvert: UploadedFile[]) => {
    for (const fileObj of filesToConvert) {
      try {
        // Update status to converting
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'converting' } : f))
        )

        console.log(`[Convert] Converting ${fileObj.name} to images...`)

        // Convert PDF to images in browser (same as MCQ flow)
        const pageImages = await convertPdfToImagesClient(fileObj.file, 1.5)
        
        console.log(`[Convert] ✅ ${fileObj.name}: ${pageImages.length} pages`)

        // Update status to ready with page images
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { 
                  ...f, 
                  status: 'ready',
                  pageImages: pageImages.map(p => ({
                    page_number: p.pageNumber,
                    url: p.dataUrl
                  }))
                }
              : f
          )
        )
      } catch (err: any) {
        console.error('[Convert] Conversion error:', err)
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { ...f, status: 'error', error: err.message }
              : f
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
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleGenerate = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please add at least one PDF document')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      // Wait for any pending/converting files to complete
      console.log('[Podcast] Checking conversion status...')
      
      // Wait up to 60 seconds for conversions to complete
      const maxWaitTime = 60000 // 60 seconds
      const startTime = Date.now()
      
      while (Date.now() - startTime < maxWaitTime) {
        const pendingOrConverting = uploadedFiles.filter(
          (f) => f.status === 'pending' || f.status === 'converting'
        )
        
        if (pendingOrConverting.length === 0) break
        
        console.log(`[Podcast] Waiting for ${pendingOrConverting.length} files to finish converting...`)
        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      }

      // Get all successfully converted files
      const readyFiles = uploadedFiles.filter((f) => f.status === 'ready' && f.pageImages)

      console.log('[Podcast] Total ready files:', readyFiles.length)

      if (readyFiles.length === 0) {
        throw new Error('No documents were successfully converted. Please check the errors and try again.')
      }

      // Prepare document data with page images (same as MCQ flow)
      const documents = readyFiles.map((f) => ({ 
        name: f.name,
        page_images: f.pageImages!
      }))

      console.log('[Podcast] Sending to API:', documents.map(d => ({ name: d.name, pages: d.page_images.length })))

      // Call generation API
      const response = await fetch('/api/intelligent-podcast/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          documents,
          targetDuration,
          language,
          style,
          voiceProvider,
        }),
      })

      const responseData = await response.json()

      if (!response.ok) {
        console.error('[Podcast] API error response:', responseData)
        throw new Error(responseData.error || responseData.details || 'Failed to generate podcast')
      }

      console.log('[Podcast] ✅ Generation started:', responseData)
      
      // Poll for completion
      const podcastId = responseData.id
      await pollPodcastStatus(podcastId)
      
    } catch (err: any) {
      console.error('[Podcast] Generation error:', err)
      setError(err.message || 'Failed to generate podcast')
      setIsGenerating(false)
    }
  }

  const pollPodcastStatus = async (podcastId: string) => {
    const maxPolls = 120 // 10 minutes max (5 second intervals)
    let pollCount = 0

    while (pollCount < maxPolls) {
      try {
        const response = await fetch(`/api/intelligent-podcast/${podcastId}/status`, {
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Failed to get podcast status')
        }

        const data = await response.json()
        setGenerationProgress(data.progress || 0)
        setProgressMessage(data.description || 'Processing...')

        console.log(`[Podcast] Status: ${data.status}, Progress: ${data.progress}%`)

        if (data.status === 'ready') {
          console.log('[Podcast] ✅ Generation completed!')
          setGenerationProgress(100)
          setProgressMessage('Complete! Redirecting...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          router.push(`/intelligent-podcast/${podcastId}`)
          return
        }

        if (data.status === 'error') {
          throw new Error(data.description || 'Podcast generation failed')
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000))
        pollCount++
      } catch (err: any) {
        console.error('[Podcast] Polling error:', err)
        setError(err.message || 'Failed to track podcast generation')
        setIsGenerating(false)
        return
      }
    }

    // Timeout
    setError('Generation is taking longer than expected. Check back later.')
    setIsGenerating(false)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Create Intelligent Podcast</h1>
          <p className="text-gray-400">
            Transform your documents into an engaging, interactive multi-voice podcast
          </p>
        </div>

        {/* Generation form */}
        <div className="space-y-6">
          {/* Documents Upload */}
          <div className="bg-gray-900 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Source Documents</h3>
            <p className="text-gray-400 text-sm mb-4">
              Upload PDF documents to transform into an interactive podcast
            </p>
            
            {/* Drag & Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
              }`}
            >
              <div className="text-5xl mb-4">📄</div>
              <p className="text-lg font-medium text-gray-300 mb-2">
                {isDragging ? 'Drop files here' : 'Drag & drop PDFs here'}
              </p>
              <p className="text-sm text-gray-500">
                or click to browse files
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

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="mt-6 space-y-2">
                <h4 className="text-sm font-medium text-gray-400 mb-3">
                  Uploaded Files ({uploadedFiles.length})
                </h4>
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-2xl">
                        {file.status === 'ready' ? '✅' :
                         file.status === 'converting' ? '⏳' :
                         file.status === 'error' ? '❌' : '📄'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                          {file.status === 'converting' && ' - Converting to images...'}
                          {file.status === 'ready' && file.pageImages && ` - ${file.pageImages.length} pages ready`}
                          {file.status === 'error' && ` - Error: ${file.error}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Configuration */}
          <div className="bg-gray-900 rounded-lg p-6 space-y-4">
            <h3 className="text-xl font-semibold mb-4">Podcast Configuration</h3>
            
            {/* Duration */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Duration: {targetDuration} minutes
              </label>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10 min</span>
                <span>30 min</span>
                <span>60 min</span>
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>

            {/* Style */}
            <div>
              <label className="block text-sm font-medium mb-2">Conversation Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2"
              >
                <option value="educational">Educational</option>
                <option value="conversational">Conversational</option>
                <option value="technical">Technical</option>
                <option value="storytelling">Storytelling</option>
              </select>
            </div>

            {/* Voice Provider */}
            <div>
              <label className="block text-sm font-medium mb-2">Voice Quality</label>
              <select
                value={voiceProvider}
                onChange={(e) => setVoiceProvider(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2"
              >
                <option value="openai">OpenAI (Good quality, fast)</option>
                <option value="elevenlabs">ElevenLabs (Premium quality)</option>
                <option value="playht">PlayHT (High quality)</option>
              </select>
            </div>
          </div>

          {/* Features preview */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3">✨ Intelligent Features</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>✅ <strong>3 distinct voices</strong> - Host, Expert, Simplifier</li>
              <li>✅ <strong>Knowledge Graph</strong> - Concepts and relationships mapped</li>
              <li>✅ <strong>Chapter navigation</strong> - Jump to any topic instantly</li>
              <li>✅ <strong>Interactive Q&A</strong> - Ask questions with voice (Realtime API)</li>
              <li>✅ <strong>Smart breakpoints</strong> - Optimal moments to pause</li>
              <li>✅ <strong>Predicted questions</strong> - Pre-answered common questions</li>
              <li>✅ <strong>Semantic search</strong> - Find any concept instantly</li>
            </ul>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-900/50 border border-red-600 rounded-lg p-4">
              <div className="font-semibold">Error</div>
              <div className="text-sm text-red-200">{error}</div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || uploadedFiles.filter(f => f.status === 'ready').length === 0}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed font-semibold text-lg rounded-lg transition-all"
          >
            {isGenerating ? 'Generating Podcast...' : '🎙️ Generate Intelligent Podcast'}
          </button>

          {/* Progress */}
          {isGenerating && (
            <div className="bg-gray-900 rounded-lg p-6">
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300">{progressMessage || 'Starting...'}</span>
                  <span className="text-blue-400 font-medium">{generationProgress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-500 ease-out"
                    style={{ width: `${generationProgress}%` }}
                  ></div>
                </div>
              </div>
              <p className="text-center text-gray-400 text-sm mt-4">
                This will take 5-10 minutes. The page will automatically redirect when complete.
              </p>
              <div className="mt-3 text-center text-xs text-gray-500">
                Transcribing → Knowledge Graph → Script → Audio Generation → Finalizing
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
