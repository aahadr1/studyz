'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { GeminiLiveInteraction } from '@/components/intelligent-podcast/GeminiLiveInteraction'
import { IntelligentPodcast, PodcastSegment } from '@/types/intelligent-podcast'

const SPEAKER_NAMES: Record<string, string> = {
  host: 'Alex',
  expert: 'Jamie',
}

const SPEAKER_TEXT_COLORS: Record<string, string> = {
  host: 'text-mode-test',
  expert: 'text-mode-study',
}

const SAMPLE_RATE = 24000
const BYTES_PER_SAMPLE = 2
const NUM_CHANNELS = 1
const BITS_PER_SAMPLE = 16
const WAV_HEADER_SIZE = 44

interface SegmentTimeRange {
  start: number
  end: number
}

export default function MobilePodcastPage() {
  const params = useParams()
  const router = useRouter()
  const podcastId = params.id as string

  const [podcast, setPodcast] = useState<IntelligentPodcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showVoiceQA, setShowVoiceQA] = useState(false)
  const [pausedForQA, setPausedForQA] = useState(false)

  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [showTopics, setShowTopics] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null)
  const [segmentRanges, setSegmentRanges] = useState<SegmentTimeRange[]>([])
  const [isLoadingAudio, setIsLoadingAudio] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPodcast()
  }, [podcastId])

  const fetchPodcast = async () => {
    try {
      const response = await fetch(`/api/intelligent-podcast/${podcastId}`)
      if (!response.ok) throw new Error('Failed to fetch podcast')
      const data = await response.json()
      setPodcast(data)
      setTotalDuration(data.duration || 0)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Merge audio
  useEffect(() => {
    if (!podcast?.segments) return
    let cancelled = false

    async function mergeAudio() {
      if (!podcast?.segments) return
      
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
  }, [podcast])

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

  const togglePlayPause = () => {
    if (!audioRef.current || !mergedAudioUrl) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    }
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

  const handleAskQuestion = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
      setPausedForQA(true)
    }
    setShowVoiceQA(true)
  }

  const handleVoiceQAClose = () => {
    setShowVoiceQA(false)
    setPausedForQA(false)
  }

  const handleVoiceQAResume = () => {
    setShowVoiceQA(false)
    setPausedForQA(false)
    if (audioRef.current && mergedAudioUrl) {
      // Reload audio source to reset browser audio pipeline after mic usage
      const savedTime = audioRef.current.currentTime
      const savedRate = audioRef.current.playbackRate
      audioRef.current.src = mergedAudioUrl
      audioRef.current.currentTime = savedTime
      audioRef.current.playbackRate = savedRate
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const canDownload =
    podcast?.status === 'ready' &&
    Array.isArray(podcast?.segments) &&
    podcast.segments.length > 0 &&
    podcast.segments.every((s: any) => typeof s?.audioUrl === 'string' && s.audioUrl.length > 0)

  const downloadWholePodcast = async () => {
    try {
      setIsDownloading(true)
      const res = await fetch(`/api/intelligent-podcast/${podcastId}/download`, {
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
      a.download = `${podcast?.title || 'podcast'}.wav`
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
  const currentSegment = podcast?.segments[currentSegmentIndex]
  const currentTopic = podcast?.chapters.find(
    ch => currentTime >= ch.startTime && currentTime <= ch.endTime
  )

  if (loading) {
    return (
      <div className="h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="spinner-mobile" />
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="h-screen bg-[var(--color-bg)] flex flex-col">
        <div className="h-[52px] flex items-center px-4 border-b border-[var(--color-border)]">
          <Link href="/m/intelligent-podcast" className="p-2 -ml-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-sm font-medium mb-2">Something went wrong</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{error || 'Podcast not found'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Voice Q&A Modal */}
      {showVoiceQA && currentSegment && (
        <GeminiLiveInteraction
          podcastId={podcastId}
          currentSegmentId={currentSegment.id}
          currentTimestamp={currentTime}
          podcastTitle={podcast.title}
          language={podcast.language}
          onClose={handleVoiceQAClose}
          onResume={handleVoiceQAResume}
        />
      )}

      {/* Floating Ask button */}
      {!showVoiceQA && (
        <button
          onClick={handleAskQuestion}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full bg-[var(--color-text)] text-[var(--color-bg)] shadow-lg active:opacity-80 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span className="text-xs font-medium">
            {podcast.language === 'fr' ? 'Question' : 'Ask'}
          </span>
        </button>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
      />

      {/* Fixed Header - No overlap */}
      <div className="flex-shrink-0 bg-[var(--color-bg)] border-b border-[var(--color-border)] safe-top">
        <div className="h-[52px] flex items-center justify-between px-3 gap-2">
          <Link href="/m/intelligent-podcast" className="p-2 -ml-2 flex-shrink-0 active:opacity-50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>

          <h1 className="flex-1 text-sm font-medium truncate text-center px-2 min-w-0">
            {podcast.title}
          </h1>

          <div className="flex items-center gap-1 flex-shrink-0">
            {podcast.chapters && podcast.chapters.length > 0 && (
              <button
                onClick={() => setShowTopics(!showTopics)}
                className={`px-3 py-2 text-xs font-medium transition-all ${
                  showTopics 
                    ? 'bg-[var(--color-text)] text-[var(--color-bg)]' 
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] active:bg-[var(--color-surface-hover)]'
                }`}
              >
                Topics
              </button>
            )}
            <button
              onClick={downloadWholePodcast}
              disabled={!canDownload || isDownloading}
              className="p-2 bg-[var(--color-surface)] text-[var(--color-text-secondary)] active:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:active:bg-[var(--color-surface)]"
            >
              {isDownloading ? (
                <div className="spinner-mobile w-4 h-4" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {isLoadingAudio ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <div className="spinner-mobile mx-auto mb-4" />
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">Preparing audio...</p>
            <div className="w-full bg-[var(--color-surface)] h-1 overflow-hidden">
              <div
                className="bg-[var(--color-text)] h-full transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-2 mono">{loadProgress}%</p>
          </div>
        </div>
      ) : (
        <>
          {/* Content */}
          <div className="flex-1 overflow-y-auto" ref={transcriptRef}>
            {/* Info */}
            <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {podcast.description}
              </p>
              {currentTopic && (
                <div className="mt-3 flex items-center gap-2 p-2 bg-[var(--color-bg)] border border-[var(--color-border)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Now</span>
                  <span className="text-xs text-[var(--color-text)]">{currentTopic.title}</span>
                </div>
              )}
            </div>

            {/* Transcript */}
            <div className="p-4">
              {podcast.segments.map((segment, idx) => {
                const isActive = idx === currentSegmentIndex
                const speakerName = SPEAKER_NAMES[segment.speaker] || segment.speaker
                const speakerColor = SPEAKER_TEXT_COLORS[segment.speaker] || 'text-[var(--color-text-secondary)]'
                const segTime = segmentRanges[idx]

                const topicTransition = podcast.chapters?.find(ch => {
                  if (!segTime || idx === 0) return false
                  return Math.abs(ch.startTime - segTime.start) < 2
                })

                return (
                  <div key={segment.id}>
                    {topicTransition && (
                      <div className="flex items-center gap-2 py-3 my-2">
                        <div className="flex-1 border-t border-[var(--color-border)]" />
                        <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{topicTransition.title}</span>
                        <div className="flex-1 border-t border-[var(--color-border)]" />
                      </div>
                    )}
                    <div
                      ref={(el) => { if (el) segmentRefs.current.set(idx, el) }}
                      onClick={() => seekToSegment(idx)}
                      className={`flex gap-2 py-2 px-2 -mx-2 active:bg-[var(--color-surface)] ${
                        isActive ? 'bg-[var(--color-surface)]' : ''
                      }`}
                    >
                      <span className="text-[10px] text-[var(--color-text-tertiary)] mono w-10 flex-shrink-0 pt-0.5 text-right">
                        {segTime ? formatTime(segTime.start) : formatTime(segment.timestamp)}
                      </span>

                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] font-medium ${speakerColor}`}>
                          {speakerName}
                        </span>
                        <p className={`text-sm leading-relaxed mt-0.5 ${
                          isActive ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
                        }`}>
                          {segment.text}
                        </p>
                        {segment.isQuestionBreakpoint && isActive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAskQuestion() }}
                            className="mt-1.5 text-xs text-[var(--color-mode-challenge)] active:opacity-70"
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

          {/* Topics Panel */}
          {showTopics && podcast.chapters && podcast.chapters.length > 0 && (
            <div className="fixed inset-0 z-50 bg-[var(--color-bg)]" style={{ top: 'calc(52px + var(--safe-area-top))' }}>
              <div className="h-full overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Topics</h3>
                  <button
                    onClick={() => setShowTopics(false)}
                    className="p-2 active:opacity-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
                  Jump to different parts of the conversation
                </p>
                <div className="space-y-2">
                  {podcast.chapters.map((topic) => {
                    const isActive = currentTopic?.id === topic.id
                    return (
                      <button
                        key={topic.id}
                        onClick={() => {
                          seekToTime(topic.startTime)
                          setShowTopics(false)
                        }}
                        className={`w-full text-left p-3 border border-[var(--color-border)] active:bg-[var(--color-surface)] ${
                          isActive ? 'bg-[var(--color-surface)]' : ''
                        }`}
                      >
                        <div className="text-sm font-medium mb-1">{topic.title}</div>
                        <div className="text-xs text-[var(--color-text-tertiary)] mono">
                          {formatTime(topic.startTime)}
                        </div>
                        {topic.summary && (
                          <div className="text-xs text-[var(--color-text-secondary)] mt-2 line-clamp-2">
                            {topic.summary}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Player Controls */}
          <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] safe-bottom">
            {/* Progress */}
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              className="h-1 bg-[var(--color-surface)] relative"
            >
              <div
                className="h-full bg-[var(--color-text)] transition-[width] duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Controls */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--color-text-tertiary)] mono">
                  {formatTime(currentTime)}
                </span>
                <span className="text-xs text-[var(--color-text-tertiary)] mono">
                  {formatTime(totalDuration)}
                </span>
              </div>

              <div className="flex items-center justify-center">
                <button
                  onClick={togglePlayPause}
                  disabled={!mergedAudioUrl}
                  className="w-14 h-14 bg-[var(--color-text)] text-[var(--color-bg)] flex items-center justify-center active:opacity-70 disabled:opacity-30"
                >
                  {isPlaying ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1"/>
                      <rect x="14" y="4" width="4" height="16" rx="1"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-1">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
              </div>

              {currentSegment && (
                <div className="text-center mt-2">
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {SPEAKER_NAMES[currentSegment.speaker] || currentSegment.speaker}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  )
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
