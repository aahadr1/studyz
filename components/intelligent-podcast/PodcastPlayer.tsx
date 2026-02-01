'use client'

import { useState, useRef, useEffect } from 'react'
import { IntelligentPodcast, PodcastSegment, PodcastChapter } from '@/types/intelligent-podcast'

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
  const currentSegment = podcast.segments[currentSegmentIndex]
  const currentChapter = podcast.chapters.find(
    ch => currentTime >= ch.startTime && currentTime <= ch.endTime
  )

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
    }
  }

  // Skip to previous segment
  const previousSegment = () => {
    if (currentSegmentIndex > 0) {
      const prevIndex = currentSegmentIndex - 1
      setCurrentSegmentIndex(prevIndex)
      setCurrentTime(podcast.segments[prevIndex].timestamp)
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
      }
    }
  }, [currentTime, podcast.segments])

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
            {isDownloading ? 'Preparing…' : 'Download whole podcast'}
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
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-4">
              {podcast.segments.map((segment, idx) => (
                <div
                  key={segment.id}
                  className={`p-4 rounded-lg transition-all ${
                    idx === currentSegmentIndex
                      ? 'bg-blue-900/50 border-l-4 border-blue-500'
                      : 'bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        segment.speaker === 'host' ? 'bg-purple-600' :
                        segment.speaker === 'expert' ? 'bg-blue-600' :
                        'bg-green-600'
                      }`}>
                        {segment.speaker.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 mb-1">
                        {formatTime(segment.timestamp)} • {segment.speaker}
                      </div>
                      <div className="text-gray-200">{segment.text}</div>
                      {segment.isQuestionBreakpoint && (
                        <div className="mt-2 text-xs text-yellow-400">
                          💡 Good moment to ask a question
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
              ⏮
            </button>
            
            <button
              onClick={togglePlayPause}
              className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-2xl"
            >
              {isPlaying ? '⏸' : '▶️'}
            </button>
            
            <button
              onClick={nextSegment}
              disabled={currentSegmentIndex === podcast.segments.length - 1}
              className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
            >
              ⏭
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
              🎤 Ask Question
            </button>
          </div>
        </div>

        {/* Current speaker indicator */}
        <div className="mt-4 text-center text-sm text-gray-400">
          Currently speaking: <span className="font-semibold text-white capitalize">{currentSegment?.speaker}</span>
        </div>
      </div>
    </div>
  )
}
