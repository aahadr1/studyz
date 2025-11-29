'use client'

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PdfPagerProps {
  url: string
  onPageChange?: (page: number, totalPages: number) => void
  onPageRender?: (canvas: HTMLCanvasElement | null) => void
}

export default function PdfPager({ url, onPageChange, onPageRender }: PdfPagerProps) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Notify parent when page changes
  useEffect(() => {
    if (numPages > 0) {
      onPageChange?.(page, numPages)
    }
  }, [page, numPages, onPageChange])

  const handlePageRender = () => {
    // Find the canvas rendered by react-pdf
    const container = document.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement
    canvasRef.current = container
    onPageRender?.(container)
  }

  const goToPrev = () => setPage(p => Math.max(1, p - 1))
  const goToNext = () => setPage(p => Math.min(numPages, p + 1))

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      <div className="flex items-center justify-center gap-4 p-3 border-b border-neutral-700">
        <button 
          onClick={goToPrev} 
          disabled={page <= 1}
          className="px-4 py-2 bg-neutral-800 rounded disabled:opacity-30 text-white"
        >
          ◀
        </button>
        <span className="text-white min-w-[100px] text-center">
          {page} / {numPages || '...'}
        </span>
        <button 
          onClick={goToNext} 
          disabled={page >= numPages}
          className="px-4 py-2 bg-neutral-800 rounded disabled:opacity-30 text-white"
        >
          ▶
        </button>
      </div>

      <div className="flex-1 overflow-auto flex justify-center p-4 bg-neutral-800">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="text-white">Loading...</div>}
          error={<div className="text-red-400">Error loading PDF</div>}
        >
          <Page 
            pageNumber={page} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
            onRenderSuccess={handlePageRender}
          />
        </Document>
      </div>
    </div>
  )
}