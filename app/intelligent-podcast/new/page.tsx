'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface UploadedFile {
  file: File
  id: string
  name: string
  size: number
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  url?: string
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

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      status: 'pending',
    }))

    setUploadedFiles((prev) => [...prev, ...newFiles])
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

  const uploadFiles = async () => {
    const supabase = createClient()
    const filesToUpload = uploadedFiles.filter((f) => f.status === 'pending')

    for (const fileObj of filesToUpload) {
      try {
        // Update status to uploading
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'uploading' } : f))
        )

        // Upload to Supabase Storage
        const filePath = `podcasts/${Date.now()}-${fileObj.file.name}`
        const { data, error: uploadError } = await supabase.storage
          .from('podcast-documents') // Use podcast-documents bucket
          .upload(filePath, fileObj.file)

        if (uploadError) throw uploadError

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('podcast-documents').getPublicUrl(filePath)

        // Update status to uploaded
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'uploaded', url: publicUrl } : f
          )
        )
      } catch (err: any) {
        console.error('Upload error:', err)
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

  const handleGenerate = async () => {
    const uploadedDocs = uploadedFiles.filter((f) => f.status === 'uploaded')
    
    if (uploadedDocs.length === 0) {
      setError('Please upload at least one document')
      return
    }

    // First, upload any pending files
    const pendingFiles = uploadedFiles.filter((f) => f.status === 'pending')
    if (pendingFiles.length > 0) {
      await uploadFiles()
    }

    setIsGenerating(true)
    setError(null)

    try {
      const documentUrls = uploadedFiles
        .filter((f) => f.status === 'uploaded')
        .map((f) => f.url)

      const response = await fetch('/api/intelligent-podcast/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentUrls,
          targetDuration,
          language,
          style,
          voiceProvider,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate podcast')
      }

      const result = await response.json()
      
      // Redirect to podcast player
      router.push(`/intelligent-podcast/${result.id}`)
    } catch (err: any) {
      console.error('Generation error:', err)
      setError(err.message || 'Failed to generate podcast')
    } finally {
      setIsGenerating(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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
                        {file.status === 'uploaded' ? '✅' :
                         file.status === 'uploading' ? '⏳' :
                         file.status === 'error' ? '❌' : '📄'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                          {file.status === 'uploading' && ' - Uploading...'}
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

                {/* Upload button for pending files */}
                {uploadedFiles.some((f) => f.status === 'pending') && (
                  <button
                    onClick={uploadFiles}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded mt-3"
                  >
                    Upload Files to Storage
                  </button>
                )}
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
            disabled={isGenerating || uploadedFiles.filter(f => f.status === 'uploaded').length === 0}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed font-semibold text-lg rounded-lg transition-all"
          >
            {isGenerating ? 'Generating Podcast...' : '🎙️ Generate Intelligent Podcast'}
          </button>

          {/* Progress */}
          {isGenerating && (
            <div className="bg-gray-900 rounded-lg p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              </div>
              <p className="text-center text-gray-400">
                This may take 2-5 minutes depending on content length...
              </p>
              <div className="mt-4 text-center text-sm text-gray-500">
                Analyzing documents → Building knowledge graph → Generating script → Creating audio
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
