'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { 
  MobileHeader, 
  FloatingActionButton, 
  EmptyState, 
  BottomSheet,
  PullToRefreshIndicator
} from '@/components/mobile/MobileLayout'
import { usePullToRefresh, useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { FiPlus, FiTrash2, FiMoreVertical, FiArrowRight, FiMic } from 'react-icons/fi'

interface PodcastSummary {
  id: string
  title: string
  description: string
  duration: number
  language: string
  status: string
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  ready: { label: 'Ready', class: 'text-[var(--color-success)]' },
  generating: { label: 'Processing', class: 'text-[var(--color-warning)]' },
  error: { label: 'Error', class: 'text-[var(--color-error)]' },
}

export default function MobilePodcastsPage() {
  const router = useRouter()
  const [podcasts, setPodcasts] = useState<PodcastSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastSummary | null>(null)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { triggerHaptic } = useHapticFeedback()

  const loadPodcasts = useCallback(async () => {
    const supabase = createClient()
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        router.push('/m/login')
        return
      }

      const { data, error } = await supabase
        .from('intelligent_podcasts')
        .select('id,title,description,duration,language,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setPodcasts((data as PodcastSummary[]) || [])
    } catch (error) {
      console.error('Error loading podcasts:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadPodcasts()
  }, [loadPodcasts])

  const {
    containerRef,
    isRefreshing,
    pullProgress
  } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic('medium')
      await loadPodcasts()
    }
  })

  const handleDelete = async () => {
    if (!selectedPodcast) return
    
    setDeleting(true)
    triggerHaptic('warning')
    const supabase = createClient()
    
    try {
      const { error } = await supabase
        .from('intelligent_podcasts')
        .delete()
        .eq('id', selectedPodcast.id)

      if (!error) {
        triggerHaptic('success')
        setPodcasts(podcasts.filter(p => p.id !== selectedPodcast.id))
      }
    } catch (error) {
      console.error('Error deleting podcast:', error)
    } finally {
      setDeleting(false)
      setShowActionSheet(false)
      setSelectedPodcast(null)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    if (mins < 1) return '<1m'
    return `${mins}m`
  }

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Podcasts" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      <MobileHeader 
        title="Podcasts" 
        rightAction={
          <Link href="/m/intelligent-podcast/new" className="mobile-header-action">
            <FiPlus className="w-5 h-5" strokeWidth={1.5} />
          </Link>
        }
      />

      <div ref={containerRef} className="mobile-content">
        <PullToRefreshIndicator progress={pullProgress} isRefreshing={isRefreshing} />

        {podcasts.length === 0 ? (
          <EmptyState
            icon={<FiMic className="w-6 h-6" strokeWidth={1} />}
            title="No Podcasts"
            description="Create AI-generated podcasts from your documents"
            action={
              <Link href="/m/intelligent-podcast/new" className="btn-mobile btn-primary-mobile">
                Create Podcast
              </Link>
            }
          />
        ) : (
          <div>
            {/* Count */}
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)] mono">
                {podcasts.length} podcast{podcasts.length !== 1 ? 's' : ''}
              </span>
            </div>
            
            {/* List */}
            {podcasts.map((podcast) => {
              const status = STATUS_CONFIG[podcast.status] || STATUS_CONFIG.error

              return (
                <div 
                  key={podcast.id} 
                  className="flex items-center border-b border-[var(--color-border)]"
                >
                  <Link
                    href={`/m/intelligent-podcast/${podcast.id}`}
                    className="flex-1 flex items-center justify-between px-4 py-4 active:bg-[var(--color-surface)]"
                    onClick={() => triggerHaptic('light')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-medium text-sm truncate">{podcast.title}</h3>
                        <span className={`text-[8px] uppercase tracking-wider ${status.class}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] truncate">
                        {podcast.description}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)] mono mt-0.5">
                        {formatDuration(podcast.duration)} · {podcast.language.toUpperCase()}
                      </p>
                    </div>
                    <FiArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] ml-4" strokeWidth={1} />
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      triggerHaptic('light')
                      setSelectedPodcast(podcast)
                      setShowActionSheet(true)
                    }}
                    className="px-4 py-4 text-[var(--color-text-tertiary)] active:opacity-50"
                  >
                    <FiMoreVertical className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <FloatingActionButton
        href="/m/intelligent-podcast/new"
        icon={<FiPlus strokeWidth={1.5} />}
        label="New"
      />

      <BottomSheet
        isOpen={showActionSheet}
        onClose={() => {
          setShowActionSheet(false)
          setSelectedPodcast(null)
        }}
        title={selectedPodcast?.title}
      >
        <div className="space-y-2">
          <Link
            href={`/m/intelligent-podcast/${selectedPodcast?.id}`}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)]"
            onClick={() => setShowActionSheet(false)}
          >
            <span className="font-medium text-sm">Play</span>
            <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)] w-full"
          >
            <span className="font-medium text-sm">Delete</span>
            {deleting ? (
              <div className="spinner-mobile w-4 h-4" />
            ) : (
              <FiTrash2 className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}
