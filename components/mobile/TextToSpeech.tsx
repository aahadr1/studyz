'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { FiVolume2, FiVolumeX, FiLoader, FiPlay, FiPause } from 'react-icons/fi'

// ============================================
// Types
// ============================================
type Language = 'en' | 'fr'
type VoiceGender = 'male' | 'female'

interface TTSState {
  isPlaying: boolean
  isPaused: boolean
  isLoading: boolean
  error: string | null
}

// ============================================
// TTS Hook
// ============================================
export function useTextToSpeech(defaultLanguage: Language = 'en') {
  const [language, setLanguage] = useState<Language>(defaultLanguage)
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('male')
  const [speed, setSpeed] = useState<number>(1.3)
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    error: null,
  })
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const synthSpeedRef = useRef<number>(1.3)

  // Keep settings language in sync with provided defaultLanguage (e.g. when parent toggles EN/FR)
  useEffect(() => {
    setLanguage(defaultLanguage)
  }, [defaultLanguage])

  // Real-time playback speed updates
  useEffect(() => {
    if (audioRef.current) {
      const base = synthSpeedRef.current || 1
      audioRef.current.playbackRate = speed / base
    }
  }, [speed])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setState(prev => ({ ...prev, isPlaying: false, isPaused: false }))
  }, [])

  const pauseAudio = useCallback(() => {
    if (!audioRef.current) return
    try {
      audioRef.current.pause()
    } catch {}
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }))
  }, [])

  const resumeAudio = useCallback(() => {
    if (!audioRef.current) return
    try {
      audioRef.current.play()
      setState(prev => ({ ...prev, isPlaying: true, isPaused: false }))
    } catch {}
  }, [])

  const speak = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return

    // If already playing, pause (so user can resume)
    if (state.isPlaying) {
      pauseAudio()
      return
    }

    // If paused, resume (do not regenerate)
    if (state.isPaused) {
      resumeAudio()
      return
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const requestedSpeed = speed
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.substring(0, 10000),
          language,
          voice: voiceGender,
          speed: requestedSpeed,
          emotion: 'auto',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'TTS request failed')
      }

      if (!data.audioUrl) {
        throw new Error('No audio URL returned')
      }

      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const audio = new Audio(data.audioUrl)
      audioRef.current = audio
      synthSpeedRef.current = Number(data?.speed) || requestedSpeed

      audio.onended = () => {
        setState(prev => ({ ...prev, isPlaying: false, isPaused: false }))
      }

      audio.onerror = (e) => {
        console.error('[TTS] Audio error:', e)
        setState(prev => ({ 
          ...prev, 
          isLoading: false,
          isPlaying: false,
          isPaused: false,
          error: 'Failed to play audio' 
        }))
      }

      audio.oncanplaythrough = () => {
        try {
          const base = synthSpeedRef.current || requestedSpeed || 1
          audio.playbackRate = speed / base
        } catch {}
        audio.play()
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          isPlaying: true,
          isPaused: false,
        }))
      }

      // Start loading the audio
      audio.load()

    } catch (error: any) {
      console.error('[TTS] Error:', error)
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }))
    }
  }, [language, voiceGender, speed, state.isPlaying, state.isPaused, pauseAudio, resumeAudio, stopAudio])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return {
    speak,
    stopAudio,
    pauseAudio,
    resumeAudio,
    language,
    setLanguage,
    voiceGender,
    setVoiceGender,
    speed,
    setSpeed,
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    isPaused: state.isPaused,
    error: state.error,
  }
}

// ============================================
// Compact Speak Button
// ============================================
export function SpeakButton({ 
  text, 
  className = '',
  size = 'md',
  language: propLanguage,
  showLanguageToggle = false,
  speed: propSpeed,
}: { 
  text: string
  className?: string 
  size?: 'sm' | 'md' | 'lg'
  language?: Language
  showLanguageToggle?: boolean
  speed?: number
}) {
  const { speak, stopAudio, pauseAudio, isPlaying, isPaused, isLoading, language, setLanguage, setSpeed } = useTextToSpeech(propLanguage || 'en')

  useEffect(() => {
    if (typeof propSpeed === 'number' && Number.isFinite(propSpeed)) setSpeed(propSpeed)
  }, [propSpeed, setSpeed])

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {showLanguageToggle && (
        <button
          onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
          className={`${sizeClasses[size]} flex items-center justify-center rounded-[var(--radius,0)] 
            border border-[var(--color-border,#262626)] text-[var(--color-text-tertiary,#525252)] 
            hover:text-[var(--color-text-secondary,#a3a3a3)] hover:border-[var(--color-border-light,#363636)]
            transition-colors text-[10px] font-medium uppercase`}
          title={`Switch to ${language === 'en' ? 'French' : 'English'}`}
        >
          {language.toUpperCase()}
        </button>
      )}
      <button
        onClick={() => (isPlaying ? pauseAudio() : speak(text))}
        disabled={isLoading || !text}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-[var(--radius,0)] 
          border border-[var(--color-border,#262626)] 
          ${isPlaying 
            ? 'bg-white text-black border-white' 
            : 'text-[var(--color-text-secondary,#a3a3a3)] hover:text-[var(--color-text,#fff)] hover:border-[var(--color-border-light,#363636)]'
          }
          disabled:opacity-40 transition-colors`}
        title={isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Listen'}
      >
        {isLoading ? (
          <FiLoader className={`${iconSizes[size]} animate-spin`} strokeWidth={1.5} />
        ) : isPlaying ? (
          <FiPause className={iconSizes[size]} strokeWidth={1.5} />
        ) : isPaused ? (
          <FiPlay className={iconSizes[size]} strokeWidth={1.5} />
        ) : (
          <FiVolume2 className={iconSizes[size]} strokeWidth={1.5} />
        )}
      </button>
    </div>
  )
}

// ============================================
// Full TTS Panel
// ============================================
export default function TextToSpeech({ 
  text,
  showLanguageSelector = true,
  compact = false,
}: { 
  text: string
  showLanguageSelector?: boolean
  compact?: boolean
}) {
  const { 
    speak, 
    stopAudio, 
    language, 
    setLanguage, 
    speed,
    setSpeed,
    isPlaying, 
    isPaused,
    isLoading,
    error 
  } = useTextToSpeech()

  if (compact) {
    return (
      <SpeakButton 
        text={text} 
        language={language}
        showLanguageToggle={showLanguageSelector}
      />
    )
  }

  return (
    <div className="flex items-center gap-2">
      {showLanguageSelector && (
        <div className="flex items-center gap-1 border border-[var(--color-border,#262626)] p-0.5">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-xs font-medium uppercase tracking-wider transition-colors
              ${language === 'en' 
                ? 'bg-white text-black' 
                : 'text-[var(--color-text-tertiary,#525252)] hover:text-[var(--color-text-secondary,#a3a3a3)]'
              }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('fr')}
            className={`px-2 py-1 text-xs font-medium uppercase tracking-wider transition-colors
              ${language === 'fr' 
                ? 'bg-white text-black' 
                : 'text-[var(--color-text-tertiary,#525252)] hover:text-[var(--color-text-secondary,#a3a3a3)]'
              }`}
          >
            FR
          </button>
        </div>
      )}
      
      <button
        onClick={() => speak(text)}
        disabled={isLoading || !text}
        className={`flex items-center gap-2 px-3 py-2 border transition-colors
          ${isPlaying 
            ? 'bg-white text-black border-white' 
            : 'border-[var(--color-border,#262626)] text-[var(--color-text-secondary,#a3a3a3)] hover:text-[var(--color-text,#fff)] hover:border-[var(--color-border-light,#363636)]'
          }
          disabled:opacity-40`}
      >
        {isLoading ? (
          <>
            <FiLoader className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">{language === 'fr' ? 'Chargement...' : 'Loading...'}</span>
          </>
        ) : isPlaying ? (
          <>
            <FiVolumeX className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">{language === 'fr' ? 'Pause' : 'Pause'}</span>
          </>
        ) : isPaused ? (
          <>
            <FiPlay className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">{language === 'fr' ? 'Reprendre' : 'Resume'}</span>
          </>
        ) : (
          <>
            <FiVolume2 className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">{language === 'fr' ? 'Écouter' : 'Listen'}</span>
          </>
        )}
      </button>

      {/* Speed slider */}
      <div className="flex items-center gap-2 border border-[var(--color-border,#262626)] px-2 py-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary,#525252)]">
          {language === 'fr' ? 'Vitesse' : 'Speed'}
        </span>
        <input
          type="range"
          min={0.5}
          max={2.5}
          step={0.05}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-28"
        />
        <span className="text-[10px] mono text-[var(--color-text-secondary,#a3a3a3)] min-w-[44px] text-right">
          {speed.toFixed(2)}x
        </span>
      </div>
      
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  )
}
