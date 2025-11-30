'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { FiLoader, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

// Use local PDF.js worker (copied by postinstall script)
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

interface InteractiveLessonProcessorProps {
  lessonId: string
  documentId: string
  documentUrl: string
  onComplete: () => void
  onError: (error: string) => void
}

export default function InteractiveLessonProcessor({
  lessonId,
  documentId,
  documentUrl,
  onComplete,
  onError
}: InteractiveLessonProcessorProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [transcriptions, setTranscriptions] = useState<Array<{pageNumber: number, text: string}>>([])
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Start processing when component mounts
  useEffect(() => {
    if (numPages > 0 && !processing && currentPage === 0) {
      startProcessing()
    }
  }, [numPages, processing, currentPage])

  const startProcessing = async () => {
    setProcessing(true)
    console.log(`[PROCESSOR] Starting processing for ${numPages} pages`)

    try {
      // Process each page sequentially
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        setCurrentPage(pageNum)
        
        // Wait for page to render
        await new Promise(resolve => setTimeout(resolve, 500))

        // Capture page as image
        const pageImage = await capturePage()
        if (!pageImage) {
          console.warn(`[PROCESSOR] Could not capture page ${pageNum}, skipping`)
          continue
        }

        // Update progress in database
        await updateProgress(pageNum, `Transcription IA page ${pageNum}/${numPages}...`)

        // Transcribe page with AI
        const transcription = await transcribePage(pageNum, pageImage)
        if (transcription) {
          setTranscriptions(prev => [...prev, { pageNumber: pageNum, text: transcription }])
        }
      }

      // All pages processed, now analyze structure
      console.log(`[PROCESSOR] All pages transcribed, analyzing structure...`)
      await analyzeStructure()

      // Mark as complete
      onComplete()
    } catch (err: any) {
      console.error(`[PROCESSOR] Error:`, err)
      setError(err.message || 'Processing failed')
      onError(err.message || 'Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const capturePage = (): Promise<string | null> => {
    return new Promise((resolve) => {
      // Longer delay and multiple attempts to find canvas
      let attempts = 0
      const maxAttempts = 20 // Try for up to 2 seconds
      
      const tryCapture = () => {
        const canvas = document.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement
        if (canvas) {
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
            console.log(`[PROCESSOR] ✓ Canvas captured after ${attempts * 100}ms`)
            resolve(dataUrl)
          } catch (e) {
            console.error('[PROCESSOR] Failed to capture canvas:', e)
            resolve(null)
          }
        } else {
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(tryCapture, 100)
          } else {
            console.warn(`[PROCESSOR] No canvas found after ${attempts * 100}ms`)
            resolve(null)
          }
        }
      }
      
      tryCapture()
    })
  }

  const transcribePage = async (pageNumber: number, pageImage: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/transcribe-page-vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageNumber,
          pageImage,
          documentId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Transcription failed')
      }

      const data = await response.json()
      console.log(`[PROCESSOR] ✓ Page ${pageNumber} transcribed: ${data.length} chars`)
      return data.transcription
    } catch (err: any) {
      console.error(`[PROCESSOR] Error transcribing page ${pageNumber}:`, err)
      return null
    }
  }

  const updateProgress = async (pageNumber: number, message: string) => {
    const percent = Math.round((pageNumber / numPages) * 80) // 0-80% for transcription

    try {
      await fetch(`/api/interactive-lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processing_message: message,
          processing_percent: percent,
          processing_progress: pageNumber,
          processing_total: numPages
        })
      })
    } catch (err) {
      console.error('[PROCESSOR] Failed to update progress:', err)
    }
  }

  const analyzeStructure = async () => {
    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/analyze-lesson-structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Structure analysis failed')
      }

      const data = await response.json()
      console.log(`[PROCESSOR] ✓ Structure analyzed: ${data.sectionsCount} sections created`)
    } catch (err: any) {
      console.error('[PROCESSOR] Error analyzing structure:', err)
      throw err
    }
  }

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log(`[PROCESSOR] PDF loaded: ${numPages} pages`)
    setNumPages(numPages)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 bg-error-muted rounded-full flex items-center justify-center mb-4">
          <FiAlertCircle className="w-8 h-8 text-error" />
        </div>
        <p className="text-error text-center mb-2">Erreur lors du traitement</p>
        <p className="text-sm text-text-tertiary text-center max-w-md">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Progress indicator */}
      <div className="mb-6">
        {processing && currentPage > 0 ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-accent-muted rounded-full flex items-center justify-center mb-4 mx-auto">
              <FiLoader className="w-8 h-8 text-accent animate-spin" />
            </div>
            <p className="text-lg font-medium text-text-primary mb-1">
              Traitement en cours...
            </p>
            <p className="text-sm text-text-tertiary">
              Page {currentPage} sur {numPages}
            </p>
            <div className="mt-4 w-64 h-2 bg-elevated rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${(currentPage / numPages) * 100}%` }}
              />
            </div>
          </div>
        ) : numPages > 0 ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mb-4 mx-auto">
              <FiCheckCircle className="w-8 h-8 text-success" />
            </div>
            <p className="text-lg font-medium text-text-primary">Traitement terminé !</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-accent-muted rounded-full flex items-center justify-center mb-4 mx-auto">
              <FiLoader className="w-8 h-8 text-accent animate-spin" />
            </div>
            <p className="text-lg font-medium text-text-primary">Chargement du PDF...</p>
          </div>
        )}
      </div>

      {/* Hidden PDF renderer - only renders the current page being processed */}
      <div className="hidden">
        <Document
          file={documentUrl}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={(error) => {
            console.error('[PROCESSOR] PDF load error:', error)
            setError('Impossible de charger le PDF')
            onError('Impossible de charger le PDF')
          }}
        >
          {currentPage > 0 && (
            <Page 
              pageNumber={currentPage}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          )}
        </Document>
      </div>
    </div>
  )
}

