'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'

const PdfPager = dynamic(() => import('./PdfPager'), { ssr: false })

interface PageViewerProps {
  documentId: string
  onPageChange?: (page: number, total: number) => void
  onCanvasReady?: (getImage: () => string | null) => void
}

export default function PageViewer({ documentId, onPageChange, onCanvasReady }: PageViewerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    fetch(`/api/documents/${documentId}/signed-url`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setUrl(d.signedUrl))
      .catch(() => setError(true))
  }, [documentId])

  useEffect(() => {
    if (onCanvasReady) {
      onCanvasReady(() => {
        if (canvasRef.current) {
          try {
            return canvasRef.current.toDataURL('image/jpeg', 0.8)
          } catch (e) {
            console.error('Failed to capture canvas:', e)
            return null
          }
        }
        return null
      })
    }
  }, [onCanvasReady])

  const handlePageRender = (canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface text-error">
        Failed to load document
      </div>
    )
  }

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <PdfPager 
      url={url} 
      onPageChange={onPageChange}
      onPageRender={handlePageRender}
    />
  )
}
