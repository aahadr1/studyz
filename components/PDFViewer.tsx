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

export default function PDFViewer({
  documentId,
  filePath,
  currentPage,
  onPageChange,
  totalPages,
  onTotalPagesChange,
  onCanvasRefReady,
}: PDFViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.5)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Provide function to capture current page image
  // Update whenever page renders to ensure we always capture the current page
  useEffect(() => {
    if (onCanvasRefReady && canvasRef.current && pdfDoc) {
      const getImage = async (): Promise<string | null> => {
        if (!canvasRef.current) {
          console.warn('Canvas not available for image capture')
          return null
        }
        try {
          // Capture at high quality for GPT vision
          const imageData = canvasRef.current.toDataURL('image/jpeg', 0.95)
          console.log('✅ Page image captured successfully', {
            size: Math.round(imageData.length / 1024) + 'KB',
            page: currentPage
          })
          return imageData
        } catch (err) {
          console.error('❌ Error capturing page image:', err)
          return null
        }
      }
      onCanvasRefReady(getImage)
    }
  }, [onCanvasRefReady, pdfDoc, currentPage])

  // Load PDF document
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get a signed URL for the PDF (valid for 1 hour)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(filePath, 3600) // 1 hour expiry

        if (urlError || !urlData?.signedUrl) {
          console.error('Error getting signed URL:', urlError)
          throw new Error('Could not get document URL')
        }

        // Dynamically import PDF.js
        const pdfjsLib = await import('pdfjs-dist')
        
        // Set worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

        // Load the PDF with CORS settings
        const loadingTask = pdfjsLib.getDocument({
          url: urlData.signedUrl,
          withCredentials: false,
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

    if (filePath) {
      loadPDF()
    }
  }, [filePath])

  // Render current page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return

      try {
        const page = await pdfDoc.getPage(currentPage)
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')

        if (!context) return

        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }

        await page.render(renderContext).promise
      } catch (err) {
        console.error('Error rendering page:', err)
      }
    }

    renderPage()
  }, [pdfDoc, currentPage, scale])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-200 max-w-md">
          <div className="text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Failed to Load Document
          </h3>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Zoom controls */}
      <div className="flex items-center justify-center space-x-2 p-2 bg-white border-b border-gray-200">
        <button
          onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition"
        >
          −
        </button>
        <span className="text-sm text-gray-600 min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.min(3, s + 0.25))}
          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition"
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

