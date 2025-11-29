'use client'

import { useEffect, useState, useRef } from 'react'
import { FiZoomIn, FiZoomOut, FiMaximize2, FiMinimize2 } from 'react-icons/fi'

interface PDFViewerV2Props {
  documentId: string
  currentPage: number
  onTotalPagesChange: (total: number) => void
  onCanvasRefReady?: (getImage: () => Promise<string | null>) => void
}

export default function PDFViewerV2({
  documentId,
  currentPage,
  onTotalPagesChange,
  onCanvasRefReady,
}: PDFViewerV2Props) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [signedUrl, setSignedUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.5)
  const [rendering, setRendering] = useState(false)
  const [viewMode, setViewMode] = useState<'canvas' | 'iframe'>('canvas')
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const renderTaskRef = useRef<any>(null)

  // Load PDF document and signed URL
  useEffect(() => {
    let cancelled = false
    let pdfjsLib: any = null

    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        console.log('📄 Fetching document:', documentId)

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

        console.log('✅ Got signed URL:', data.fileName)
        setSignedUrl(data.signedUrl)

        // Try to load with PDF.js for canvas rendering
        try {
          pdfjsLib = await import('pdfjs-dist')
          
          // Use CDN worker (most reliable)
          const version = pdfjsLib.version || '3.11.174'
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`
          
          if (cancelled) return

          const loadingTask = pdfjsLib.getDocument({
            url: data.signedUrl,
            withCredentials: false,
            isEvalSupported: false,
          })
          
          const pdf = await loadingTask.promise
          if (cancelled) return

          console.log('✅ PDF loaded successfully, pages:', pdf.numPages)
          setPdfDoc(pdf)
          onTotalPagesChange(pdf.numPages)
          setViewMode('canvas')
          
        } catch (pdfError) {
          console.warn('⚠️ PDF.js loading failed, falling back to iframe:', pdfError)
          // Fallback to iframe view
          setViewMode('iframe')
          // Estimate page count from metadata or set default
          onTotalPagesChange(data.pageCount || 1)
        }

        setLoading(false)

      } catch (err: any) {
        if (cancelled) return
        console.error('❌ Error loading document:', err)
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

  // Render current page on canvas
  useEffect(() => {
    if (viewMode !== 'canvas' || !pdfDoc || !canvasRef.current || rendering) {
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
        if (!canvas || !container || !pdfDoc) return

        const page = await pdfDoc.getPage(currentPage)
        const viewport = page.getViewport({ scale })
        
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return

        canvas.height = viewport.height
        canvas.width = viewport.width

        // Clear canvas
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          enableWebGL: true,
        }

        const renderTask = page.render(renderContext)
        renderTaskRef.current = renderTask

        await renderTask.promise
        
        console.log('✅ Page', currentPage, 'rendered')
        renderTaskRef.current = null
        setRendering(false)

      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
        }
        setRendering(false)
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
  }, [pdfDoc, currentPage, scale, rendering, viewMode])

  // Capture canvas for AI
  useEffect(() => {
    if (!onCanvasRefReady || !pdfDoc || viewMode !== 'canvas') return

    const captureCanvas = async (): Promise<string | null> => {
      if (!canvasRef.current) return null
      try {
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.92)
        console.log('✅ Captured page image')
        return dataUrl
      } catch (err) {
        console.error('❌ Failed to capture:', err)
        return null
      }
    }

    onCanvasRefReady(captureCanvas)
  }, [onCanvasRefReady, pdfDoc, viewMode])

  const handleZoomIn = () => setScale(prev => Math.min(3, prev + 0.25))
  const handleZoomOut = () => setScale(prev => Math.max(0.5, prev - 0.25))
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)
  const switchToCanvas = () => setViewMode('canvas')
  const switchToIframe = () => setViewMode('iframe')

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
          <h3 className="text-lg font-semibold text-white mb-2">Failed to Load</h3>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full w-full bg-dark-bg ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 glass-card border-b border-dark-border bg-dark-elevated">
        <div className="flex items-center space-x-2">
          {pdfDoc && (
            <>
              <button
                onClick={handleZoomOut}
                className="px-3 py-2 glass-button rounded-lg text-sm font-medium transition hover:text-primary-400"
                disabled={scale <= 0.5}
                title="Zoom out"
              >
                <FiZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-300 min-w-[60px] text-center font-medium">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="px-3 py-2 glass-button rounded-lg text-sm font-medium transition hover:text-primary-400"
                disabled={scale >= 3}
                title="Zoom in"
              >
                <FiZoomIn className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* View mode toggle */}
          {pdfDoc && signedUrl && (
            <div className="flex items-center space-x-1 bg-dark-surface rounded-lg p-1">
              <button
                onClick={switchToCanvas}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  viewMode === 'canvas' ? 'bg-accent-purple text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Canvas
              </button>
              <button
                onClick={switchToIframe}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  viewMode === 'iframe' ? 'bg-accent-purple text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Native
              </button>
            </div>
          )}

          <button
            onClick={toggleFullscreen}
            className="px-3 py-2 glass-button rounded-lg text-sm transition hover:text-primary-400"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <FiMinimize2 className="w-4 h-4" /> : <FiMaximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* PDF Display */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gradient-to-b from-dark-bg to-dark-surface">
        {viewMode === 'canvas' && pdfDoc ? (
          <div className="min-h-full flex items-start justify-center p-6">
            <canvas
              ref={canvasRef}
              className="shadow-2xl rounded-lg bg-white max-w-full"
              style={{ height: 'auto' }}
            />
          </div>
        ) : signedUrl ? (
          <iframe
            ref={iframeRef}
            src={`${signedUrl}#page=${currentPage}`}
            className="w-full h-full border-0"
            title="PDF Document"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">No preview available</p>
          </div>
        )}
      </div>
    </div>
  )
}

