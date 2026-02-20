'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import MobileLayout, { MobileHeader } from '@/components/mobile/MobileLayout'
import { useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { FiUpload, FiX, FiCheck, FiAlertCircle } from 'react-icons/fi'

const STEPS = [
  { id: 'converting', label: 'Converting PDF', weight: 15 },
  { id: 'uploading', label: 'Uploading pages', weight: 20 },
  { id: 'transcribing', label: 'Transcribing', weight: 45 },
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

export default function MobileNewInteractiveLessonPage() {
  const router = useRouter()
  const { triggerHaptic } = useHapticFeedback()

  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  
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
    if (!selectedFile) return
    
    triggerHaptic('light')
    
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file')
      triggerHaptic('error')
      return
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB')
      triggerHaptic('error')
      return
    }
    const estimatedPages = Math.max(1, Math.round(selectedFile.size / (50 * 1024)))
    if (estimatedPages > 200) {
      setError(`This file may have ${estimatedPages} pages. Max 200 pages.`)
      triggerHaptic('error')
      return
    }
    setFile(selectedFile)
    setError('')
  }

  const calculateOverallPercent = (stepId: StepId, itemProgress: number) => {
    const stepIndex = STEPS.findIndex(s => s.id === stepId)
    let percent = 0
    
    for (let i = 0; i < stepIndex; i++) {
      percent += STEPS[i].weight
    }
    
    const currentStepWeight = STEPS[stepIndex]?.weight || 0
    percent += (itemProgress / 100) * currentStepWeight
    
    return Math.min(100, Math.round(percent))
  }

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
      triggerHaptic('error')
      return
    }
    if (!file) {
      setError('Please select a PDF file')
      triggerHaptic('error')
      return
    }

    setUploading(true)
    setError('')
    triggerHaptic('medium')
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
        router.push('/m/login')
        return
      }

      // STEP 1: Convert PDF
      updateProcessing('converting', 0, 1)
      const pageImages = await convertPdfToImagesClient(file, 1.5)
      
      if (pageImages.length === 0) {
        throw new Error('No pages found in PDF')
      }
      if (pageImages.length > 200) {
        throw new Error(`PDF has ${pageImages.length} pages (max 200)`)
      }

      const totalPages = pageImages.length
      updateProcessing('converting', 1, 1, ['converting'])

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
        throw new Error(createData.error || 'Failed to create lesson')
      }

      const lessonId = createData.lesson.id

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

      await fetch(uploadUrlData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

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
        await fetch(`/api/interactive-lessons/${lessonId}/upload-page`, {
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
      }
      updateProcessing('uploading', totalPages, totalPages, ['converting', 'uploading'])

      // STEP 3: Transcribe
      for (let i = 0; i < totalPages; i++) {
        updateProcessing('transcribing', i + 1, totalPages)
        
        await fetch(`/api/interactive-lessons/${lessonId}/process`, {
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
      }
      updateProcessing('transcribing', totalPages, totalPages, ['converting', 'uploading', 'transcribing'])

      // STEP 4: Generate lesson
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
        throw new Error(errorData.error || 'Failed to generate lesson')
      }

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
      triggerHaptic('success')
      
      await new Promise(r => setTimeout(r, 500))
      router.push(`/m/interactive-lessons/${lessonId}`)
    } catch (err: any) {
      console.error('Error creating interactive lesson:', err)
      setError(err.message || 'Failed to create lesson')
      setUploading(false)
      triggerHaptic('error')
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
    <MobileLayout hideTabBar>
      <MobileHeader title="New Interactive" backHref="/m/interactive-lessons" />

      <div className="mobile-content px-4 py-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="input-label-mobile">Lesson Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Chapter 5 - Quantum"
              className="input-mobile"
              disabled={uploading}
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="input-label-mobile">PDF Document</label>
            {!file ? (
              <label className="upload-area-mobile cursor-pointer">
                <FiUpload className="w-8 h-8 mx-auto mb-3 text-[var(--color-text-tertiary)]" strokeWidth={1} />
                <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                  Tap to upload PDF
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Max 50MB, 200 pages
                </p>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div className="w-10 h-10 border border-[var(--color-border)] flex items-center justify-center">
                  <FiCheck className="w-5 h-5 text-[var(--color-success)]" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mono">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      triggerHaptic('light')
                    }}
                    className="p-1 text-[var(--color-text-tertiary)] active:opacity-50"
                  >
                    <FiX className="w-4 h-4" strokeWidth={2} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[var(--color-error-soft)] border border-[var(--color-error)] p-3">
              <div className="flex gap-2">
                <FiAlertCircle className="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--color-error)]">{error}</p>
              </div>
            </div>
          )}

          {/* Progress */}
          {uploading && processing.currentStep && (
            <div className="space-y-4">
              <div className="border border-[var(--color-border)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Progress</span>
                  <span className="text-sm mono">{processing.overallPercent}%</span>
                </div>
                <div className="w-full bg-[var(--color-surface)] h-1 mb-3">
                  <div 
                    className="bg-[var(--color-text)] h-1 transition-all duration-300"
                    style={{ width: `${processing.overallPercent}%` }}
                  />
                </div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {getCurrentStepLabel()}
                  {processing.totalItems > 1 && (
                    <span className="text-[var(--color-text-tertiary)]">
                      {' '}({processing.currentItem}/{processing.totalItems})
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {STEPS.map((step, index) => {
                  const isCompleted = processing.completedSteps.includes(step.id)
                  const isCurrent = processing.currentStep === step.id
                  
                  return (
                    <div 
                      key={step.id}
                      className={`flex items-center gap-3 p-3 ${
                        isCurrent ? 'bg-[var(--color-surface)]' : 
                        isCompleted ? 'bg-[var(--color-bg)]' : 
                        'bg-[var(--color-bg)] opacity-50'
                      }`}
                    >
                      <div className={`w-6 h-6 border flex items-center justify-center text-xs mono ${
                        isCompleted ? 'border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-bg)]' :
                        isCurrent ? 'border-[var(--color-text)]' :
                        'border-[var(--color-border)]'
                      }`}>
                        {isCompleted ? (
                          <FiCheck className="w-3.5 h-3.5" strokeWidth={2} />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="flex-1 text-sm">
                        {step.label}
                      </div>
                      {isCurrent && (
                        <div className="spinner-mobile w-4 h-4" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={uploading || !name.trim() || !file}
            className="btn-mobile btn-primary-mobile w-full"
          >
            {uploading ? (
              <>
                <div className="spinner-mobile w-4 h-4" />
                Processing...
              </>
            ) : (
              'Create Lesson'
            )}
          </button>
        </form>
      </div>
    </MobileLayout>
  )
}
