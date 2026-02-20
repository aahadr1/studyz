'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { GeminiLiveClient, ConversationContext, buildPodcastQASystemInstruction } from '@/lib/intelligent-podcast/gemini-live-client'
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

interface QATranscriptEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type QAState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'

export default function MobilePodcastPage() {
  const params = useParams()
  const router = useRouter()
  const podcastId = params.id as string

  const [podcast, setPodcast] = useState<IntelligentPodcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // Q&A state - inline, no overlay
  const [qaState, setQAState] = useState<QAState>('idle')
  const [qaTranscript, setQATranscript] = useState<QATranscriptEntry[]>([])
  const [qaError, setQAError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const progressRef = useRef<HTMLDivElement>(null)
  const qaTranscriptEndRef = useRef<HTMLDivElement>(null)
  const qaClientRef = useRef<GeminiLiveClient | null>(null)
  const qaTimestampRef = useRef<number>(0)
  const qaSegmentIdRef = useRef<string>('')
  const pendingTranscriptRef = useRef<string>('')

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

  // Segment tracking
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

  // Player controls
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

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75]
    const currentIdx = rates.indexOf(playbackRate)
    const nextRate = rates[(currentIdx + 1) % rates.length]
    setPlaybackRate(nextRate)
    if (audioRef.current) audioRef.current.playbackRate = nextRate
  }

  // Audio events
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

  // Q&A Functions
  const startQA = async () => {
    if (!podcast || qaState !== 'idle') return

    const currentSegment = podcast.segments[currentSegmentIndex]
    if (!currentSegment) return

    // Capture current state
    qaTimestampRef.current = currentTime
    qaSegmentIdRef.current = currentSegment.id

    // Pause podcast
    if (audioRef.current && isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    }

    setQAState('connecting')
    setQATranscript([])
    setQAError(null)
    setPermissionDenied(false)
    pendingTranscriptRef.current = ''

    try {
      // Fetch context
      const response = await fetch(`/api/intelligent-podcast/${podcastId}/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentSegmentId: qaSegmentIdRef.current, 
          currentTimestamp: qaTimestampRef.current 
        }),
      })

      if (!response.ok) throw new Error('Failed to fetch context')

      const { context, systemInstruction, suggestedVoice, introductionPrompt } = await response.json()

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
      if (!apiKey) throw new Error('Gemini API key not configured')

      const client = new GeminiLiveClient({
        apiKey,
        systemInstruction,
        voice: suggestedVoice,
        onTranscript: (text, role, isFinal) => {
          if (role === 'model') {
            if (isFinal) {
              setQATranscript(prev => {
                const filtered = prev.filter(e => e.id !== 'pending-assistant')
                return [...filtered, {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  text,
                }]
              })
              pendingTranscriptRef.current = ''
            } else {
              pendingTranscriptRef.current += text
              setQATranscript(prev => {
                const existing = prev.find(e => e.id === 'pending-assistant')
                if (existing) {
                  return prev.map(e => 
                    e.id === 'pending-assistant' ? { ...e, text: pendingTranscriptRef.current } : e
                  )
                }
                return [...prev, {
                  id: 'pending-assistant',
                  role: 'assistant',
                  text: pendingTranscriptRef.current,
                }]
              })
            }
          } else if (role === 'user' && isFinal) {
            setQATranscript(prev => [...prev, {
              id: `user-${Date.now()}`,
              role: 'user',
              text,
            }])
          }
        },
        onAudioChunk: () => {},
        onError: (err) => {
          console.error('[QA] Error:', err)
          if (err.message.includes('Permission denied') || err.message.includes('NotAllowedError')) {
            setPermissionDenied(true)
          }
          setQAError(err.message)
          setQAState('error')
        },
        onConnectionChange: (connected) => {
          if (!connected && qaState !== 'idle') {
            setQAState('idle')
          }
        },
        onModelSpeaking: (speaking) => {
          if (speaking) {
            setQAState('speaking')
            pendingTranscriptRef.current = ''
          } else {
            setQAState('listening')
          }
        },
        onReady: () => {
          setQAState('listening')
          // Send greeting via voice-only (no transcript entry) as soon as connection is ready
          client.sendVoiceOnlyGreeting(introductionPrompt ||
            (podcast.language === 'fr'
              ? "[L'auditeur vient d'appuyer sur le bouton. Salue-le brièvement et dis-lui que tu l'écoutes.]"
              : "[The listener just pressed the button. Greet them briefly and tell them you're listening.]"
            )
          )
        },
      })

      qaClientRef.current = client

      await client.connect({
        podcastTitle: context.podcastTitle,
        recentTranscript: context.recentTranscript || '',
        currentTopic: context.currentTopic || '',
        language: context.language,
      })

    } catch (err: any) {
      console.error('[QA] Connection error:', err)
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setPermissionDenied(true)
      }
      setQAError(err.message || 'Failed to connect')
      setQAState('error')
    }
  }

  const stopQA = async () => {
    if (qaClientRef.current) {
      await qaClientRef.current.disconnect()
      qaClientRef.current = null
    }
    
    setQAState('idle')
    setQATranscript([])
    setQAError(null)
    setPermissionDenied(false)

    // Reload audio to reset pipeline (anti-muffling)
    if (audioRef.current && mergedAudioUrl) {
      const wasPlaying = false // Don't auto-resume, user must tap play
      const savedTime = audioRef.current.currentTime
      audioRef.current.src = mergedAudioUrl
      audioRef.current.currentTime = savedTime
      if (wasPlaying) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
      }
    }
  }

  // Cleanup Q&A client on unmount
  useEffect(() => {
    return () => {
      if (qaClientRef.current) {
        qaClientRef.current.disconnect()
        qaClientRef.current = null
      }
    }
  }, [])

  // Auto-scroll Q&A transcript
  useEffect(() => {
    if (qaState !== 'idle' && qaTranscriptEndRef.current) {
      qaTranscriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [qaTranscript, qaState])

  // Helpers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const currentSegment = podcast?.segments[currentSegmentIndex]
  const currentTopic = podcast?.chapters.find(
    ch => currentTime >= ch.startTime && currentTime <= ch.endTime
  )

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  const getQAStateMessage = () => {
    switch (qaState) {
      case 'connecting':
        return podcast?.language === 'fr' ? 'Connexion...' : 'Connecting...'
      case 'listening':
        return podcast?.language === 'fr' ? 'Je t\'écoute...' : 'I\'m listening...'
      case 'speaking':
        return podcast?.language === 'fr' ? 'En train de répondre...' : 'Speaking...'
      case 'error':
        return podcast?.language === 'fr' ? 'Erreur' : 'Error'
      default:
        return ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-6">
        <div className="text-center">
          <p className="text-text-primary mb-4">{error || 'Podcast not found'}</p>
          <Link href="/m" className="btn-primary px-6 py-3">
            Go back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-text-primary overflow-hidden">
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
          <div className="flex items-center justify-between px-4 h-14 border-b border-border flex-shrink-0">
            <Link href="/m" className="btn-ghost p-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <h1 className="text-sm font-medium text-text-primary truncate mx-3 flex-1">
              {podcast.title}
            </h1>
          </div>

          {/* Scrollable content */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto pb-32">
            {/* Podcast header */}
            <div className="px-4 py-4 border-b border-border bg-elevated">
              <h2 className="text-base font-semibold mb-2 text-text-primary">{podcast.title}</h2>
              <p className="text-sm text-text-secondary leading-relaxed">{podcast.description}</p>
              {currentTopic && (
                <div className="mt-3 flex items-center gap-2 p-2 bg-surface border border-border rounded-lg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent flex-shrink-0">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Now</span>
                  <span className="text-sm text-text-primary">{currentTopic.title}</span>
                </div>
              )}
            </div>

            {/* Segments */}
            <div className="px-4 py-3">
              {podcast.segments.map((segment, idx) => {
                const isActive = idx === currentSegmentIndex
                const speakerName = SPEAKER_NAMES[segment.speaker] || segment.speaker
                const speakerColor = SPEAKER_TEXT_COLORS[segment.speaker] || 'text-text-secondary'
                const segTime = segmentRanges[idx]

                const topicTransition = podcast.chapters.find(ch => {
                  if (!segTime || idx === 0) return false
                  return Math.abs(ch.startTime - segTime.start) < 2
                })

                return (
                  <div key={segment.id}>
                    {topicTransition && (
                      <div className="flex items-center gap-3 py-2 my-2">
                        <div className="flex-1 border-t border-border/50" />
                        <span className="text-xs text-text-muted flex-shrink-0">{topicTransition.title}</span>
                        <div className="flex-1 border-t border-border/50" />
                      </div>
                    )}
                    <div
                      ref={(el) => { if (el) segmentRefs.current.set(idx, el) }}
                      onClick={() => seekToSegment(idx)}
                      className={`flex gap-2 py-2 px-2 -mx-2 rounded-lg transition-all ${
                        isActive ? 'bg-elevated' : 'active:bg-surface'
                      }`}
                    >
                      <span className="text-xs text-text-muted mono w-10 flex-shrink-0 pt-0.5 text-right">
                        {segTime ? formatTime(segTime.start) : formatTime(segment.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${speakerColor}`}>{speakerName}</span>
                        <p className={`text-sm leading-relaxed mt-0.5 ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
                          {segment.text}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom player bar / Q&A panel */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background flex-shrink-0 z-50">
            {qaState === 'idle' ? (
              // Normal player controls
              <>
                {/* Progress bar */}
                <div
                  ref={progressRef}
                  onClick={handleProgressClick}
                  className="h-1 bg-elevated cursor-pointer relative"
                >
                  <div
                    className="h-full bg-text-primary transition-[width] duration-100"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                {/* Controls */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted mono">{formatTime(currentTime)}</span>
                      <span className="text-xs text-text-muted">/</span>
                      <span className="text-xs text-text-muted mono">{formatTime(totalDuration)}</span>
                    </div>
                    <button
                      onClick={cyclePlaybackRate}
                      className="btn-ghost text-xs mono px-2 py-1"
                    >
                      {playbackRate}x
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    {/* Ask Question button */}
                    <button
                      onClick={startQA}
                      disabled={!mergedAudioUrl || isLoadingAudio}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent border border-accent/20 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                      <span className="text-xs font-medium">
                        {podcast.language === 'fr' ? 'Poser une question' : 'Ask a question'}
                      </span>
                    </button>

                    {/* Playback controls */}
                    <div className="flex items-center gap-3 flex-shrink-0">
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
                        className="w-12 h-12 rounded-full bg-text-primary text-background flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
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
                  </div>

                  {currentSegment && (
                    <div className="mt-2 text-center">
                      <span className="text-xs text-text-muted">
                        {SPEAKER_NAMES[currentSegment.speaker] || currentSegment.speaker}
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Q&A panel
              <div className="px-4 py-3 max-h-[50vh] flex flex-col">
                {/* Q&A status bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`relative ${qaState === 'speaking' ? 'opacity-50' : ''}`}>
                      <div className="w-10 h-10 rounded-full bg-elevated border border-border flex items-center justify-center">
                        <svg 
                          width="16" height="16" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="1.5" 
                          className={qaState === 'listening' ? 'text-accent' : 'text-text-secondary'}
                        >
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                      </div>
                      {qaState === 'listening' && (
                        <div className="absolute inset-0 rounded-full border-2 border-accent animate-ping opacity-30" />
                      )}
                    </div>
                    <span className="text-sm text-text-secondary">{getQAStateMessage()}</span>
                  </div>

                  <button
                    onClick={stopQA}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {podcast.language === 'fr' ? 'Reprendre' : 'Resume'}
                  </button>
                </div>

                {/* Error state */}
                {qaState === 'error' && (
                  <div className="mb-3 p-3 bg-error-muted border border-error/20 rounded-lg">
                    <p className="text-sm text-error mb-2">
                      {permissionDenied 
                        ? (podcast.language === 'fr' ? 'Accès au micro refusé' : 'Microphone access denied')
                        : qaError
                      }
                    </p>
                    <button onClick={startQA} className="text-xs text-error hover:underline">
                      {podcast.language === 'fr' ? 'Réessayer' : 'Try again'}
                    </button>
                  </div>
                )}

                {/* Q&A transcript (compact, scrollable) */}
                {qaState !== 'error' && (
                  <div className="flex-1 overflow-y-auto space-y-2 max-h-60 mb-3">
                    {qaTranscript.length === 0 && qaState === 'connecting' && (
                      <div className="text-center py-6">
                        <div className="spinner spinner-sm mx-auto mb-2" />
                        <p className="text-xs text-text-muted">
                          {podcast.language === 'fr' ? 'Connexion...' : 'Connecting...'}
                        </p>
                      </div>
                    )}

                    {qaTranscript.map((entry) => (
                      <div key={entry.id} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                            entry.role === 'user'
                              ? 'bg-accent text-white rounded-br-sm'
                              : 'bg-elevated border border-border rounded-bl-sm text-text-primary'
                          }`}
                        >
                          {entry.text}
                        </div>
                      </div>
                    ))}
                    <div ref={qaTranscriptEndRef} />
                  </div>
                )}

                {/* Tip */}
                {qaState !== 'error' && (
                  <div className="text-xs text-text-muted text-center">
                    {podcast.language === 'fr' 
                      ? 'Parle naturellement, je t\'écoute...'
                      : 'Speak naturally, I\'m listening...'
                    }
                  </div>
                )}
              </div>
            )}
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
