'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MobileLayout, { MobileHeader } from '@/components/mobile/MobileLayout'
import { PodcastPlayer } from '@/components/intelligent-podcast/PodcastPlayer'
import { RealtimeInteraction } from '@/components/intelligent-podcast/RealtimeInteraction'
import { IntelligentPodcast } from '@/types/intelligent-podcast'

export default function MobilePodcastPage() {
  const params = useParams()
  const router = useRouter()
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
      <MobileLayout hideTabBar>
        <MobileHeader title="Loading..." backHref="/m/intelligent-podcast" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  if (error || !podcast) {
    return (
      <MobileLayout hideTabBar>
        <MobileHeader title="Error" backHref="/m/intelligent-podcast" />
        <div className="mobile-content flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-sm font-medium mb-2">Something went wrong</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{error || 'Podcast not found'}</p>
          </div>
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout hideTabBar>
      <MobileHeader 
        title={podcast.title} 
        backHref="/m/intelligent-podcast"
        transparent
      />

      <div className="mobile-content-full bg-[var(--color-bg)]">
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
    </MobileLayout>
  )
}
