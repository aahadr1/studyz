'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

// Worker local, même version que react-pdf (5.4.296)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type PdfPagerProps = {
  fileUrl: string
}

export default function PdfPager({ fileUrl }: PdfPagerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setPageNumber(1)
  }

  function goToPrevPage() {
    setPageNumber((p) => Math.max(1, p - 1))
  }

  function goToNextPage() {
    setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-4 p-3 bg-dark-elevated border-b border-dark-border">
        <button 
          onClick={goToPrevPage} 
          disabled={pageNumber <= 1}
          className="px-4 py-2 glass-button rounded-lg disabled:opacity-30"
        >
          ◀ Prev
        </button>
        <span className="text-gray-300 min-w-[100px] text-center">
          Page {pageNumber} / {numPages ?? '…'}
        </span>
        <button 
          onClick={goToNextPage} 
          disabled={!!numPages && pageNumber >= numPages}
          className="px-4 py-2 glass-button rounded-lg disabled:opacity-30"
        >
          Next ▶
        </button>
      </div>

      {/* PDF Display */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-dark-surface">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
            </div>
          }
          error={
            <div className="text-red-400 p-4">Failed to load PDF</div>
          }
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-xl"
          />
        </Document>
      </div>
    </div>
  )
}