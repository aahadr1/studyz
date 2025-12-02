'use client'

import React, { useState, useRef, useEffect } from 'react'
import { FiVolume2, FiVolumeX, FiLoader, FiChevronDown, FiChevronUp } from 'react-icons/fi'

interface LessonSectionDisplayProps {
  title: string
  content: string
  audioUrl?: string | null
  pageNumber: number
  isLoading?: boolean
}

export default function LessonSectionDisplay({
  title,
  content,
  audioUrl,
  pageNumber,
  isLoading = false
}: LessonSectionDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAudioLoading, setIsAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Reset audio state when section changes
  useEffect(() => {
    stopAudio()
    setAudioError(null)
  }, [pageNumber, audioUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsPlaying(false)
  }

  const playAudio = async () => {
    if (!audioUrl) {
      setAudioError('Audio not available')
      return
    }

    if (isPlaying) {
      stopAudio()
      return
    }

    setIsAudioLoading(true)
    setAudioError(null)

    try {
      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setIsPlaying(false)
      }

      audio.onerror = () => {
        setAudioError('Failed to play audio')
        setIsPlaying(false)
        setIsAudioLoading(false)
      }

      audio.oncanplaythrough = () => {
        audio.play()
        setIsPlaying(true)
        setIsAudioLoading(false)
      }

      audio.load()
    } catch (error) {
      setAudioError('Failed to load audio')
      setIsAudioLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-surface border border-border p-4 mb-4 animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-elevated rounded" />
          <div className="h-5 bg-elevated rounded w-48" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-elevated rounded w-full" />
          <div className="h-4 bg-elevated rounded w-5/6" />
          <div className="h-4 bg-elevated rounded w-4/6" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border mb-4 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-elevated transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary uppercase tracking-wider mono">
            Section {pageNumber}
          </span>
          <h3 className="text-base font-medium text-text-primary">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {audioUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                playAudio()
              }}
              disabled={isAudioLoading}
              className={`w-8 h-8 flex items-center justify-center border transition-colors
                ${isPlaying 
                  ? 'bg-white text-black border-white' 
                  : 'border-border text-text-secondary hover:text-text-primary hover:border-text-tertiary'
                }
                disabled:opacity-40`}
              title={isPlaying ? 'Stop' : 'Listen'}
            >
              {isAudioLoading ? (
                <FiLoader className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : isPlaying ? (
                <FiVolumeX className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <FiVolume2 className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
          )}
          <button className="btn-ghost p-1">
            {isExpanded ? (
              <FiChevronUp className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <FiChevronDown className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border pt-4">
          <div className="prose prose-invert prose-sm max-w-none">
            {content.split('\n\n').map((paragraph, index) => (
              <p key={index} className="text-text-secondary text-sm leading-relaxed mb-3 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
          {audioError && (
            <p className="text-xs text-error mt-2">{audioError}</p>
          )}
          {!audioUrl && (
            <p className="text-xs text-text-tertiary mt-2 italic">
              Audio will be available soon...
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Skeleton loader for when section is being fetched
export function LessonSectionSkeleton() {
  return (
    <div className="bg-surface border border-border p-4 mb-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 bg-elevated rounded" />
        <div className="h-5 bg-elevated rounded w-48" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-elevated rounded w-full" />
        <div className="h-4 bg-elevated rounded w-5/6" />
        <div className="h-4 bg-elevated rounded w-4/6" />
      </div>
    </div>
  )
}

// Empty state when no section exists
export function LessonSectionEmpty({ pageNumber }: { pageNumber: number }) {
  return (
    <div className="bg-surface border border-border p-4 mb-4">
      <div className="text-center py-4">
        <p className="text-text-tertiary text-sm">
          No lesson section for page {pageNumber}
        </p>
        <p className="text-text-tertiary text-xs mt-1">
          Generate the lesson to create sections for all pages
        </p>
      </div>
    </div>
  )
}

