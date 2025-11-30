'use client'

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

// Use CDN for PDF.js worker to avoid Vercel deployment issues
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
}

interface PdfPagerProps {
  url: string
  onPageChange?: (page: number, totalPages: number) => void
  onPageRender?: (canvas: HTMLCanvasElement | null) => void
}

export default function PdfPager({ url, onPageChange, onPageRender }: PdfPagerProps) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (numPages > 0) {
      onPageChange?.(page, numPages)
    }
  }, [page, numPages, onPageChange])

  const handlePageRender = () => {
    const container = document.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement
    canvasRef.current = container
    onPageRender?.(container)
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
