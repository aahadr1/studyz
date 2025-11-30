'use client'

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface SimplePdfViewerProps {
  url: string
  onPageChange?: (page: number, totalPages: number) => void
  onCanvasReady?: (getImage: () => string | null) => void
}

export default function SimplePdfViewer({ url, onPageChange, onCanvasReady }: SimplePdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (numPages > 0) {
      onPageChange?.(page, numPages)
    }
  }, [page, numPages, onPageChange])

  useEffect(() => {
    if (onCanvasReady) {
      onCanvasReady(() => {
        if (canvasRef.current) {
          try {
            return canvasRef.current.toDataURL('image/jpeg', 0.8)
          } catch (e) {
            console.error('Failed to capture canvas:', e)
            return null
          }
        }
        return null
      })
    }
  }, [onCanvasReady])

  const handlePageRender = () => {
    const container = document.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement
    canvasRef.current = container
  }

  const goToPrev = () => setPage(p => Math.max(1, p - 1))
  const goToNext = () => setPage(p => Math.min(numPages, p + 1))

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-center gap-4 py-3 border-b border-border">
        <button 
          onClick={goToPrev} 
          disabled={page <= 1}
          className="btn-ghost p-2 disabled:opacity-30"
        >
          <FiChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm text-text-primary min-w-[100px] text-center">
          Page {page} / {numPages || '...'}
        </span>
        <button 
          onClick={goToNext} 
          disabled={page >= numPages}
          className="btn-ghost p-2 disabled:opacity-30"
        >
          <FiChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto flex justify-center p-4 bg-elevated">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="flex items-center justify-center p-8">
              <div className="spinner"></div>
            </div>
          }
          error={<div className="text-error">Error loading PDF</div>}
        >
          <Page 
            pageNumber={page} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
            onRenderSuccess={handlePageRender}
            className="shadow-md"
          />
        </Document>
      </div>
    </div>
  )
}
