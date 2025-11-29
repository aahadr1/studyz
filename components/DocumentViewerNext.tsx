'use client'

import { useEffect, useState, useRef } from 'react'
import { FiZoomIn, FiZoomOut, FiRotateCw, FiDownload, FiMaximize2, FiMinimize2, FiRefreshCw } from 'react-icons/fi'

interface DocumentViewerNextProps {
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

export default function DocumentViewerNext({
  documentId,
  currentPage,
  onTotalPagesChange,
  onPageContentReady,
  className = '',
}: DocumentViewerNextProps) {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'embed' | 'iframe'>('embed')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<HTMLEmbedElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load document data
  useEffect(() => {
    let cancelled = false

    const loadDocument = async () => {
      try {
        setLoading(true)
        setError(null)

        console.log('📄 Loading document:', documentId)

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

        console.log('✅ Document loaded:', data.fileName)
        
        setDocumentData(data)
        onTotalPagesChange(data.pageCount || 1)
        setLoading(false)

      } catch (err: any) {
        if (cancelled) return
        console.error('❌ Document loading error:', err)
        setError(err.message || 'Failed to load document')
        setLoading(false)
        
        // Auto-retry once after 2 seconds
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null
            loadDocument()
          }, 2000)
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
    }
  }, [documentId, onTotalPagesChange])

  // Setup content capture for AI
  useEffect(() => {
    if (!onPageContentReady || !documentData) return

    const captureContent = async (): Promise<string | null> => {
      try {
        // For now, return document info - in future could extract text
        return `Document: ${documentData.fileName} (Page ${currentPage})`
      } catch (err) {
        console.error('❌ Content capture failed:', err)
        return null
      }
    }

    onPageContentReady(captureContent)
  }, [onPageContentReady, documentData, currentPage])

  const handleZoomIn = () => setScale(prev => Math.min(2.0, prev + 0.1))
  const handleZoomOut = () => setScale(prev => Math.max(0.5, prev - 0.1))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)
  const handleRetry = () => window.location.reload()
  const switchViewMode = () => setViewMode(prev => prev === 'embed' ? 'iframe' : 'embed')

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
          <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading document...</p>
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
              Retry Loading
            </button>
            <p className="text-xs text-gray-500">
              If the problem persists, try refreshing the page or contact support.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!documentData) {
    return (
      <div className={`flex items-center justify-center bg-dark-bg ${className}`}>
        <p className="text-gray-400">No document data available</p>
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
          <span className="text-sm text-gray-300 min-w-[60px] text-center px-2">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            disabled={scale >= 2.0}
            title="Zoom in"
          >
            <FiZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-dark-border mx-2"></div>
          <button
            onClick={handleRotate}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            title="Rotate"
          >
            <FiRotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={switchViewMode}
            className="px-3 py-2 text-xs font-medium glass-button rounded-lg hover:bg-dark-surface transition"
            title="Switch view mode"
          >
            {viewMode.toUpperCase()}
          </button>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={handleDownload}
            className="p-2 glass-button rounded-lg hover:bg-dark-surface transition"
            title="Download"
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

      {/* Document Display */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden bg-dark-surface"
        style={{
          transform: `scale(${scale}) rotate(${rotation}deg)`,
          transformOrigin: 'center',
        }}
      >
        {viewMode === 'embed' ? (
          <embed
            ref={embedRef}
            src={`${documentData.signedUrl}#page=${currentPage}&zoom=${Math.round(scale * 100)}`}
            type="application/pdf"
            className="w-full h-full border-0"
            title={documentData.fileName}
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={`${documentData.signedUrl}#page=${currentPage}&zoom=${Math.round(scale * 100)}`}
            className="w-full h-full border-0"
            title={documentData.fileName}
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>

      {/* Document Info */}
      <div className="px-3 py-2 bg-dark-elevated border-t border-dark-border">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400 truncate">
            {documentData.fileName}
          </div>
          <div className="text-xs text-gray-500">
            Page {currentPage} of {documentData.pageCount || 1}
          </div>
        </div>
      </div>
    </div>
  )
}
