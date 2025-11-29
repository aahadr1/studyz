'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PdfViewerInnerProps {
  url: string
  page: number
  onLoadSuccess: (totalPages: number) => void
}

export default function PdfViewerInner({ url, page, onLoadSuccess }: PdfViewerInnerProps) {
  const [error, setError] = useState(false)

  return (
    <div className="flex justify-center p-4 min-h-full bg-neutral-800">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
        onLoadError={() => setError(true)}
        loading={
          <div className="flex items-center justify-center p-8">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }
        error={
          <div className="text-red-400 text-center p-8">
            Error loading PDF. Please try again.
          </div>
        }
      >
        <Page
          pageNumber={page}
          renderTextLayer={true}
          renderAnnotationLayer={false}
          className="shadow-xl"
        />
      </Document>
    </div>
  )
}

