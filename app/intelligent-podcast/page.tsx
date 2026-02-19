'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

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
  ready: { label: 'Ready', class: 'badge-success' },
  generating: { label: 'Generating', class: 'badge-warning' },
  error: { label: 'Error', class: 'badge-error' },
}

export default function PodcastsListPage() {
  const router = useRouter()
  const [podcasts, setPodcasts] = useState<PodcastSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPodcasts()
  }, [])

  const fetchPodcasts = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('intelligent_podcasts')
        .select('id,title,description,duration,language,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setPodcasts((data as PodcastSummary[]) || [])
    } catch (err) {
      console.error('Failed to fetch podcasts:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    if (mins < 1) return 'Less than a minute'
    return `${mins} min`
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="heading-1">Podcasts</h1>
            <p className="caption mt-1">Your generated audio conversations</p>
          </div>
          <Link href="/intelligent-podcast/new" className="btn-primary">
            New podcast
          </Link>
        </div>

        <div className="divider mb-8" />

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner spinner-lg" />
          </div>
        ) : podcasts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-text-tertiary text-lg mb-2">No podcasts yet</p>
            <p className="text-text-muted text-sm mb-8">
              Create your first podcast from your documents
            </p>
            <Link href="/intelligent-podcast/new" className="btn-primary">
              Get started
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {podcasts.map((podcast) => {
              const status = STATUS_CONFIG[podcast.status] || STATUS_CONFIG.error

              return (
                <div
                  key={podcast.id}
                  onClick={() => router.push(`/intelligent-podcast/${podcast.id}`)}
                  className="flex items-center gap-4 px-4 py-4 -mx-4 rounded-xl cursor-pointer transition-all duration-150 hover:bg-elevated group"
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center flex-shrink-0 group-hover:border-border-light transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-medium text-text-primary truncate">
                        {podcast.title}
                      </h3>
                      <span className={`badge ${status.class} flex-shrink-0`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5 truncate">
                      {podcast.description}
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 flex-shrink-0 text-xs text-text-muted">
                    <span>{formatDuration(podcast.duration)}</span>
                    <span className="uppercase">{podcast.language}</span>
                    <span>{formatDate(podcast.created_at)}</span>
                  </div>

                  {/* Arrow */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted group-hover:text-text-tertiary transition-colors flex-shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
