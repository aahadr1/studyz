'use client'

import { useState, useEffect } from 'react'
import { FiLoader, FiAlertCircle, FiBook } from 'react-icons/fi'

interface PagePedagogicalExplanationProps {
  lessonId: string
  pageNumber: number
}

export default function PagePedagogicalExplanation({
  lessonId,
  pageNumber
}: PagePedagogicalExplanationProps) {
  const [explanation, setExplanation] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadExplanation()
  }, [lessonId, pageNumber])

  const loadExplanation = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(
        `/api/interactive-lessons/${lessonId}/page/${pageNumber}/explain`,
        { method: 'POST' }
      )

      if (!response.ok) {
        throw new Error('Failed to generate explanation')
      }

      const data = await response.json()
      setExplanation(data.explanation || 'No explanation available')
    } catch (err: any) {
      console.error('Error loading explanation:', err)
      setError(err.message || 'Failed to load explanation')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FiLoader className="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Génération de l'explication...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FiAlertCircle className="w-8 h-8 text-error mx-auto mb-3" />
          <p className="text-sm text-error mb-2">{error}</p>
          <button 
            onClick={loadExplanation}
            className="text-xs text-accent hover:underline"
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 px-5 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <FiBook className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium text-text-primary">
            Explication de la page {pageNumber}
          </h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="prose prose-invert prose-sm max-w-none">
          <div className="text-text-secondary leading-relaxed whitespace-pre-wrap">
            {explanation}
          </div>
        </div>
      </div>
    </div>
  )
}

