'use client'

import { useState, useEffect } from 'react'
import { FiLoader } from 'react-icons/fi'

interface TranscriptionSidebarProps {
  lessonId: string
  documentId: string
  currentPage: number
  totalPages: number
  getPageImage: () => string | null
}

export default function TranscriptionSidebar({ 
  lessonId, 
  documentId, 
  currentPage, 
  totalPages, 
  getPageImage 
}: TranscriptionSidebarProps) {
  const [transcription, setTranscription] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [cache, setCache] = useState<Record<number, string>>({})

  useEffect(() => {
    // Check cache first
    if (cache[currentPage]) {
      setTranscription(cache[currentPage])
      return
    }

    // Fetch transcription for current page
    const fetchTranscription = async () => {
      setLoading(true)
      try {
        const pageImage = getPageImage()
        if (!pageImage) {
          console.error('No page image available')
          setLoading(false)
          return
        }

        const response = await fetch(
          `/api/interactive-lessons/${lessonId}/page/${currentPage}/transcribe`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageImage,
              documentId,
              pageNumber: currentPage
            })
          }
        )

        if (!response.ok) {
          throw new Error('Failed to transcribe page')
        }

        const data = await response.json()
        const text = data.transcription || 'No transcription available.'
        
        setTranscription(text)
        setCache(prev => ({ ...prev, [currentPage]: text }))
      } catch (error) {
        console.error('Error fetching transcription:', error)
        setTranscription('Error loading transcription.')
      } finally {
        setLoading(false)
      }
    }

    fetchTranscription()
  }, [currentPage, lessonId, documentId, getPageImage, cache])

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border">
        <span className="font-medium text-text-primary">Page Explanation</span>
        <span className="text-xs text-text-tertiary">Page {currentPage} / {totalPages}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <FiLoader className="w-5 h-5 animate-spin text-accent" />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-text-secondary whitespace-pre-wrap">
            {transcription}
          </div>
        )}
      </div>
    </div>
  )
}

