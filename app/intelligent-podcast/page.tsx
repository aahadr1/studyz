'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface PodcastSummary {
  id: string
  title: string
  description: string
  duration: number
  language: string
  chapters: number
  segments: number
  status: string
  created_at: string
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
      // TODO: Implement list endpoint
      // For now, empty list
      setPodcasts([])
    } catch (err) {
      console.error('Failed to fetch podcasts:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    return `${mins} min`
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Intelligent Podcasts</h1>
            <p className="text-gray-400">
              Your AI-powered interactive learning podcasts
            </p>
          </div>
          <Link
            href="/intelligent-podcast/new"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 font-semibold rounded-lg transition-colors"
          >
            + Create New Podcast
          </Link>
        </div>

        {/* Podcasts grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : podcasts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎙️</div>
            <h3 className="text-2xl font-semibold mb-2">No podcasts yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first intelligent podcast from your documents
            </p>
            <Link
              href="/intelligent-podcast/new"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 font-semibold rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {podcasts.map((podcast) => (
              <div
                key={podcast.id}
                onClick={() => router.push(`/intelligent-podcast/${podcast.id}`)}
                className="bg-gray-900 rounded-lg p-6 hover:bg-gray-800 transition-colors cursor-pointer border border-gray-800"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="text-3xl">🎧</div>
                  <div className={`px-2 py-1 rounded text-xs font-semibold ${
                    podcast.status === 'ready' ? 'bg-green-900 text-green-300' :
                    podcast.status === 'generating' ? 'bg-yellow-900 text-yellow-300' :
                    'bg-red-900 text-red-300'
                  }`}>
                    {podcast.status}
                  </div>
                </div>

                <h3 className="text-xl font-semibold mb-2">{podcast.title}</h3>
                <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                  {podcast.description}
                </p>

                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div>⏱ {formatDuration(podcast.duration)}</div>
                  <div>📚 {podcast.chapters} chapters</div>
                  <div className="uppercase">{podcast.language}</div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-600">
                  Created {new Date(podcast.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
