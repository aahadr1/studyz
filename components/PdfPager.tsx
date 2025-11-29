'use client'

import { useEffect, useState, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// Use matching worker version from CDN (v5+ uses .mjs module format)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

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
  const pdfRef = useRef<any>(null)

  const onLoadSuccess = (pdf: any) => {
    pdfRef.current = pdf
    setNumPages(pdf.numPages)
    setPage(Math.min(Math.max(1, initialPage), pdf.numPages))
    setLoading(false)
    onTotalPagesChange?.(pdf.numPages)
    extractText(pdf, initialPage)
  }

  const onLoadError = (err: any) => {
    console.error('PDF error:', err)
    setError('Failed to load PDF')
    setLoading(false)
  }

  const extractText = async (pdf: any, pageNum: number) => {
    if (!onTextExtracted || !pdf) return
    try {
      console.log('📄 Extracting text from page', pageNum)
      const p = await pdf.getPage(pageNum)
      const tc = await p.getTextContent()
      const text = tc.items
        .map((i: any) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      console.log('✅ Extracted text:', text.length, 'characters')
      onTextExtracted(text)
    } catch (e) {
      console.error('❌ Text extraction error:', e)
      onTextExtracted('') // Fallback to empty text
    }
  }

  const goToPage = (p: number) => {
    const newPage = Math.min(Math.max(1, p), numPages)
    setPage(newPage)
    onPageChange?.(newPage)
    if (pdfRef.current) extractText(pdfRef.current, newPage)
  }

  // Sync with external page changes
  useEffect(() => {
    if (initialPage !== page && initialPage >= 1 && initialPage <= numPages) {
      goToPage(initialPage)
    }
  }, [initialPage, numPages, page])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && page < numPages) goToPage(page + 1)
      if (e.key === 'ArrowLeft' && page > 1) goToPage(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages, page])

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="text-center p-6">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-accent-purple text-white rounded-lg">
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
        <button onClick={() => goToPage(page - 1)} disabled={page <= 1} className="px-3 py-1 glass-button rounded disabled:opacity-30">
          ◀
        </button>
        <span className="text-gray-300 text-sm min-w-[80px] text-center">
          {loading ? '...' : `${page} / ${numPages}`}
        </span>
        <button onClick={() => goToPage(page + 1)} disabled={page >= numPages} className="px-3 py-1 glass-button rounded disabled:opacity-30">
          ▶
        </button>
        <div className="w-px h-6 bg-dark-border mx-2" />
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="px-2 py-1 glass-button rounded">−</button>
        <button onClick={() => setScale(1)} className="px-2 py-1 glass-button rounded text-xs">100%</button>
        <button onClick={() => setScale(s => Math.min(2.5, s + 0.2))} className="px-2 py-1 glass-button rounded">+</button>
      </div>

      {/* PDF */}
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
