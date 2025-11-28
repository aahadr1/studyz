'use client'

import { useEffect, useState, useRef } from 'react'

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

export default function PDFViewer(props: PDFViewerProps) {
  const documentId = props.documentId
  const currentPage = props.currentPage
  const onTotalPagesChange = props.onTotalPagesChange
  const onCanvasRefReady = props.onCanvasRefReady

  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)
  const [retryCount, setRetryCount] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const isRenderingRef = useRef<boolean>(false)

  // Monitor container width for responsive scaling
  useEffect(function() {
    if (!containerRef.current) {
      return
    }

    const updateContainerWidth = function() {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth
        setContainerWidth(width)
      }
    }

    // Initial measurement
    updateContainerWidth()

    // Listen for resize events
    window.addEventListener('resize', updateContainerWidth)

    return function() {
      window.removeEventListener('resize', updateContainerWidth)
    }
  }, [])

  // Register image capture function whenever canvas or page changes
  useEffect(function() {
    if (!onCanvasRefReady || !canvasRef.current || !pdfDoc) {
      return
    }

    const capturePageImage = async function(): Promise<string | null> {
      if (!canvasRef.current) {
        console.warn('⚠️ Canvas not available for capture')
        return null
      }

      try {
        // Capture at maximum quality for GPT Vision
        const imageDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95)
        const sizeKB = Math.round(imageDataUrl.length / 1024)
        console.log('✅ Page image captured: ' + sizeKB + 'KB for page ' + currentPage)
        return imageDataUrl
      } catch (err) {
        console.error('❌ Failed to capture page image:', err)
        return null
      }
    }

    // Register the capture function
    onCanvasRefReady(capturePageImage)
  }, [onCanvasRefReady, pdfDoc, currentPage, canvasRef.current])

  // Load PDF document via backend API
  useEffect(function() {
    if (!documentId) {
      return
    }

    let isCancelled = false

    const loadPDF = async function() {
      try {
        setLoading(true)
        setError(null)

        console.log('📄 Loading PDF for document:', documentId)

        // Get signed URL from our backend API
        const response = await fetch('/api/documents/' + documentId + '/signed-url', {
          method: 'GET',
          credentials: 'include',
        })

        if (!response.ok) {
          const errorData = await response.json().catch(function() {
            return { error: 'Failed to load document' }
          })
          throw new Error(errorData.error || 'Failed to get document URL')
        }

        const data: SignedUrlResponse = await response.json()

        if (isCancelled) return

        console.log('✅ Got signed URL for:', data.fileName)

        // Dynamically import PDF.js
        const pdfjsLib = await import('pdfjs-dist')
        
        // Set worker with explicit version
        const pdfVersion = pdfjsLib.version || '3.11.174'
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + pdfVersion + '/pdf.worker.min.js'

        if (isCancelled) return

        // Load the PDF
        const loadingTask = pdfjsLib.getDocument({
          url: data.signedUrl,
          withCredentials: false,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + pdfVersion + '/cmaps/',
          cMapPacked: true,
        })
        
        const pdf = await loadingTask.promise

        if (isCancelled) return

        console.log('✅ PDF loaded, pages:', pdf.numPages)

        setPdfDoc(pdf)
        onTotalPagesChange(pdf.numPages)
        setLoading(false)
        setRetryCount(0)
      } catch (err: any) {
        if (isCancelled) return

        console.error('❌ Error loading PDF:', err)
        
        // More descriptive error messages
        let errorMessage = err.message || 'Failed to load PDF'
        if (err.message && err.message.includes('Unauthorized')) {
          errorMessage = 'Please log in to view this document'
        } else if (err.message && err.message.includes('Access denied')) {
          errorMessage = 'You do not have access to this document'
        } else if (err.message && err.message.includes('not found')) {
          errorMessage = 'Document not found'
        }
        
        setError(errorMessage)
        setLoading(false)
      }
    }

    loadPDF()

    return function() {
      isCancelled = true
    }
  }, [documentId, onTotalPagesChange, retryCount])

  // Render current page
  useEffect(function() {
    if (!pdfDoc || !canvasRef.current || !containerWidth) {
      return
    }

    // Skip if already rendering
    if (isRenderingRef.current) {
      return
    }

    // Set flag to prevent concurrent renders
    isRenderingRef.current = true

    // Cancel any ongoing render task first
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel()
      } catch (e) {
        // Ignore cancel errors
      }
      renderTaskRef.current = null
    }

    const pageToRender = currentPage

    pdfDoc.getPage(pageToRender).then(function(page: any) {
      const canvas = canvasRef.current
      if (!canvas) {
        isRenderingRef.current = false
        return
      }

      // Calculate scale to fit the page width with some padding
      const pageViewport = page.getViewport({ scale: 1.0 })
      const padding = 32 // 16px on each side
      const availableWidth = containerWidth - padding
      const autoScale = availableWidth / pageViewport.width
      
      // Use the calculated auto scale, but respect manual zoom adjustments
      const finalScale = autoScale * scale
      
      const viewport = page.getViewport({ scale: finalScale })
      const context = canvas.getContext('2d')
      
      if (!context) {
        isRenderingRef.current = false
        return
      }

      canvas.height = viewport.height
      canvas.width = viewport.width

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }

      const renderTask = page.render(renderContext)
      renderTaskRef.current = renderTask

      renderTask.promise.then(function() {
        renderTaskRef.current = null
        isRenderingRef.current = false
        console.log('✅ Page rendered at scale:', finalScale.toFixed(2), 'width:', viewport.width + 'px')
      }).catch(function(err: any) {
        renderTaskRef.current = null
        isRenderingRef.current = false
        // Ignore cancellation errors
        if (err && err.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
        }
      })
    }).catch(function(err: any) {
      isRenderingRef.current = false
      console.error('Error getting page:', err)
    })

    // Cleanup function
    return function() {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        renderTaskRef.current = null
      }
      isRenderingRef.current = false
    }
  }, [pdfDoc, currentPage, scale, containerWidth])

  function handleRetry() {
    setRetryCount(function(c) { return c + 1 })
  }

  function handleZoomOut() {
    setScale(function(s) { return Math.max(0.5, s - 0.25) })
  }

  function handleZoomIn() {
    setScale(function(s) { return Math.min(3, s + 0.25) })
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
      <div className="flex items-center justify-center h-full bg-dark-bg">
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
      <div className="flex items-center justify-center space-x-2 p-2 glass-card border-b border-dark-border">
        <button
          onClick={handleZoomOut}
          className="px-3 py-1 glass-button rounded text-sm font-medium transition hover:text-primary-400"
        >
          −
        </button>
        <span className="text-sm text-gray-300 min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="px-3 py-1 glass-button rounded text-sm font-medium transition hover:text-primary-400"
        >
          +
        </button>
      </div>

      {/* PDF Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto flex items-start justify-center p-4 w-full"
      >
        <canvas
          ref={canvasRef}
          className="shadow-2xl bg-white max-w-full h-auto"
        />
      </div>
    </div>
  )
}
