'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

interface DocumentViewerProps {
  documentId: string
  pageNumber: number
  filePath: string
  fileType: string
}

export default function DocumentViewer({
  documentId,
  pageNumber,
  filePath,
  fileType,
}: DocumentViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPageImage = async () => {
      setLoading(true)
      setError(null)

      try {
        // Get the page image from document_pages table
        const { data: pageData, error: pageError } = await supabase
          .from('document_pages')
          .select('image_path')
          .eq('document_id', documentId)
          .eq('page_number', pageNumber)
          .single()

        if (pageError) {
          // If no page image exists, show placeholder
          setError('Page image not yet processed')
          setImageUrl(null)
          return
        }

        // Get public URL for the image
        const { data: urlData } = supabase.storage
          .from('document-pages')
          .getPublicUrl(pageData.image_path)

        setImageUrl(urlData.publicUrl)
      } catch (err: any) {
        console.error('Error loading page image:', err)
        setError(err.message || 'Failed to load page')
      } finally {
        setLoading(false)
      }
    }

    if (documentId && pageNumber) {
      loadPageImage()
    }
  }, [documentId, pageNumber])

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="spinner"></div>
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {error || 'Page Not Available'}
          </h3>
          <p className="text-sm text-gray-600">
            The document is being processed. Please try again in a few moments.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl w-full bg-white rounded-lg shadow-lg overflow-hidden">
      <img
        src={imageUrl}
        alt={`Page ${pageNumber}`}
        className="w-full h-auto"
      />
    </div>
  )
}

