'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use CDN for PDF.js worker to avoid Vercel deployment issues
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
}

interface PdfViewerInnerProps {
  url: string
  page: number
  onLoadSuccess: (totalPages: number) => void
}

export default function PdfViewerInner({ url, page, onLoadSuccess }: PdfViewerInnerProps) {
  const [error, setError] = useState(false)

  return (
    <div className="flex justify-center p-4 min-h-full bg-elevated">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
        onLoadError={() => setError(true)}
        loading={
          <div className="flex items-center justify-center p-8">
            <div className="spinner"></div>
          </div>
        }
        error={
          <div className="text-error text-center p-8">
            Error loading PDF. Please try again.
          </div>
        }
      >
        <Page
          pageNumber={page}
          renderTextLayer={true}
          renderAnnotationLayer={false}
          className="shadow-md"
        />
      </Document>
    </div>
  )
}
