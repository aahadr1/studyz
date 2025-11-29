'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { FiAlertCircle, FiRefreshCw, FiZoomIn, FiZoomOut } from 'react-icons/fi'

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
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  // Load page image from document_pages table
  useEffect(() => {
    const loadPageImage = async () => {
      setLoading(true)
      setError(null)

      const supabase = createClient()

      try {
        // Get document info for total pages
        const { data: doc } = await supabase
          .from('documents')
          .select('page_count')
          .eq('id', documentId)
          .single()

        if (doc?.page_count) {
          onTotalPagesChange(doc.page_count)
        }

        // Get page image path
        const { data: page, error: pageError } = await supabase
          .from('document_pages')
          .select('image_path')
          .eq('document_id', documentId)
          .eq('page_number', currentPage)
          .single()

        if (pageError || !page) {
          setError('Page not found')
          setLoading(false)
          return
        }

        // Get signed URL for the image
        const { data: urlData } = await supabase.storage
          .from('document-pages')
          .createSignedUrl(page.image_path, 3600)

        if (urlData?.signedUrl) {
          setImageUrl(urlData.signedUrl)
        } else {
          setError('Could not load page image')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load page')
      } finally {
        setLoading(false)
      }
    }

    loadPageImage()
  }, [documentId, currentPage, onTotalPagesChange])

  // Provide image URL to AI assistant
  const getImageDataUrl = useCallback(async (): Promise<string | null> => {
    return imageUrl
  }, [imageUrl])

  useEffect(() => {
    if (onPageImageReady) {
      onPageImageReady(getImageDataUrl)
    }
  }, [onPageImageReady, getImageDataUrl])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg p-6">
        <div className="text-center glass-card p-6 max-w-sm">
          <FiAlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Page Not Available</p>
          <p className="text-gray-400 text-sm mb-4">{error || 'Image not found'}</p>
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
    <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-3 p-2 bg-dark-elevated border-b border-dark-border">
        <button
          onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
          className="p-2 glass-button rounded-lg disabled:opacity-30"
          disabled={zoom <= 0.5}
        >
          <FiZoomOut className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-400 w-16 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(3, z + 0.25))}
          className="p-2 glass-button rounded-lg disabled:opacity-30"
          disabled={zoom >= 3}
        >
          <FiZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Page image */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-center min-h-full">
          <img
            src={imageUrl}
            alt={`Page ${currentPage}`}
            className="shadow-xl rounded-lg bg-white"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          />
        </div>
      </div>
    </div>
  )
}
