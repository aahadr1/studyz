'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { FiPlay, FiPause, FiDownload } from 'react-icons/fi'

interface AudioPlayerProps {
  src: string
  downloadFilename?: string
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2]

export default function AudioPlayer({ src, downloadFilename = 'audio.mp3' }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [isDragging, setIsDragging] = useState(false)

  // Update progress bar
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateProgress = () => {
      if (!isDragging && audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setProgress(0)
    }

    audio.addEventListener('timeupdate', updateProgress)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateProgress)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [isDragging])

  // Apply speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const progressBar = progressRef.current
    if (!audio || !progressBar || !audio.duration) return

    const rect = progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100))
    
    audio.currentTime = (percentage / 100) * audio.duration
    setProgress(percentage)
  }, [])

  const handleProgressDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    handleProgressClick(e)
  }, [isDragging, handleProgressClick])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    handleProgressClick(e)
  }, [handleProgressClick])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Global mouse up handler for dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  const cycleSpeed = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed)
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length
    setSpeed(SPEED_OPTIONS[nextIndex])
  }, [speed])

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Player UI */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 flex items-center justify-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full hover:from-indigo-700 hover:to-purple-700 transition-all flex-shrink-0"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <FiPause className="w-4 h-4" />
          ) : (
            <FiPlay className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Progress Bar */}
        <div
          ref={progressRef}
          className="flex-1 h-3 bg-elevated rounded-full cursor-pointer relative group"
          onClick={handleProgressClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleProgressDrag}
          onMouseUp={handleMouseUp}
        >
          {/* Background track */}
          <div className="absolute inset-0 bg-border rounded-full" />
          
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
          
          {/* Draggable handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 8px)` }}
          />
          
          {/* Hover preview area - makes it easier to click */}
          <div className="absolute inset-0 -top-2 -bottom-2" />
        </div>

        {/* Speed Control */}
        <button
          onClick={cycleSpeed}
          className="px-2 py-1 text-xs font-medium mono bg-elevated border border-border rounded hover:bg-surface transition-colors flex-shrink-0 min-w-[44px]"
          title="Change playback speed"
        >
          {speed}x
        </button>

        {/* Download Button */}
        <a
          href={src}
          download={downloadFilename}
          className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-elevated rounded transition-colors flex-shrink-0"
          title="Download audio"
        >
          <FiDownload className="w-4 h-4" />
        </a>
      </div>
    </div>
  )
}

