'use client'

import { useEffect, useState } from 'react'
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi'

interface PageViewerProps {
  documentId: string
  currentPage: number
  onTotalPagesChange: (total: number) => void
  onPageImageReady?: (getImageDataUrl: () => Promise<string | null>) => void
}

export default function PageViewer({
  documentId,
  currentPage,
  onTotalPagesChange,
  onPageImageReady,
}: PageViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load signed URL
  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/documents/${documentId}/signed-url`, {
          credentials: 'include',
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load document')
        }

        const data = await response.json()
        setSignedUrl(data.signedUrl)
        onTotalPagesChange(data.pageCount || 1)
        setLoading(false)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    loadDocument()
  }, [documentId, onTotalPagesChange])

  // Provide page info to AI (the AI can use the signed URL directly)
  useEffect(() => {
    if (onPageImageReady && signedUrl) {
      onPageImageReady(async () => {
        // Return page info - AI will use vision on the actual document
        return `Document page ${currentPage}`
      })
    }
  }, [onPageImageReady, signedUrl, currentPage])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent-purple border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-400 text-sm">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error || !signedUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg p-6">
        <div className="text-center p-6 glass-card max-w-sm">
          <FiAlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-white font-medium mb-2">Failed to Load</h3>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent-purple text-white rounded-lg text-sm"
          >
            <FiRefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-dark-bg">
      <iframe
        src={`${signedUrl}#page=${currentPage}`}
        className="w-full h-full border-0"
        title="Document"
      />
    </div>
  )
}
