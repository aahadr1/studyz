'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface PDFViewerProps {
  documentId: string
  filePath: string
  currentPage: number
  onPageChange: (page: number) => void
  totalPages: number
  onTotalPagesChange: (total: number) => void
  onCanvasRefReady?: (getImage: () => Promise<string | null>) => void
}

interface SignedUrlResponse {
  signedUrl: string
  documentId: string
  fileName: string
  fileType: string
  pageCount: number
  expiresIn: number
}

export default function PDFViewer({
  documentId,
  currentPage,
  onTotalPagesChange,
  onCanvasRefReady,
}: PDFViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)
  const [rendering, setRendering] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const mountedRef = useRef(true)

  // Load PDF document once
  useEffect(() => {
    let cancelled = false

    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        console.log('📄 Loading PDF for document:', documentId)

        // Get signed URL from backend
        const response = await fetch(`/api/documents/${documentId}/signed-url`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to load document' }))
          throw new Error(errorData.error || 'Failed to get document URL')
        }

        const data: SignedUrlResponse = await response.json()
        if (cancelled) return

        console.log('✅ Got signed URL for:', data.fileName)

        // Dynamically import PDF.js
        const pdfjsLib = await import('pdfjs-dist')
        const pdfVersion = pdfjsLib.version || '3.11.174'
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfVersion}/pdf.worker.min.js`

        if (cancelled) return

        // Load PDF
        const loadingTask = pdfjsLib.getDocument({
          url: data.signedUrl,
          withCredentials: false,
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfVersion}/cmaps/`,
          cMapPacked: true,
        })
        
        const pdf = await loadingTask.promise
        if (cancelled) return

        console.log('✅ PDF loaded, pages:', pdf.numPages)
        setPdfDoc(pdf)
        onTotalPagesChange(pdf.numPages)
        setLoading(false)

      } catch (err: any) {
        if (cancelled) return
        console.error('❌ Error loading PDF:', err)
        
        let errorMessage = err.message || 'Failed to load PDF'
        if (err.message?.includes('Unauthorized')) {
          errorMessage = 'Please log in to view this document'
        } else if (err.message?.includes('Access denied')) {
          errorMessage = 'You do not have access to this document'
        } else if (err.message?.includes('not found')) {
          errorMessage = 'Document not found'
        }
        
        setError(errorMessage)
        setLoading(false)
      }
    }

    loadPDF()

    return () => {
      cancelled = true
    }
  }, [documentId, onTotalPagesChange])

  // Render page whenever page number or scale changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current || rendering) {
      return
    }

    const renderPage = async () => {
      setRendering(true)

      // Cancel any ongoing render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        renderTaskRef.current = null
      }

      try {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return

        const page = await pdfDoc.getPage(currentPage)
        
        // Calculate scale to fit container width
        const containerWidth = container.clientWidth
        const pageViewport = page.getViewport({ scale: 1.0 })
        const autoScale = (containerWidth - 40) / pageViewport.width // 20px padding each side
        
        // Apply both auto-scale and user zoom
        const finalScale = autoScale * scale
        const viewport = page.getViewport({ scale: finalScale })
        
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }

        const renderTask = page.render(renderContext)
        renderTaskRef.current = renderTask

        await renderTask.promise
        
        if (mountedRef.current) {
          console.log('✅ Page', currentPage, 'rendered successfully')
          renderTaskRef.current = null
          setRendering(false)
        }

      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
        }
        if (mountedRef.current) {
          setRendering(false)
        }
      }
    }

    renderPage()

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        renderTaskRef.current = null
      }
    }
  }, [pdfDoc, currentPage, scale, rendering])

  // Register canvas capture function
  const captureCanvas = useCallback(async (): Promise<string | null> => {
    if (!canvasRef.current) {
      console.warn('⚠️ Canvas not available for capture')
      return null
    }

    try {
      const imageDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95)
      const sizeKB = Math.round(imageDataUrl.length / 1024)
      console.log('✅ Page image captured:', sizeKB, 'KB')
      return imageDataUrl
    } catch (err) {
      console.error('❌ Failed to capture page image:', err)
      return null
    }
  }, [])

  useEffect(() => {
    if (onCanvasRefReady && pdfDoc) {
      onCanvasRefReady(captureCanvas)
    }
  }, [onCanvasRefReady, pdfDoc, captureCanvas])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleZoomIn = () => {
    setScale(prev => Math.min(3, prev + 0.25))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.25))
  }

  const handleRetry = () => {
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-bg">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-400">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-bg p-4">
        <div className="text-center p-8 glass-card max-w-md">
          <div className="text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Failed to Load Document
          </h3>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-dark-bg">
      {/* Zoom controls */}
      <div className="flex items-center justify-center space-x-3 p-3 glass-card border-b border-dark-border bg-dark-elevated">
        <button
          onClick={handleZoomOut}
          className="px-4 py-2 glass-button rounded-lg text-sm font-medium transition hover:text-primary-400 hover:bg-dark-surface"
          disabled={scale <= 0.5}
        >
          −
        </button>
        <span className="text-sm text-gray-300 min-w-[70px] text-center font-medium">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="px-4 py-2 glass-button rounded-lg text-sm font-medium transition hover:text-primary-400 hover:bg-dark-surface"
          disabled={scale >= 3}
        >
          +
        </button>
      </div>

      {/* PDF Canvas Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gradient-to-b from-dark-bg to-dark-surface"
      >
        <div className="min-h-full flex items-center justify-center p-6">
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-lg bg-white"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </div>
      </div>
    </div>
  )
}
