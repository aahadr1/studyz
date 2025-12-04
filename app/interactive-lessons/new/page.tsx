'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiUpload, FiFile, FiX, FiCheck } from 'react-icons/fi'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

// Processing steps with weights for overall progress calculation
const STEPS = [
  { id: 'converting', label: 'Converting PDF', weight: 15 },
  { id: 'uploading', label: 'Uploading pages', weight: 20 },
  { id: 'transcribing', label: 'Transcribing content', weight: 45 },
  { id: 'generating', label: 'Creating lesson', weight: 20 },
] as const

type StepId = typeof STEPS[number]['id']

interface ProcessingState {
  currentStep: StepId | null
  currentStepIndex: number
  currentItem: number
  totalItems: number
  overallPercent: number
  completedSteps: StepId[]
}

export default function NewInteractiveLessonPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  
  // Detailed processing state
  const [processing, setProcessing] = useState<ProcessingState>({
    currentStep: null,
    currentStepIndex: 0,
    currentItem: 0,
    totalItems: 0,
    overallPercent: 0,
    completedSteps: []
  })

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

  // Calculate overall progress percentage
  const calculateOverallPercent = (stepId: StepId, itemProgress: number) => {
    const stepIndex = STEPS.findIndex(s => s.id === stepId)
    let percent = 0
    
    // Add completed steps
    for (let i = 0; i < stepIndex; i++) {
      percent += STEPS[i].weight
    }
    
    // Add current step progress
    const currentStepWeight = STEPS[stepIndex]?.weight || 0
    percent += (itemProgress / 100) * currentStepWeight
    
    return Math.min(100, Math.round(percent))
  }

  // Update processing state helper
  const updateProcessing = (
    stepId: StepId, 
    currentItem: number, 
    totalItems: number,
    completedSteps?: StepId[]
  ) => {
    const stepIndex = STEPS.findIndex(s => s.id === stepId)
    const itemPercent = totalItems > 0 ? (currentItem / totalItems) * 100 : 0
    const overallPercent = calculateOverallPercent(stepId, itemPercent)
    
    setProcessing(prev => ({
      currentStep: stepId,
      currentStepIndex: stepIndex,
      currentItem,
      totalItems,
      overallPercent,
      completedSteps: completedSteps || prev.completedSteps
    }))
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
    setProcessing({
      currentStep: 'converting',
      currentStepIndex: 0,
      currentItem: 0,
      totalItems: 0,
      overallPercent: 0,
      completedSteps: []
    })

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      // STEP 1: Convert PDF to images
      updateProcessing('converting', 0, 1)
      const pageImages = await convertPdfToImagesClient(file, 1.5)
      
      if (pageImages.length === 0) {
        throw new Error('No pages found in PDF')
      }
      if (pageImages.length > 200) {
        throw new Error(`PDF has ${pageImages.length} pages, which exceeds the maximum limit of 200 pages`)
      }

      const totalPages = pageImages.length
      updateProcessing('converting', 1, 1, ['converting'])

      // Create interactive lesson record
      const createResponse = await fetch('/api/interactive-lessons', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      })

      const createData = await createResponse.json()
      if (!createResponse.ok) {
        throw new Error(createData.error || 'Failed to create interactive lesson')
      }

      const lessonId = createData.lesson.id

      // Get upload URL for document
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

      // Upload original PDF
      await fetch(uploadUrlData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      // Confirm upload
      const confirmRes = await fetch(`/api/interactive-lessons/${lessonId}/confirm-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: uploadUrlData.filePath,
          fileName: file.name,
          category: 'lesson',
          fileType: 'pdf',
        }),
      })

      if (!confirmRes.ok) {
        const confirmData = await confirmRes.json()
        throw new Error(confirmData.error || 'Failed to confirm upload')
      }

      // STEP 2: Upload page images
      for (let i = 0; i < pageImages.length; i++) {
        updateProcessing('uploading', i + 1, totalPages)
        
        const pageImage = pageImages[i]
        const uploadPageRes = await fetch(`/api/interactive-lessons/${lessonId}/upload-page`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pageNumber: pageImage.pageNumber,
            dataUrl: pageImage.dataUrl,
            width: pageImage.width,
            height: pageImage.height,
          }),
        })
        
        if (!uploadPageRes.ok) {
          const errorData = await uploadPageRes.json()
          console.warn(`Failed to upload page ${i + 1}:`, errorData.error)
        }
      }
      updateProcessing('uploading', totalPages, totalPages, ['converting', 'uploading'])

      // STEP 3: Transcribe each page
      for (let i = 0; i < totalPages; i++) {
        updateProcessing('transcribing', i + 1, totalPages)
        
        const transcribeResponse = await fetch(`/api/interactive-lessons/${lessonId}/process`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'transcribe',
            page_number: i + 1,
            total_pages: totalPages,
          }),
        })

        if (!transcribeResponse.ok) {
          const errorData = await transcribeResponse.json()
          console.warn(`Failed to transcribe page ${i + 1}:`, errorData.error)
          // Continue with other pages
        }
      }
      updateProcessing('transcribing', totalPages, totalPages, ['converting', 'uploading', 'transcribing'])

      // STEP 4: Generate lesson sections
      updateProcessing('generating', 0, 1)
      
      const generateResponse = await fetch(`/api/interactive-lessons/${lessonId}/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'generate_lesson',
          total_pages: totalPages,
        }),
      })

      if (!generateResponse.ok) {
        const errorData = await generateResponse.json()
        throw new Error(errorData.error || 'Failed to generate lesson sections')
      }
      // Mark lesson as ready
      await fetch(`/api/interactive-lessons/${lessonId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lesson_status: 'ready',
          status: 'ready',
        }),
      })

      updateProcessing('generating', 1, 1, ['converting', 'uploading', 'transcribing', 'generating'])
      
      // Small delay to show completion
      await new Promise(r => setTimeout(r, 500))
      
      // Redirect to the new interactive lesson
      router.push(`/interactive-lessons/${lessonId}`)
    } catch (err: any) {
      console.error('Error creating interactive lesson:', err)
      setError(err.message || 'Failed to create interactive lesson')
      setUploading(false)
      setProcessing({
        currentStep: null,
        currentStepIndex: 0,
        currentItem: 0,
        totalItems: 0,
        overallPercent: 0,
        completedSteps: []
      })
    }
  }

  const getCurrentStepLabel = () => {
    if (!processing.currentStep) return ''
    const step = STEPS.find(s => s.id === processing.currentStep)
    return step?.label || ''
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

            {/* Detailed Progress */}
            {uploading && processing.currentStep && (
              <div className="space-y-4">
                {/* Overall Progress */}
                <div className="p-4 bg-surface border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">
                      Overall Progress
                    </span>
                    <span className="text-sm text-accent mono">
                      {processing.overallPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-elevated rounded-full h-2 mb-3">
                    <div 
                      className="bg-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${processing.overallPercent}%` }}
                    />
                  </div>
                  
                  {/* Current Step Detail */}
                  <div className="text-xs text-text-secondary">
                    {getCurrentStepLabel()}
                    {processing.totalItems > 1 && (
                      <span className="text-text-tertiary">
                        {' '}(page {processing.currentItem} of {processing.totalItems})
                      </span>
                    )}
                  </div>
                </div>

                {/* Step List */}
                <div className="space-y-2">
                  {STEPS.map((step, index) => {
                    const isCompleted = processing.completedSteps.includes(step.id)
                    const isCurrent = processing.currentStep === step.id
                    const isPending = !isCompleted && !isCurrent
                    
                    return (
                      <div 
                        key={step.id}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          isCurrent ? 'bg-accent-muted' : 
                          isCompleted ? 'bg-surface' : 
                          'bg-elevated opacity-50'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          isCompleted ? 'bg-green-500/20 text-green-400' :
                          isCurrent ? 'bg-accent text-white' :
                          'bg-elevated text-text-tertiary'
                        }`}>
                          {isCompleted ? (
                            <FiCheck className="w-3.5 h-3.5" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="flex-1">
                          <span className={`text-sm ${
                            isCurrent ? 'text-accent font-medium' :
                            isCompleted ? 'text-text-secondary' :
                            'text-text-tertiary'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                        {isCurrent && processing.totalItems > 1 && (
                          <span className="text-xs text-accent mono">
                            {processing.currentItem}/{processing.totalItems}
                          </span>
                        )}
                        {isCurrent && (
                          <div className="spinner w-4 h-4" />
                        )}
                      </div>
                    )
                  })}
                </div>
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
                  Processing...
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
