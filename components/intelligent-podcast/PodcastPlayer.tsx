'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { IntelligentPodcast, PodcastSegment } from '@/types/intelligent-podcast'

const SPEAKER_NAMES: Record<string, string> = {
  host: 'Alex',
  expert: 'Jamie',
}

const SPEAKER_TEXT_COLORS: Record<string, string> = {
  host: 'text-mode-test',
  expert: 'text-mode-study',
}

// WAV constants (must match TTS output: 24kHz, 16-bit, mono)
const SAMPLE_RATE = 24000
const BYTES_PER_SAMPLE = 2
const NUM_CHANNELS = 1
const BITS_PER_SAMPLE = 16
const WAV_HEADER_SIZE = 44

interface SegmentTimeRange {
  start: number
  end: number
}

interface PodcastPlayerProps {
  podcast: IntelligentPodcast
  onInterrupt: (segmentId: string, timestamp: number) => void
}

export function PodcastPlayer({ podcast, onInterrupt }: PodcastPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(podcast.duration || 0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [showTopics, setShowTopics] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // Merged audio state
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null)
  const [segmentRanges, setSegmentRanges] = useState<SegmentTimeRange[]>([])
  const [isLoadingAudio, setIsLoadingAudio] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const progressRef = useRef<HTMLDivElement>(null)

  const currentSegment = podcast.segments[currentSegmentIndex]
  const currentTopic = podcast.chapters.find(
    ch => currentTime >= ch.startTime && currentTime <= ch.endTime
  )

  // ─── Merge all segment audio into one continuous blob ────────────────────

  useEffect(() => {
    let cancelled = false

    async function mergeAudio() {
      setIsLoadingAudio(true)
      setLoadProgress(0)

      const segments = podcast.segments.filter(
        (s: any) => typeof s?.audioUrl === 'string' && s.audioUrl.length > 0
      )

      if (segments.length === 0) {
        setIsLoadingAudio(false)
        return
      }

      try {
        const FETCH_BATCH = 10
        const pcmChunks: ArrayBuffer[] = []
        const ranges: SegmentTimeRange[] = []
        let currentOffset = 0
        let segIdx = 0

        for (let batchStart = 0; batchStart < podcast.segments.length; batchStart += FETCH_BATCH) {
          if (cancelled) return

          const batch = podcast.segments.slice(batchStart, batchStart + FETCH_BATCH)
          const results = await Promise.all(
            batch.map(async (seg) => {
              if (!seg.audioUrl || seg.audioUrl.length === 0) return null
              try {
                const res = await fetch(seg.audioUrl)
                if (!res.ok) return null
                return await res.arrayBuffer()
              } catch {
                return null
              }
            })
          )

          for (const buf of results) {
            if (cancelled) return

            if (buf && buf.byteLength > WAV_HEADER_SIZE) {
              const pcm = buf.slice(WAV_HEADER_SIZE)
              pcmChunks.push(pcm)
              const durationSec = pcm.byteLength / (SAMPLE_RATE * BYTES_PER_SAMPLE * NUM_CHANNELS)
              ranges.push({ start: currentOffset, end: currentOffset + durationSec })
              currentOffset += durationSec
            } else {
              const silenceBytes = Math.round(0.1 * SAMPLE_RATE * BYTES_PER_SAMPLE)
              pcmChunks.push(new ArrayBuffer(silenceBytes))
              ranges.push({ start: currentOffset, end: currentOffset + 0.1 })
              currentOffset += 0.1
            }
            segIdx++
          }

          if (!cancelled) {
            setLoadProgress(Math.round((segIdx / podcast.segments.length) * 100))
          }
        }

        if (cancelled) return

        const totalPcmBytes = pcmChunks.reduce((sum, c) => sum + c.byteLength, 0)
        const wavBuffer = new ArrayBuffer(WAV_HEADER_SIZE + totalPcmBytes)
        const view = new DataView(wavBuffer)
        const bytes = new Uint8Array(wavBuffer)

        writeString(view, 0, 'RIFF')
        view.setUint32(4, 36 + totalPcmBytes, true)
        writeString(view, 8, 'WAVE')
        writeString(view, 12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, NUM_CHANNELS, true)
        view.setUint32(24, SAMPLE_RATE, true)
        view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE, true)
        view.setUint16(32, NUM_CHANNELS * BYTES_PER_SAMPLE, true)
        view.setUint16(34, BITS_PER_SAMPLE, true)
        writeString(view, 36, 'data')
        view.setUint32(40, totalPcmBytes, true)

        let offset = WAV_HEADER_SIZE
        for (const chunk of pcmChunks) {
          bytes.set(new Uint8Array(chunk), offset)
          offset += chunk.byteLength
        }

        if (cancelled) return

        const blob = new Blob([wavBuffer], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)

        setMergedAudioUrl(url)
        setSegmentRanges(ranges)
        setTotalDuration(currentOffset)
        setIsLoadingAudio(false)
        setLoadProgress(100)
      } catch (err) {
        console.error('[PodcastPlayer] Failed to merge audio:', err)
        setIsLoadingAudio(false)
      }
    }

    mergeAudio()
    return () => { cancelled = true }
  }, [podcast.segments])

  useEffect(() => {
    return () => {
      if (mergedAudioUrl) URL.revokeObjectURL(mergedAudioUrl)
    }
  }, [mergedAudioUrl])

  useEffect(() => {
    if (audioRef.current && mergedAudioUrl) {
      audioRef.current.src = mergedAudioUrl
      audioRef.current.playbackRate = playbackRate
    }
  }, [mergedAudioUrl])

  // ─── Segment tracking ──────────────────────────────────────────────────

  const findSegmentAtTime = useCallback((time: number): number => {
    if (segmentRanges.length === 0) return 0
    for (let i = segmentRanges.length - 1; i >= 0; i--) {
      if (time >= segmentRanges[i].start) return i
    }
    return 0
  }, [segmentRanges])

  const scrollToSegment = useCallback((index: number) => {
    const el = segmentRefs.current.get(index)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // ─── Controls ──────────────────────────────────────────────────────────

  const togglePlayPause = () => {
    if (!audioRef.current || !mergedAudioUrl) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  const nextSegment = () => {
    if (currentSegmentIndex < segmentRanges.length - 1) seekToSegment(currentSegmentIndex + 1)
  }

  const previousSegment = () => {
    if (currentSegmentIndex > 0) seekToSegment(currentSegmentIndex - 1)
  }

  const seekToSegment = (index: number) => {
    if (!audioRef.current || index < 0 || index >= segmentRanges.length) return
    const targetTime = segmentRanges[index].start
    audioRef.current.currentTime = targetTime
    setCurrentTime(targetTime)
    setCurrentSegmentIndex(index)
    scrollToSegment(index)
  }

  const seekToTime = (time: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = time
    setCurrentTime(time)
    const idx = findSegmentAtTime(time)
    if (idx !== currentSegmentIndex) {
      setCurrentSegmentIndex(idx)
      scrollToSegment(idx)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || totalDuration === 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seekToTime(pct * totalDuration)
  }

  const handleInterrupt = () => {
    if (audioRef.current) audioRef.current.pause()
    setIsPlaying(false)
    if (currentSegment) onInterrupt(currentSegment.id, currentTime)
  }

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75]
    const currentIdx = rates.indexOf(playbackRate)
    const nextRate = rates[(currentIdx + 1) % rates.length]
    setPlaybackRate(nextRate)
    if (audioRef.current) audioRef.current.playbackRate = nextRate
  }

  // ─── Audio events ──────────────────────────────────────────────────────

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const t = audioRef.current.currentTime
    setCurrentTime(t)
    const idx = findSegmentAtTime(t)
    if (idx !== currentSegmentIndex) {
      setCurrentSegmentIndex(idx)
      scrollToSegment(idx)
    }
  }

  const handleEnded = () => setIsPlaying(false)

  // ─── Helpers ───────────────────────────────────────────────────────────

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
      a.download = `${podcast.title || 'podcast'}.wav`
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

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background text-text-primary">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
      />

      {/* Loading overlay */}
      {isLoadingAudio && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="spinner spinner-lg mx-auto mb-4" />
            <p className="text-text-secondary text-sm mb-3">Preparing audio...</p>
            <div className="w-48 mx-auto bg-elevated rounded-full h-1 overflow-hidden">
              <div
                className="bg-text-tertiary h-full transition-[width] duration-300 rounded-full"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-xs text-text-muted mt-2 mono">{loadProgress}%</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {!isLoadingAudio && (
        <>
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 h-14 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <a href="/intelligent-podcast" className="btn-ghost p-1.5 -ml-1.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </a>
              <div className="min-w-0">
                <h1 className="text-sm font-medium truncate">{podcast.title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowTopics(!showTopics)}
                className={`btn-ghost text-xs px-3 py-1.5 ${showTopics ? 'bg-elevated text-text-primary' : ''}`}
              >
                Topics
              </button>
              <button
                onClick={downloadWholePodcast}
                disabled={!canDownload || isDownloading}
                className="btn-ghost p-1.5 disabled:opacity-30"
                title="Download podcast"
              >
                {isDownloading ? (
                  <div className="spinner spinner-sm" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Transcript */}
            <div ref={transcriptRef} className="flex-1 overflow-y-auto">
              {/* Podcast info header */}
              <div className="px-6 py-6 border-b border-border">
                <h2 className="heading-2 mb-1">{podcast.title}</h2>
                <p className="text-sm text-text-tertiary">{podcast.description}</p>
                {currentTopic && (
                  <div className="mt-4 flex items-center gap-2">
                    <span className="label">Now playing</span>
                    <span className="text-sm text-text-secondary">{currentTopic.title}</span>
                  </div>
                )}
              </div>

              {/* Segments */}
              <div className="px-6 py-4">
                {podcast.segments.map((segment, idx) => {
                  const isActive = idx === currentSegmentIndex
                  const speakerName = SPEAKER_NAMES[segment.speaker] || segment.speaker
                  const speakerColor = SPEAKER_TEXT_COLORS[segment.speaker] || 'text-text-secondary'
                  const segTime = segmentRanges[idx]

                  // Check if this is a topic boundary
                  const topicStart = podcast.chapters.find(ch => {
                    if (!segTime) return false
                    return Math.abs(ch.startTime - segTime.start) < 2
                  })

                  return (
                    <div key={segment.id}>
                      {topicStart && idx > 0 && (
                        <div className="flex items-center gap-3 py-4">
                          <div className="flex-1 border-t border-border" />
                          <span className="label flex-shrink-0">{topicStart.title}</span>
                          <div className="flex-1 border-t border-border" />
                        </div>
                      )}
                      <div
                        ref={(el) => { if (el) segmentRefs.current.set(idx, el) }}
                        onClick={() => seekToSegment(idx)}
                        className={`flex gap-3 py-2.5 px-3 -mx-3 rounded-lg cursor-pointer transition-all duration-100 ${
                          isActive
                            ? 'bg-elevated'
                            : 'hover:bg-surface'
                        }`}
                      >
                        {/* Time */}
                        <span className="text-xs text-text-muted mono w-10 flex-shrink-0 pt-0.5 text-right">
                          {segTime ? formatTime(segTime.start) : formatTime(segment.timestamp)}
                        </span>

                        {/* Speaker + Text */}
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-medium ${speakerColor}`}>
                            {speakerName}
                          </span>
                          <p className={`text-sm leading-relaxed mt-0.5 ${
                            isActive ? 'text-text-primary' : 'text-text-secondary'
                          }`}>
                            {segment.text}
                          </p>
                          {segment.isQuestionBreakpoint && isActive && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleInterrupt() }}
                              className="mt-1.5 text-xs text-mode-challenge hover:text-mode-challenge/80 transition-colors"
                            >
                              Ask a question
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Topics sidebar */}
            {showTopics && (
              <div className="w-72 border-l border-border overflow-y-auto flex-shrink-0">
                <div className="p-4">
                  <h3 className="label mb-4">Topics</h3>
                  <div className="space-y-1">
                    {podcast.chapters.map((topic) => {
                      const isActive = currentTopic?.id === topic.id
                      return (
                        <button
                          key={topic.id}
                          onClick={() => seekToTime(topic.startTime)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 ${
                            isActive
                              ? 'bg-elevated text-text-primary'
                              : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                          }`}
                        >
                          <div className="text-sm font-medium">{topic.title}</div>
                          <div className="text-xs text-text-muted mt-0.5 mono">
                            {formatTime(topic.startTime)}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom player bar */}
          <div className="border-t border-border flex-shrink-0">
            {/* Progress bar */}
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              className="h-1 bg-elevated cursor-pointer group relative"
            >
              <div
                className="h-full bg-text-primary transition-[width] duration-100"
                style={{ width: `${progressPct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progressPct}% - 6px)` }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between px-6 py-3">
              {/* Left: time */}
              <div className="flex items-center gap-2 w-28">
                <span className="text-xs text-text-muted mono">
                  {formatTime(currentTime)}
                </span>
                <span className="text-xs text-text-muted">/</span>
                <span className="text-xs text-text-muted mono">
                  {formatTime(totalDuration)}
                </span>
              </div>

              {/* Center: playback controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={previousSegment}
                  disabled={currentSegmentIndex === 0}
                  className="btn-ghost p-2 disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
                  </svg>
                </button>

                <button
                  onClick={togglePlayPause}
                  disabled={!mergedAudioUrl}
                  className="w-10 h-10 rounded-full bg-text-primary text-background flex items-center justify-center hover:bg-accent-hover transition-all duration-150 disabled:opacity-30 hover:scale-[1.05] active:scale-[0.95]"
                >
                  {isPlaying ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1"/>
                      <rect x="14" y="4" width="4" height="16" rx="1"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <button
                  onClick={nextSegment}
                  disabled={currentSegmentIndex === podcast.segments.length - 1}
                  className="btn-ghost p-2 disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                  </svg>
                </button>
              </div>

              {/* Right: speed + speaker */}
              <div className="flex items-center gap-3 w-28 justify-end">
                <button
                  onClick={cyclePlaybackRate}
                  className="btn-ghost text-xs mono px-2 py-1"
                >
                  {playbackRate}x
                </button>
                <span className="text-xs text-text-muted">
                  {SPEAKER_NAMES[currentSegment?.speaker] || ''}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── WAV header helper ───────────────────────────────────────────────────────

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
