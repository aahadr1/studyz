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
      if (!response.ok) {
        throw new Error('Failed to fetch podcast')
      }
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
    // Resume playback handled by player component
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-white text-xl">Loading podcast...</div>
        </div>
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-red-900/50 border border-red-600 rounded-lg p-6 max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Error</h2>
          <p className="text-red-200">{error || 'Podcast not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-950">
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
