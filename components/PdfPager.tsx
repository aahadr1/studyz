'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export default function PdfPager({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      <div className="flex items-center justify-center gap-4 p-3 border-b border-neutral-700">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))} 
          disabled={page <= 1}
          className="px-4 py-2 bg-neutral-800 rounded disabled:opacity-30"
        >
          ◀
        </button>
        <span className="text-white min-w-[100px] text-center">
          {page} / {numPages || '...'}
        </span>
        <button 
          onClick={() => setPage(p => Math.min(numPages, p + 1))} 
          disabled={page >= numPages}
          className="px-4 py-2 bg-neutral-800 rounded disabled:opacity-30"
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
          />
        </Document>
      </div>
    </div>
  )
}