'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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

// WAV constants (must match TTS output: 24kHz, 16-bit, mono)
const SAMPLE_RATE = 24000
const BYTES_PER_SAMPLE = 2
const NUM_CHANNELS = 1
const BITS_PER_SAMPLE = 16
const WAV_HEADER_SIZE = 44

interface SegmentTimeRange {
  start: number // seconds offset in the merged audio
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
  const [showTranscript, setShowTranscript] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)

  // Merged audio state
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null)
  const [segmentRanges, setSegmentRanges] = useState<SegmentTimeRange[]>([])
  const [isLoadingAudio, setIsLoadingAudio] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const currentSegment = podcast.segments[currentSegmentIndex]
  const currentChapter = podcast.chapters.find(
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
        // Fetch all segment audio in parallel (batched to avoid overwhelming the browser)
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
              // Strip the 44-byte WAV header to get raw PCM
              const pcm = buf.slice(WAV_HEADER_SIZE)
              pcmChunks.push(pcm)
              const durationSec = pcm.byteLength / (SAMPLE_RATE * BYTES_PER_SAMPLE * NUM_CHANNELS)
              ranges.push({ start: currentOffset, end: currentOffset + durationSec })
              currentOffset += durationSec
            } else {
              // Empty or failed segment: insert tiny silence (0.1s)
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

        // Concatenate all PCM into one WAV
        const totalPcmBytes = pcmChunks.reduce((sum, c) => sum + c.byteLength, 0)
        const wavBuffer = new ArrayBuffer(WAV_HEADER_SIZE + totalPcmBytes)
        const view = new DataView(wavBuffer)
        const bytes = new Uint8Array(wavBuffer)

        // Write WAV header
        writeString(view, 0, 'RIFF')
        view.setUint32(4, 36 + totalPcmBytes, true)
        writeString(view, 8, 'WAVE')
        writeString(view, 12, 'fmt ')
        view.setUint32(16, 16, true) // chunk size
        view.setUint16(20, 1, true)  // PCM format
        view.setUint16(22, NUM_CHANNELS, true)
        view.setUint32(24, SAMPLE_RATE, true)
        view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE, true) // byte rate
        view.setUint16(32, NUM_CHANNELS * BYTES_PER_SAMPLE, true) // block align
        view.setUint16(34, BITS_PER_SAMPLE, true)
        writeString(view, 36, 'data')
        view.setUint32(40, totalPcmBytes, true)

        // Copy PCM data
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

    return () => {
      cancelled = true
    }
  }, [podcast.segments])

  // Clean up blob URL on unmount or when it changes
  useEffect(() => {
    return () => {
      if (mergedAudioUrl) {
        URL.revokeObjectURL(mergedAudioUrl)
      }
    }
  }, [mergedAudioUrl])

  // Set merged audio as source when ready
  useEffect(() => {
    if (audioRef.current && mergedAudioUrl) {
      audioRef.current.src = mergedAudioUrl
      audioRef.current.playbackRate = playbackRate
    }
  }, [mergedAudioUrl])

  // ─── Segment tracking from continuous playback time ──────────────────────

  const findSegmentAtTime = useCallback((time: number): number => {
    if (segmentRanges.length === 0) return 0
    for (let i = segmentRanges.length - 1; i >= 0; i--) {
      if (time >= segmentRanges[i].start) return i
    }
    return 0
  }, [segmentRanges])

  // Auto-scroll transcript to current segment
  const scrollToSegment = useCallback((index: number) => {
    const el = segmentRefs.current.get(index)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // ─── Controls ────────────────────────────────────────────────────────────

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
    if (currentSegmentIndex < segmentRanges.length - 1) {
      const nextIdx = currentSegmentIndex + 1
      seekToSegment(nextIdx)
    }
  }

  const previousSegment = () => {
    if (currentSegmentIndex > 0) {
      seekToSegment(currentSegmentIndex - 1)
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

  const handleInterrupt = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    if (currentSegment) {
      onInterrupt(currentSegment.id, currentTime)
    }
  }

  // ─── Audio event handlers ────────────────────────────────────────────────

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

  const handleEnded = () => {
    setIsPlaying(false)
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Hidden audio element — plays the single merged blob */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
      />

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

      {/* Loading overlay */}
      {isLoadingAudio && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400 mb-2">Preparing audio...</p>
            <div className="w-48 mx-auto bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-[width] duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">{loadProgress}% loaded</p>
          </div>
        </div>
      )}

      {/* Main content area (shown after audio is loaded) */}
      {!isLoadingAudio && (
        <>
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
                    const segTime = segmentRanges[idx]

                    return (
                      <div
                        key={segment.id}
                        ref={(el) => {
                          if (el) segmentRefs.current.set(idx, el)
                        }}
                        onClick={() => seekToSegment(idx)}
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
                              <span className="text-xs text-gray-500">
                                {segTime ? formatTime(segTime.start) : formatTime(segment.timestamp)}
                              </span>
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
                    onClick={() => seekToTime(chapter.startTime)}
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
            {/* Progress bar */}
            <div className="mb-4">
              <input
                type="range"
                min="0"
                max={totalDuration}
                step="0.1"
                value={currentTime}
                onChange={(e) => seekToTime(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(totalDuration)}</span>
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
                  disabled={!mergedAudioUrl}
                  className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center text-2xl"
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
                  disabled={!currentSegment?.isQuestionBreakpoint}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    currentSegment?.isQuestionBreakpoint
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
