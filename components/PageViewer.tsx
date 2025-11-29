'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { FiZoomIn, FiZoomOut, FiAlertCircle, FiRefreshCw } from 'react-icons/fi'

interface PageViewerProps {
  documentId: string
  currentPage: number
  onTotalPagesChange: (total: number) => void
  onPageImageReady?: (getImageDataUrl: () => Promise<string | null>) => void
}

export default function PageViewer({
  documentId,
  currentPage,
  onTotalPagesChange,
  onPageImageReady,
}: PageViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1.0)
  const [isRendering, setIsRendering] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const currentPageImageRef = useRef<string | null>(null)

  // Load PDF document
  useEffect(() => {
    let cancelled = false

    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get signed URL
        const response = await fetch(`/api/documents/${documentId}/signed-url`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to load document')
        }

        const data = await response.json()
        if (cancelled) return

        // Load PDF.js
        const pdfjsLib = await import('pdfjs-dist')
        
        // Set worker from CDN
        const version = pdfjsLib.version || '3.11.174'
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`

        if (cancelled) return

        // Load the PDF
        const loadingTask = pdfjsLib.getDocument({
          url: data.signedUrl,
          withCredentials: false,
          isEvalSupported: false,
        })

        const pdf = await loadingTask.promise
        if (cancelled) return

        setPdfDoc(pdf)
        onTotalPagesChange(pdf.numPages)
        setLoading(false)

      } catch (err: any) {
        if (cancelled) return
        console.error('Error loading PDF:', err)
        setError(err.message || 'Failed to load document')
        setLoading(false)
      }
    }

    loadPDF()

    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
      }
    }
  }, [documentId, onTotalPagesChange])

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || isRendering) return

    const renderPage = async () => {
      setIsRendering(true)

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
        if (!canvas || !container) {
          setIsRendering(false)
          return
        }

        const page = await pdfDoc.getPage(currentPage)
        
        // Calculate scale to fit container
        const containerWidth = container.clientWidth - 48 // Padding
        const containerHeight = container.clientHeight - 48
        const pageViewport = page.getViewport({ scale: 1.0 })
        
        // Fit to container while maintaining aspect ratio
        const scaleX = containerWidth / pageViewport.width
        const scaleY = containerHeight / pageViewport.height
        const baseScale = Math.min(scaleX, scaleY, 2) // Cap at 2x for quality
        
        // Apply zoom
        const finalScale = baseScale * zoom
        const viewport = page.getViewport({ scale: finalScale })

        const context = canvas.getContext('2d', { alpha: false })
        if (!context) {
          setIsRendering(false)
          return
        }

        // Set canvas dimensions
        canvas.width = viewport.width
        canvas.height = viewport.height

        // Clear and set white background
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        // Render the page
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        })
        renderTaskRef.current = renderTask

        await renderTask.promise

        // Convert to image URL for display and AI
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92)
        setPageImageUrl(imageDataUrl)
        currentPageImageRef.current = imageDataUrl

        renderTaskRef.current = null
        setIsRendering(false)

      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
        }
        setIsRendering(false)
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
  }, [pdfDoc, currentPage, zoom, isRendering])

  // Expose image capture function to parent
  const getPageImageDataUrl = useCallback(async (): Promise<string | null> => {
    return currentPageImageRef.current
  }, [])

  useEffect(() => {
    if (onPageImageReady && pdfDoc) {
      onPageImageReady(getPageImageDataUrl)
    }
  }, [onPageImageReady, pdfDoc, getPageImageDataUrl])

  const handleZoomIn = () => setZoom(prev => Math.min(2.5, prev + 0.25))
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.25))
  const handleRetry = () => window.location.reload()

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-accent-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading document...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg p-6">
        <div className="text-center p-6 glass-card max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiAlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Document</h3>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition"
          >
            <FiRefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
      {/* Zoom Controls */}
      <div className="flex items-center justify-center space-x-3 p-3 bg-dark-elevated border-b border-dark-border">
        <button
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          className="p-2 glass-button rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:text-primary-400 transition"
          title="Zoom out"
        >
          <FiZoomOut className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-300 min-w-[60px] text-center font-medium">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          disabled={zoom >= 2.5}
          className="p-2 glass-button rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:text-primary-400 transition"
          title="Zoom in"
        >
          <FiZoomIn className="w-4 h-4" />
        </button>
        
        {isRendering && (
          <div className="flex items-center space-x-2 ml-4">
            <div className="w-3 h-3 border border-accent-purple border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-gray-500">Rendering...</span>
          </div>
        )}
      </div>

      {/* Page Display */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gradient-to-b from-dark-surface to-dark-bg"
      >
        <div className="min-h-full flex items-center justify-center p-6">
          {/* Hidden canvas for rendering */}
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Display the rendered page as an image */}
          {pageImageUrl ? (
            <img
              src={pageImageUrl}
              alt={`Page ${currentPage}`}
              className="shadow-2xl rounded-lg max-w-full max-h-full object-contain"
              style={{ background: '#ffffff' }}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

