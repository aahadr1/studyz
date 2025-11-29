'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues
const PdfPager = dynamic(() => import('./PdfPager'), { ssr: false })

interface PageViewerProps {
  documentId: string
  currentPage: number
  onTotalPagesChange: (total: number) => void
  onPageTextReady?: (getText: () => Promise<string | null>) => void
}

export default function PageViewer({
  documentId,
  currentPage,
  onTotalPagesChange,
  onPageTextReady,
}: PageViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [pageText, setPageText] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get signed URL
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/signed-url`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Failed to load document')
        const data = await res.json()
        setSignedUrl(data.signedUrl)
        if (data.pageCount) onTotalPagesChange(data.pageCount)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [documentId, onTotalPagesChange])

  // Provide text to AI
  const getText = useCallback(async () => pageText || null, [pageText])

  useEffect(() => {
    if (onPageTextReady) {
      onPageTextReady(getText)
    }
  }, [onPageTextReady, getText])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !signedUrl) {
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

  return (
    <PdfPager
      src={signedUrl}
      initialPage={currentPage}
      onTotalPagesChange={onTotalPagesChange}
      onTextExtracted={setPageText}
    />
  )
}
