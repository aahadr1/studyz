'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { PodcastPlayer } from '@/components/intelligent-podcast/PodcastPlayer'
import { RealtimeInteraction } from '@/components/intelligent-podcast/RealtimeInteraction'
import { IntelligentPodcast } from '@/types/intelligent-podcast'

export default function PodcastPage() {
  const params = useParams()
  const podcastId = params.id as string

  const [podcast, setPodcast] = useState<IntelligentPodcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInteraction, setShowInteraction] = useState(false)
  const [interruptContext, setInterruptContext] = useState<{
    segmentId: string
    timestamp: number
  } | null>(null)

  useEffect(() => {
    fetchPodcast()
  }, [podcastId])

  const fetchPodcast = async () => {
    try {
      const response = await fetch(`/api/intelligent-podcast/${podcastId}`)
      if (!response.ok) throw new Error('Failed to fetch podcast')
      const data = await response.json()
      setPodcast(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInterrupt = (segmentId: string, timestamp: number) => {
    setInterruptContext({ segmentId, timestamp })
    setShowInteraction(true)
  }

  const handleCloseInteraction = () => {
    setShowInteraction(false)
    setInterruptContext(null)
  }

  const handleResumeInteraction = () => {
    setShowInteraction(false)
    setInterruptContext(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-text-primary text-lg font-medium mb-2">Something went wrong</p>
          <p className="text-text-tertiary text-sm">{error || 'Podcast not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background">
      <PodcastPlayer podcast={podcast} onInterrupt={handleInterrupt} />

      {showInteraction && interruptContext && (
        <RealtimeInteraction
          podcastId={podcastId}
          currentSegmentId={interruptContext.segmentId}
          currentTimestamp={interruptContext.timestamp}
          onClose={handleCloseInteraction}
          onResume={handleResumeInteraction}
        />
      )}
    </div>
  )
}
