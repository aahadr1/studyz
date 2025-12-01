'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { FiVolume2, FiVolumeX, FiLoader, FiGlobe } from 'react-icons/fi'

type Language = 'en' | 'fr'
type VoiceGender = 'male' | 'female'

interface TextToSpeechProps {
  text: string
  className?: string
  compact?: boolean
  showLanguageSelector?: boolean
  defaultLanguage?: Language
  onLanguageChange?: (lang: Language) => void
}

interface TTSState {
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  audioUrl: string | null
}

export function useTextToSpeech() {
  const [language, setLanguage] = useState<Language>('en')
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('male')
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isLoading: false,
    error: null,
    audioUrl: null,
  })
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentTextRef = useRef<string>('')

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setState(prev => ({ ...prev, isPlaying: false }))
  }, [])

  const speak = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return

    // If same text is playing, toggle pause/play
    if (currentTextRef.current === text && audioRef.current) {
      if (state.isPlaying) {
        audioRef.current.pause()
        setState(prev => ({ ...prev, isPlaying: false }))
        return
      } else if (state.audioUrl) {
        audioRef.current.play()
        setState(prev => ({ ...prev, isPlaying: true }))
        return
      }
    }

    // Stop any current playback
    stopAudio()
    currentTextRef.current = text

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          voice: voiceGender,
          speed: 1,
          emotion: 'auto',
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate speech')
      }

      const { audioUrl } = await response.json()

      // Create and play audio
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      audio.onended = () => {
        setState(prev => ({ ...prev, isPlaying: false }))
      }
      
      audio.onerror = () => {
        setState(prev => ({ 
          ...prev, 
          isPlaying: false, 
          error: 'Failed to play audio' 
        }))
      }

      await audio.play()
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        isPlaying: true,
        audioUrl 
      }))

    } catch (error: any) {
      console.error('[TTS] Error:', error)
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }))
    }
  }, [language, voiceGender, state.isPlaying, state.audioUrl, stopAudio])

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
    language,
    setLanguage,
    voiceGender,
    setVoiceGender,
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    error: state.error,
  }
}

// Compact speak button
export function SpeakButton({ 
  text, 
  className = '',
  size = 'md',
  language = 'en',
  showLabel = false,
}: { 
  text: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  language?: Language
  showLabel?: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleClick = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language, voice: 'male' }),
      })

      if (!response.ok) throw new Error('Failed')

      const { audioUrl } = await response.json()
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => setIsPlaying(false)

      await audio.play()
      setIsPlaying(true)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading || !text}
      className={`${sizes[size]} border border-[var(--color-border)] flex items-center justify-center gap-2 transition-colors disabled:opacity-30 ${
        isPlaying ? 'bg-[var(--color-text)] text-[var(--color-bg)]' : 'active:bg-[var(--color-surface)]'
      } ${className}`}
      title={isPlaying ? 'Stop' : `Speak (${language === 'fr' ? 'French' : 'English'})`}
    >
      {isLoading ? (
        <FiLoader className={`${iconSizes[size]} animate-spin`} strokeWidth={1.5} />
      ) : isPlaying ? (
        <FiVolumeX className={iconSizes[size]} strokeWidth={1.5} />
      ) : (
        <FiVolume2 className={iconSizes[size]} strokeWidth={1.5} />
      )}
      {showLabel && <span className="text-xs">{isPlaying ? 'Stop' : 'Listen'}</span>}
    </button>
  )
}

// Full TTS control panel
export default function TextToSpeech({ 
  text, 
  className = '',
  compact = false,
  showLanguageSelector = true,
  defaultLanguage = 'en',
  onLanguageChange,
}: TextToSpeechProps) {
  const { 
    speak, 
    stopAudio,
    language, 
    setLanguage,
    isPlaying, 
    isLoading, 
    error 
  } = useTextToSpeech()

  useEffect(() => {
    setLanguage(defaultLanguage)
  }, [defaultLanguage, setLanguage])

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    stopAudio()
    onLanguageChange?.(lang)
  }

  const handleSpeak = () => {
    speak(text)
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showLanguageSelector && (
          <div className="flex border border-[var(--color-border)]">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-2 py-1 text-[10px] uppercase tracking-wider ${
                language === 'en' 
                  ? 'bg-[var(--color-text)] text-[var(--color-bg)]' 
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageChange('fr')}
              className={`px-2 py-1 text-[10px] uppercase tracking-wider border-l border-[var(--color-border)] ${
                language === 'fr' 
                  ? 'bg-[var(--color-text)] text-[var(--color-bg)]' 
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              FR
            </button>
          </div>
        )}
        <button
          onClick={handleSpeak}
          disabled={isLoading || !text}
          className={`w-10 h-10 border border-[var(--color-border)] flex items-center justify-center transition-colors disabled:opacity-30 ${
            isPlaying ? 'bg-[var(--color-text)] text-[var(--color-bg)]' : 'active:bg-[var(--color-surface)]'
          }`}
        >
          {isLoading ? (
            <FiLoader className="w-5 h-5 animate-spin" strokeWidth={1.5} />
          ) : isPlaying ? (
            <FiVolumeX className="w-5 h-5" strokeWidth={1.5} />
          ) : (
            <FiVolume2 className="w-5 h-5" strokeWidth={1.5} />
          )}
        </button>
      </div>
    )
  }

  return (
    <div className={`border border-[var(--color-border)] p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FiVolume2 className="w-4 h-4 text-[var(--color-text-secondary)]" strokeWidth={1.5} />
          <span className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
            Text to Speech
          </span>
        </div>
        
        {showLanguageSelector && (
          <div className="flex items-center gap-1">
            <FiGlobe className="w-3 h-3 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            <div className="flex border border-[var(--color-border)]">
              <button
                onClick={() => handleLanguageChange('en')}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
                  language === 'en' 
                    ? 'bg-[var(--color-text)] text-[var(--color-bg)]' 
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                }`}
              >
                English
              </button>
              <button
                onClick={() => handleLanguageChange('fr')}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider border-l border-[var(--color-border)] transition-colors ${
                  language === 'fr' 
                    ? 'bg-[var(--color-text)] text-[var(--color-bg)]' 
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                }`}
              >
                Français
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSpeak}
        disabled={isLoading || !text}
        className={`w-full h-12 flex items-center justify-center gap-2 font-medium text-sm uppercase tracking-wider transition-colors disabled:opacity-30 ${
          isPlaying 
            ? 'bg-[var(--color-text)] text-[var(--color-bg)]' 
            : 'border border-[var(--color-border)] active:bg-[var(--color-surface)]'
        }`}
      >
        {isLoading ? (
          <>
            <FiLoader className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            Generating...
          </>
        ) : isPlaying ? (
          <>
            <FiVolumeX className="w-5 h-5" strokeWidth={1.5} />
            Stop
          </>
        ) : (
          <>
            <FiVolume2 className="w-5 h-5" strokeWidth={1.5} />
            Listen {language === 'fr' ? '(Français)' : '(English)'}
          </>
        )}
      </button>

      {error && (
        <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>
      )}
    </div>
  )
}

