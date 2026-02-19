'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { IntelligentPodcast, PodcastSegment, PodcastChapter } from '@/types/intelligent-podcast'

const SPEAKER_NAMES: Record<string, string> = {
  host: 'Alex',
  expert: 'Jamie',
}

const SPEAKER_COLORS: Record<string, string> = {
  host: 'bg-purple-600',
  expert: 'bg-blue-600',
}

const SPEAKER_ACTIVE_BG: Record<string, string> = {
  host: 'bg-purple-900/50 border-l-4 border-purple-500',
  expert: 'bg-blue-900/50 border-l-4 border-blue-500',
}

interface PodcastPlayerProps {
  podcast: IntelligentPodcast
  onInterrupt: (segmentId: string, timestamp: number) => void
}

export function PodcastPlayer({ podcast, onInterrupt }: PodcastPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [showTranscript, setShowTranscript] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const currentSegment = podcast.segments[currentSegmentIndex]
  const currentChapter = podcast.chapters.find(
    ch => currentTime >= ch.startTime && currentTime <= ch.endTime
  )

  // Auto-scroll transcript to current segment
  const scrollToSegment = useCallback((index: number) => {
    const el = segmentRefs.current.get(index)
    if (el && transcriptRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // Play/pause toggle
  const togglePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  // Skip to next segment
  const nextSegment = () => {
    if (currentSegmentIndex < podcast.segments.length - 1) {
      const nextIndex = currentSegmentIndex + 1
      setCurrentSegmentIndex(nextIndex)
      setCurrentTime(podcast.segments[nextIndex].timestamp)
      scrollToSegment(nextIndex)
    }
  }

  // Skip to previous segment
  const previousSegment = () => {
    if (currentSegmentIndex > 0) {
      const prevIndex = currentSegmentIndex - 1
      setCurrentSegmentIndex(prevIndex)
      setCurrentTime(podcast.segments[prevIndex].timestamp)
      scrollToSegment(prevIndex)
    }
  }

  // Handle interrupt button
  const handleInterrupt = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    onInterrupt(currentSegment.id, currentTime)
  }

  // Update current segment based on time
  useEffect(() => {
    const segment = podcast.segments.find(
      (seg, idx) => {
        const nextSeg = podcast.segments[idx + 1]
        return currentTime >= seg.timestamp && (!nextSeg || currentTime < nextSeg.timestamp)
      }
    )
    if (segment) {
      const index = podcast.segments.findIndex(s => s.id === segment.id)
      if (index !== currentSegmentIndex) {
        setCurrentSegmentIndex(index)
        scrollToSegment(index)
      }
    }
  }, [currentTime, podcast.segments, currentSegmentIndex, scrollToSegment])

  // Load segment audio when changed
  useEffect(() => {
    if (audioRef.current && currentSegment?.audioUrl) {
      audioRef.current.src = currentSegment.audioUrl
      audioRef.current.playbackRate = playbackRate
      if (isPlaying) {
        audioRef.current.play()
      }
    }
  }, [currentSegmentIndex])

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const canDownload =
    podcast.status === 'ready' &&
    Array.isArray(podcast.segments) &&
    podcast.segments.length > 0 &&
    podcast.segments.every((s: any) => typeof s?.audioUrl === 'string' && s.audioUrl.length > 0)

  const downloadWholePodcast = async () => {
    try {
      setIsDownloading(true)
      const res = await fetch(`/api/intelligent-podcast/${podcast.id}/download`, {
        method: 'GET',
        credentials: 'include',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Download failed')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${podcast.title || 'podcast'}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to download podcast')
    } finally {
      setIsDownloading(false)
    }
  }

  // Click on a segment to jump to it
  const jumpToSegment = (index: number) => {
    setCurrentSegmentIndex(index)
    setCurrentTime(podcast.segments[index].timestamp)
    if (audioRef.current && podcast.segments[index]?.audioUrl) {
      audioRef.current.src = podcast.segments[index].audioUrl
      audioRef.current.playbackRate = playbackRate
      if (isPlaying) {
        audioRef.current.play()
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold mb-2 truncate">{podcast.title}</h1>
            <p className="text-gray-400">{podcast.description}</p>
          </div>
          <button
            onClick={downloadWholePodcast}
            disabled={!canDownload || isDownloading}
            className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title={canDownload ? 'Download all audio segments as a zip' : 'Available once all audio is generated'}
          >
            {isDownloading ? 'Preparing...' : 'Download whole podcast'}
          </button>
        </div>
        {currentChapter && (
          <div className="mt-4 p-3 bg-gray-800 rounded-lg">
            <div className="text-sm text-gray-400">Current Chapter</div>
            <div className="font-semibold">{currentChapter.title}</div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Transcript panel */}
        {showTranscript && (
          <div ref={transcriptRef} className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-2">
              {podcast.segments.map((segment, idx) => {
                const isActive = idx === currentSegmentIndex
                const speakerName = SPEAKER_NAMES[segment.speaker] || segment.speaker
                const avatarColor = SPEAKER_COLORS[segment.speaker] || 'bg-gray-600'
                const activeBg = SPEAKER_ACTIVE_BG[segment.speaker] || 'bg-blue-900/50 border-l-4 border-blue-500'

                return (
                  <div
                    key={segment.id}
                    ref={(el) => {
                      if (el) segmentRefs.current.set(idx, el)
                    }}
                    onClick={() => jumpToSegment(idx)}
                    className={`p-3 rounded-lg transition-all cursor-pointer hover:bg-gray-800/60 ${
                      isActive ? activeBg : 'bg-gray-800/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor}`}>
                          {speakerName.charAt(0)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-gray-300">{speakerName}</span>
                          <span className="text-xs text-gray-500">{formatTime(segment.timestamp)}</span>
                        </div>
                        <div className={`text-sm leading-relaxed ${isActive ? 'text-white' : 'text-gray-300'}`}>
                          {segment.text}
                        </div>
                        {segment.isQuestionBreakpoint && (
                          <div className="mt-1 text-xs text-yellow-400">
                            Good moment to ask a question
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Chapters sidebar */}
        <div className="w-80 border-l border-gray-800 p-4 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Chapters</h3>
          <div className="space-y-2">
            {podcast.chapters.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => setCurrentTime(chapter.startTime)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentChapter?.id === chapter.id
                    ? 'bg-blue-600'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="font-medium">{chapter.title}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatTime(chapter.startTime)} - {formatTime(chapter.endTime)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Difficulty: {chapter.difficulty}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Player controls */}
      <div className="border-t border-gray-800 p-6">
        <audio
          ref={audioRef}
          onTimeUpdate={(e) => {
            const audio = e.currentTarget
            setCurrentTime(currentSegment.timestamp + audio.currentTime)
          }}
          onEnded={nextSegment}
        />

        {/* Progress bar */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max={podcast.duration}
            value={currentTime}
            onChange={(e) => setCurrentTime(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(podcast.duration)}</span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={previousSegment}
              disabled={currentSegmentIndex === 0}
              className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
            >
              Previous
            </button>

            <button
              onClick={togglePlayPause}
              className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-2xl"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <button
              onClick={nextSegment}
              disabled={currentSegmentIndex === podcast.segments.length - 1}
              className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={playbackRate}
              onChange={(e) => {
                const rate = Number(e.target.value)
                setPlaybackRate(rate)
                if (audioRef.current) {
                  audioRef.current.playbackRate = rate
                }
              }}
              className="bg-gray-800 text-white px-3 py-2 rounded"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>

            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700"
            >
              {showTranscript ? 'Hide' : 'Show'} Transcript
            </button>

            <button
              onClick={handleInterrupt}
              disabled={!currentSegment.isQuestionBreakpoint}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                currentSegment.isQuestionBreakpoint
                  ? 'bg-yellow-600 hover:bg-yellow-700 animate-pulse'
                  : 'bg-gray-700 opacity-50 cursor-not-allowed'
              }`}
            >
              Ask Question
            </button>
          </div>
        </div>

        {/* Current speaker indicator */}
        <div className="mt-4 text-center text-sm text-gray-400">
          Currently speaking: <span className="font-semibold text-white">{SPEAKER_NAMES[currentSegment?.speaker] || currentSegment?.speaker}</span>
        </div>
      </div>
    </div>
  )
}
