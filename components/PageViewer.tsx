'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const PdfPager = dynamic(() => import('./PdfPager'), { ssr: false })

interface PageViewerProps {
  documentId: string
}

export default function PageViewer({ documentId }: PageViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadUrl = async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/signed-url`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Failed to load document')
        const data = await res.json()
        setPdfUrl(data.signedUrl)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadUrl()
  }, [documentId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !pdfUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="text-center p-6">
          <p className="text-red-400 mb-4">{error || 'Failed to load'}</p>
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

  return <PdfPager fileUrl={pdfUrl} />
}