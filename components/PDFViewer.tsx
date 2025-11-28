'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface PDFViewerProps {
  documentId: string
  filePath: string
  currentPage: number
  onPageChange: (page: number) => void
  totalPages: number
  onTotalPagesChange: (total: number) => void
  onCanvasRefReady?: (getImage: () => Promise<string | null>) => void
}

export default function PDFViewer(props: PDFViewerProps) {
  const documentId = props.documentId
  const filePath = props.filePath
  const currentPage = props.currentPage
  const onPageChange = props.onPageChange
  const totalPages = props.totalPages
  const onTotalPagesChange = props.onTotalPagesChange
  const onCanvasRefReady = props.onCanvasRefReady

  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.5)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Load PDF document
  useEffect(function() {
    if (!filePath) {
      return
    }

    const loadPDF = async function() {
      try {
        setLoading(true)
        setError(null)

        // Get signed URL for the PDF
        const result = await supabase.storage
          .from('documents')
          .createSignedUrl(filePath, 3600)

        if (result.error || !result.data || !result.data.signedUrl) {
          console.error('Error getting signed URL:', result.error)
          throw new Error('Could not get document URL')
        }

        const signedUrl = result.data.signedUrl

        // Dynamically import PDF.js
        const pdfjsLib = await import('pdfjs-dist')
        
        // Set worker with explicit version
        const pdfVersion = pdfjsLib.version || '3.11.174'
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + pdfVersion + '/pdf.worker.min.js'

        // Load the PDF
        const loadingTask = pdfjsLib.getDocument({
          url: signedUrl,
          withCredentials: false,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + pdfVersion + '/cmaps/',
          cMapPacked: true,
        })
        
        const pdf = await loadingTask.promise

        setPdfDoc(pdf)
        onTotalPagesChange(pdf.numPages)
        setLoading(false)
      } catch (err: any) {
        console.error('Error loading PDF:', err)
        setError(err.message || 'Failed to load PDF')
        setLoading(false)
      }
    }

    loadPDF()
  }, [filePath, onTotalPagesChange])

  // Render current page
  useEffect(function() {
    if (!pdfDoc || !canvasRef.current) {
      return
    }

    const renderPage = async function() {
      try {
        const page = await pdfDoc.getPage(currentPage)
        const viewport = page.getViewport({ scale: scale })

        const canvas = canvasRef.current
        if (!canvas) {
          return
        }

        const context = canvas.getContext('2d')
        if (!context) {
          return
        }

        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }

        const renderTask = page.render(renderContext)
        await renderTask.promise
      } catch (err: any) {
        console.error('Error rendering page:', err)
      }
    }

    renderPage()
  }, [pdfDoc, currentPage, scale])

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
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Zoom controls */}
      <div className="flex items-center justify-center space-x-2 p-2 glass-card border-b border-dark-border">
        <button
          onClick={function() { setScale(function(s) { return Math.max(0.5, s - 0.25) }) }}
          className="px-3 py-1 glass-button rounded text-sm font-medium transition hover:text-primary-400"
        >
          −
        </button>
        <span className="text-sm text-gray-300 min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={function() { setScale(function(s) { return Math.min(3, s + 0.25) }) }}
          className="px-3 py-1 glass-button rounded text-sm font-medium transition hover:text-primary-400"
        >
          +
        </button>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        <canvas
          ref={canvasRef}
          className="shadow-2xl bg-white"
        />
      </div>
    </div>
  )
}
