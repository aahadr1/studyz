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
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [useImageMode, setUseImageMode] = useState(false)
  const [zoom, setZoom] = useState(1)

  // Load document
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      const supabase = createClient()

      try {
        // Get document info
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .select('file_path, page_count, file_type')
          .eq('id', documentId)
          .single()

        if (docError || !doc) {
          throw new Error('Document not found')
        }

        onTotalPagesChange(doc.page_count || 1)

        // Try to get page image first (if exists)
        const { data: page } = await supabase
          .from('document_pages')
          .select('image_path')
          .eq('document_id', documentId)
          .eq('page_number', currentPage)
          .single()

        if (page?.image_path) {
          // Use page image
          const { data: imgUrl } = await supabase.storage
            .from('document-pages')
            .createSignedUrl(page.image_path, 3600)

          if (imgUrl?.signedUrl) {
            setPageImageUrl(imgUrl.signedUrl)
            setUseImageMode(true)
            setLoading(false)
            return
          }
        }

        // Fallback: Use PDF directly via iframe
        const { data: pdfUrl } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 3600)

        if (pdfUrl?.signedUrl) {
          setSignedUrl(pdfUrl.signedUrl)
          setUseImageMode(false)
        } else {
          throw new Error('Could not load document')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [documentId, currentPage, onTotalPagesChange])

  // Provide URL to AI
  const getImageUrl = useCallback(async (): Promise<string | null> => {
    return pageImageUrl || signedUrl
  }, [pageImageUrl, signedUrl])

  useEffect(() => {
    if (onPageImageReady) {
      onPageImageReady(getImageUrl)
    }
  }, [onPageImageReady, getImageUrl])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg p-6">
        <div className="text-center glass-card p-6 max-w-sm">
          <FiAlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Failed to Load</p>
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

  // Image mode (page images exist)
  if (useImageMode && pageImageUrl) {
    return (
      <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
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
        <div className="flex-1 overflow-auto p-4">
          <div className="flex items-center justify-center min-h-full">
            <img
              src={pageImageUrl}
              alt={`Page ${currentPage}`}
              className="shadow-xl rounded-lg bg-white"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            />
          </div>
        </div>
      </div>
    )
  }

  // PDF iframe mode (fallback)
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
