'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { FiZoomIn, FiZoomOut, FiRotateCw, FiDownload, FiMaximize2, FiMinimize2, FiRefreshCw } from 'react-icons/fi'

interface DocumentViewerSmartProps {
  documentId: string
  currentPage: number
  onTotalPagesChange: (total: number) => void
  onPageContentReady?: (getContent: () => Promise<string | null>) => void
  className?: string
}

interface DocumentData {
  signedUrl: string
  fileName: string
  fileType: string
  pageCount: number
}

export default function DocumentViewerSmart({
  documentId,
  currentPage,
  onTotalPagesChange,
  onPageContentReady,
  className = '',
}: DocumentViewerSmartProps) {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.2)
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [pageText, setPageText] = useState<string>('')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<any>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load document data and PDF.js
  useEffect(() => {
    let cancelled = false
    let pdfjsLib: any = null

    const loadDocument = async () => {
      try {
        setLoading(true)
        setError(null)

        console.log('📄 Loading document:', documentId)

        // Get signed URL
        const response = await fetch(`/api/documents/${documentId}/signed-url`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          let errorData
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
          }
          throw new Error(errorData.error || 'Failed to load document')
        }

        const data = await response.json()
        if (cancelled) return

        console.log('✅ Got signed URL:', data.fileName)
        setDocumentData(data)

        // Load PDF.js
        try {
          pdfjsLib = await import('pdfjs-dist')
          
          // Use unpkg CDN worker for better compatibility
          const version = pdfjsLib.version || '3.11.174'
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`
          
          if (cancelled) return

          console.log('📄 Loading PDF with PDF.js...')
          
          // Load PDF document
          const loadingTask = pdfjsLib.getDocument({
            url: data.signedUrl,
            withCredentials: false,
          })
          
          const pdf = await loadingTask.promise
          if (cancelled) return

          console.log('✅ PDF loaded successfully, pages:', pdf.numPages)
          setPdfDoc(pdf)
          onTotalPagesChange(pdf.numPages)
          setLoading(false)

        } catch (pdfError) {
          console.error('❌ PDF.js loading failed:', pdfError)
          throw new Error('Failed to load PDF with PDF.js. Please try refreshing the page.')
        }

      } catch (err: any) {
        if (cancelled) return
        console.error('❌ Document loading error:', err)
        setError(err.message || 'Failed to load document')
        setLoading(false)
        
        // Auto-retry once after 3 seconds
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null
            loadDocument()
          }, 3000)
        }
      }
    }

    loadDocument()

    return () => {
      cancelled = true
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
      }
    }
  }, [documentId, onTotalPagesChange])

  // Extract text content from current page
  const extractPageText = useCallback(async (pageNum: number): Promise<string> => {
    if (!pdfDoc) return ''

    try {
      const page = await pdfDoc.getPage(pageNum)
      const textContent = await page.getTextContent()
      const textItems = textContent.items.map((item: any) => item.str).join(' ')
      return textItems.trim()
    } catch (error) {
      console.error('Error extracting page text:', error)
      return ''
    }
  }, [pdfDoc])

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || rendering) {
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

        console.log('🎨 Rendering page:', currentPage)

        const page = await pdfDoc.getPage(currentPage)
        
        // Calculate responsive scale
        const containerWidth = container.clientWidth
        const pageViewport = page.getViewport({ scale: 1.0, rotation })
        const autoScale = Math.min(
          (containerWidth - 40) / pageViewport.width,
          (window.innerHeight * 0.7) / pageViewport.height
        )
        
        // Apply both auto-scale and user zoom
        const finalScale = autoScale * scale
        const viewport = page.getViewport({ scale: finalScale, rotation })
        
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return

        canvas.height = viewport.height
        canvas.width = viewport.width

        // Clear canvas with white background
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          enableWebGL: false, // More compatible
        }

        const renderTask = page.render(renderContext)
        renderTaskRef.current = renderTask

        await renderTask.promise
        
        console.log('✅ Page', currentPage, 'rendered successfully')

        // Extract text content for AI assistant
        const text = await extractPageText(currentPage)
        setPageText(text)
        
        renderTaskRef.current = null
        setRendering(false)

      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('❌ Error rendering page:', err)
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
  }, [pdfDoc, currentPage, scale, rotation, rendering, extractPageText])

  // Setup content capture for AI assistant
  useEffect(() => {
    if (!onPageContentReady) return

    const captureContent = async (): Promise<string | null> => {
      try {
        // Return actual page text content for AI
        const content = pageText || await extractPageText(currentPage)
        console.log('📝 AI content captured for page', currentPage, '- length:', content.length)
        return content || `Page ${currentPage} of ${documentData?.fileName || 'document'}`
      } catch (err) {
        console.error('❌ Content capture failed:', err)
        return `Page ${currentPage} of ${documentData?.fileName || 'document'}`
      }
    }

    onPageContentReady(captureContent)
  }, [onPageContentReady, pageText, currentPage, extractPageText, documentData])

  const handleZoomIn = () => setScale(prev => Math.min(3.0, prev + 0.2))
  const handleZoomOut = () => setScale(prev => Math.max(0.5, prev - 0.2))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)
  const handleRetry = () => window.location.reload()

  const handleDownload = () => {
    if (documentData?.signedUrl) {
      const link = document.createElement('a')
      link.href = documentData.signedUrl
      link.download = documentData.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-dark-bg ${className}`}>
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-2 border-accent-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400 mb-2">Loading PDF viewer...</p>
          <p className="text-xs text-gray-500">Initializing PDF.js engine</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-dark-bg p-6 ${className}`}>
        <div className="text-center p-6 glass-card max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiRefreshCw className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Document</h3>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <div className="space-y-2">
            <button
              onClick={handleRetry}
              className="w-full px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition"
            >
              Reload Page
            </button>
            <p className="text-xs text-gray-500">
              PDF.js engine failed to initialize. Try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!documentData || !pdfDoc) {
    return (
      <div className={`flex items-center justify-center bg-dark-bg ${className}`}>
        <p className="text-gray-400">No document available</p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col bg-dark-bg ${isFullscreen ? 'fixed inset-0 z-50' : className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-dark-elevated border-b border-dark-border">
        <div className="flex items-center space-x-1">
          <button
            onClick={handleZoomOut}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            disabled={scale <= 0.5}
            title="Zoom out"
          >
            <FiZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-300 min-w-[70px] text-center px-2">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            disabled={scale >= 3.0}
            title="Zoom in"
          >
            <FiZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-dark-border mx-2"></div>
          <button
            onClick={handleRotate}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            title="Rotate 90°"
          >
            <FiRotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center space-x-1">
          {rendering && (
            <div className="flex items-center space-x-2 mr-3">
              <div className="w-3 h-3 border border-accent-purple border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-gray-400">Rendering...</span>
            </div>
          )}
          <button
            onClick={handleDownload}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            title="Download PDF"
          >
            <FiDownload className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <FiMinimize2 className="w-4 h-4" /> : <FiMaximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Canvas Display */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-auto bg-gradient-to-b from-dark-surface to-dark-bg p-4"
      >
        <div className="flex items-center justify-center min-h-full">
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-lg bg-white max-w-full"
            style={{ height: 'auto' }}
          />
        </div>
      </div>

      {/* Document Info */}
      <div className="px-4 py-2 bg-dark-elevated border-t border-dark-border">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400 truncate flex-1 mr-4">
            <span className="font-medium">{documentData.fileName}</span>
            {pageText && (
              <span className="text-xs text-gray-500 ml-2">
                • {pageText.length} chars extracted
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 whitespace-nowrap">
            Page {currentPage} of {documentData.pageCount || 1}
          </div>
        </div>
      </div>
    </div>
  )
}
