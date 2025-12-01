'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { FiVolume2, FiVolumeX, FiLoader, FiGlobe } from 'react-icons/fi'

// ============================================
// Types
// ============================================
type Language = 'en' | 'fr'
type VoiceGender = 'male' | 'female'

interface TTSState {
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  audioUrl: string | null
}

// ============================================
// Browser Speech Synthesis Helper
// ============================================
function useBrowserSpeech() {
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)

  const speak = useCallback((text: string, lang: Language) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return false
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
    utterance.rate = 0.9
    utterance.pitch = 1

    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices()
    const langCode = lang === 'fr' ? 'fr' : 'en'
    const voice = voices.find(v => v.lang.startsWith(langCode) && v.name.includes('Natural')) 
      || voices.find(v => v.lang.startsWith(langCode))
    
    if (voice) {
      utterance.voice = voice
    }

    speechRef.current = utterance
    window.speechSynthesis.speak(utterance)
    return true
  }, [])

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  return { speak, stop, isSupported }
}

// ============================================
// Main TTS Hook
// ============================================
export function useTextToSpeech(defaultLanguage: Language = 'en') {
  const [language, setLanguage] = useState<Language>(defaultLanguage)
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('male')
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isLoading: false,
    error: null,
    audioUrl: null,
  })
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const browserSpeech = useBrowserSpeech()

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    browserSpeech.stop()
    setState(prev => ({ ...prev, isPlaying: false }))
  }, [browserSpeech])

  const speak = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return

    // If already playing, stop
    if (state.isPlaying) {
      stopAudio()
      return
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Call API
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.substring(0, 5000),
          language,
          voice: voiceGender,
        }),
      })

      const data = await response.json()

      // If API suggests using browser TTS
      if (data.useBrowserTTS || !data.audioUrl) {
        console.log('[TTS] Using browser speech synthesis')
        
        if (browserSpeech.isSupported) {
          browserSpeech.speak(text, language)
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            isPlaying: true 
          }))

          // Set a timeout to reset playing state (estimate based on text length)
          const duration = Math.max(3000, text.length * 60)
          setTimeout(() => {
            setState(prev => ({ ...prev, isPlaying: false }))
          }, duration)
        } else {
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: 'Speech synthesis not supported' 
          }))
        }
        return
      }

      // Play audio URL
      const audioUrl = data.audioUrl

      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setState(prev => ({ ...prev, isPlaying: false }))
      }

      audio.onerror = (e) => {
        console.error('[TTS] Audio playback error:', e)
        // Fallback to browser TTS
        if (browserSpeech.isSupported) {
          browserSpeech.speak(text, language)
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            isPlaying: true 
          }))
          const duration = Math.max(3000, text.length * 60)
          setTimeout(() => {
            setState(prev => ({ ...prev, isPlaying: false }))
          }, duration)
        } else {
          setState(prev => ({ 
            ...prev, 
            isLoading: false,
            isPlaying: false,
            error: 'Failed to play audio' 
          }))
        }
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
      
      // Fallback to browser TTS
      if (browserSpeech.isSupported) {
        browserSpeech.speak(text, language)
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          isPlaying: true 
        }))
        const duration = Math.max(3000, text.length * 60)
        setTimeout(() => {
          setState(prev => ({ ...prev, isPlaying: false }))
        }, duration)
      } else {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: error.message 
        }))
      }
    }
  }, [language, voiceGender, state.isPlaying, stopAudio, browserSpeech])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      browserSpeech.stop()
    }
  }, [browserSpeech])

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

// ============================================
// Compact Speak Button
// ============================================
export function SpeakButton({ 
  text, 
  className = '',
  size = 'md',
  language: propLanguage,
  showLanguageToggle = false,
}: { 
  text: string
  className?: string 
  size?: 'sm' | 'md' | 'lg'
  language?: Language
  showLanguageToggle?: boolean
}) {
  const { speak, stopAudio, isPlaying, isLoading, language, setLanguage } = useTextToSpeech(propLanguage || 'en')

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
          className={`${sizeClasses[size]} flex items-center justify-center rounded-[var(--radius)] 
            border border-[var(--color-border)] text-[var(--color-text-tertiary)] 
            hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-light)]
            transition-colors text-[10px] font-medium uppercase`}
          title={`Switch to ${language === 'en' ? 'French' : 'English'}`}
        >
          {language.toUpperCase()}
        </button>
      )}
      <button
        onClick={() => isPlaying ? stopAudio() : speak(text)}
        disabled={isLoading || !text}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-[var(--radius)] 
          border border-[var(--color-border)] 
          ${isPlaying 
            ? 'bg-[var(--color-white)] text-[var(--color-black)] border-[var(--color-white)]' 
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border-light)]'
          }
          disabled:opacity-40 transition-colors`}
        title={isPlaying ? 'Stop' : 'Listen'}
      >
        {isLoading ? (
          <FiLoader className={`${iconSizes[size]} animate-spin`} strokeWidth={1.5} />
        ) : isPlaying ? (
          <FiVolumeX className={iconSizes[size]} strokeWidth={1.5} />
        ) : (
          <FiVolume2 className={iconSizes[size]} strokeWidth={1.5} />
        )}
      </button>
    </div>
  )
}

// ============================================
// Full TTS Panel (for settings)
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
    isPlaying, 
    isLoading 
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
        <div className="flex items-center gap-1 border border-[var(--color-border)] rounded-[var(--radius)] p-0.5">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-xs font-medium uppercase tracking-wider rounded-[var(--radius)] transition-colors
              ${language === 'en' 
                ? 'bg-[var(--color-white)] text-[var(--color-black)]' 
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('fr')}
            className={`px-2 py-1 text-xs font-medium uppercase tracking-wider rounded-[var(--radius)] transition-colors
              ${language === 'fr' 
                ? 'bg-[var(--color-white)] text-[var(--color-black)]' 
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
          >
            FR
          </button>
        </div>
      )}
      
      <button
        onClick={() => isPlaying ? stopAudio() : speak(text)}
        disabled={isLoading || !text}
        className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] border transition-colors
          ${isPlaying 
            ? 'bg-[var(--color-white)] text-[var(--color-black)] border-[var(--color-white)]' 
            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border-light)]'
          }
          disabled:opacity-40`}
      >
        {isLoading ? (
          <>
            <FiLoader className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">Loading...</span>
          </>
        ) : isPlaying ? (
          <>
            <FiVolumeX className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">Stop</span>
          </>
        ) : (
          <>
            <FiVolume2 className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-xs uppercase tracking-wider font-medium">Listen</span>
          </>
        )}
      </button>
    </div>
  )
}
