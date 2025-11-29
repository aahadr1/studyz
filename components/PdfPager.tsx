'use client'

import { useEffect, useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// Set worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

interface PdfPagerProps {
  src: string
  initialPage?: number
  onPageChange?: (page: number) => void
  onTotalPagesChange?: (total: number) => void
  onTextExtracted?: (text: string) => void
}

export default function PdfPager({
  src,
  initialPage = 1,
  onPageChange,
  onTotalPagesChange,
  onTextExtracted,
}: PdfPagerProps) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [scale, setScale] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onLoadSuccess = useCallback((pdf: any) => {
    const total = pdf.numPages
    setNumPages(total)
    setPage(Math.min(Math.max(1, initialPage), total))
    setLoading(false)
    onTotalPagesChange?.(total)

    // Extract text for AI context
    pdf.getPage(initialPage).then((p: any) => {
      p.getTextContent().then((tc: any) => {
        const text = tc.items.map((i: any) => i.str).join(' ')
        onTextExtracted?.(text)
      })
    })
  }, [initialPage, onTotalPagesChange, onTextExtracted])

  const onLoadError = (err: any) => {
    console.error('PDF load error:', err)
    setError('Failed to load PDF')
    setLoading(false)
  }

  // Extract text when page changes
  useEffect(() => {
    if (!src || numPages === 0) return

    pdfjs.getDocument(src).promise.then((pdf) => {
      pdf.getPage(page).then((p) => {
        p.getTextContent().then((tc: any) => {
          const text = tc.items.map((i: any) => i.str).join(' ')
          onTextExtracted?.(text)
        })
      })
    }).catch(console.error)
  }, [src, page, numPages, onTextExtracted])

  const goToPage = (p: number) => {
    const newPage = Math.min(Math.max(1, p), numPages)
    setPage(newPage)
    onPageChange?.(newPage)
  }

  const next = () => goToPage(page + 1)
  const prev = () => goToPage(page - 1)

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages, page])

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="text-center p-6">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-accent-purple text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-dark-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-4 p-3 bg-dark-elevated border-b border-dark-border">
        <button
          onClick={prev}
          disabled={page <= 1}
          className="px-3 py-1 glass-button rounded disabled:opacity-30"
        >
          ◀
        </button>
        <span className="text-gray-300 text-sm min-w-[80px] text-center">
          {loading ? '...' : `${page} / ${numPages}`}
        </span>
        <button
          onClick={next}
          disabled={page >= numPages}
          className="px-3 py-1 glass-button rounded disabled:opacity-30"
        >
          ▶
        </button>
        <div className="w-px h-6 bg-dark-border mx-2" />
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="px-2 py-1 glass-button rounded">−</button>
        <button onClick={() => setScale(1)} className="px-2 py-1 glass-button rounded text-xs">100%</button>
        <button onClick={() => setScale(s => Math.min(2.5, s + 0.2))} className="px-2 py-1 glass-button rounded">+</button>
      </div>

      {/* PDF Page */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-gradient-to-b from-dark-surface to-dark-bg">
        <Document
          file={src}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          loading={
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          {numPages > 0 && (
            <Page
              pageNumber={page}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              className="shadow-xl rounded-lg overflow-hidden"
            />
          )}
        </Document>
      </div>
    </div>
  )
}

