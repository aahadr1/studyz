'use client'

import { useState, useCallback, useEffect } from 'react'
import { FiRotateCcw, FiCheck, FiX, FiMinus, FiPlus } from 'react-icons/fi'
import FlashcardCard from './FlashcardCard'
import type { FlashcardCardWithReview, ReviewQuality, SessionSummary } from '@/types/flashcard'

interface Props {
  deckId: string
  cards: FlashcardCardWithReview[]
  accessToken: string
  onFinish: (summary: SessionSummary) => void
  onExit: () => void
}

const QUALITY_BUTTONS: Array<{
  quality: ReviewQuality
  label: string
  sublabel: string
  color: string
  hoverColor: string
  icon?: React.ReactNode
}> = [
  {
    quality: 0,
    label: 'Again',
    sublabel: '<1min',
    color: 'border-red-500/40 text-red-400 bg-red-500/5',
    hoverColor: 'hover:bg-red-500/15 hover:border-red-500/60',
    icon: <FiX className="w-4 h-4" />,
  },
  {
    quality: 2,
    label: 'Hard',
    sublabel: '~1d',
    color: 'border-orange-500/40 text-orange-400 bg-orange-500/5',
    hoverColor: 'hover:bg-orange-500/15 hover:border-orange-500/60',
    icon: <FiMinus className="w-4 h-4" />,
  },
  {
    quality: 3,
    label: 'Good',
    sublabel: 'Normal',
    color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5',
    hoverColor: 'hover:bg-emerald-500/15 hover:border-emerald-500/60',
    icon: <FiCheck className="w-4 h-4" />,
  },
  {
    quality: 5,
    label: 'Easy',
    sublabel: 'Long',
    color: 'border-blue-500/40 text-blue-400 bg-blue-500/5',
    hoverColor: 'hover:bg-blue-500/15 hover:border-blue-500/60',
    icon: <FiPlus className="w-4 h-4" />,
  },
]

export default function FlashcardStudy({ deckId, cards: initialCards, accessToken, onFinish, onExit }: Props) {
  const [cards] = useState<FlashcardCardWithReview[]>(initialCards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState<SessionSummary>({
    total: initialCards.length,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    newIntervals: [],
  })

  const currentCard = cards[currentIndex]
  const isLast = currentIndex >= cards.length - 1
  const progress = Math.round((currentIndex / cards.length) * 100)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!flipped) setFlipped(true)
      }
      if (flipped) {
        if (e.key === '1') handleRating(0)
        if (e.key === '2') handleRating(2)
        if (e.key === '3') handleRating(3)
        if (e.key === '4') handleRating(5)
        if (e.key === 'h') setShowHint((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, currentIndex])

  const handleRating = useCallback(async (quality: ReviewQuality) => {
    if (submitting || !currentCard) return
    setSubmitting(true)

    try {
      await fetch(`/api/flashcards/${deckId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ cardId: currentCard.id, quality }),
      })
    } catch {
      // Non-fatal: continue session even if review save fails
    }

    setSummary((prev) => ({
      ...prev,
      again: prev.again + (quality === 0 ? 1 : 0),
      hard: prev.hard + (quality === 2 ? 1 : 0),
      good: prev.good + (quality === 3 ? 1 : 0),
      easy: prev.easy + (quality === 5 ? 1 : 0),
    }))

    if (isLast) {
      onFinish({
        ...summary,
        again: summary.again + (quality === 0 ? 1 : 0),
        hard: summary.hard + (quality === 2 ? 1 : 0),
        good: summary.good + (quality === 3 ? 1 : 0),
        easy: summary.easy + (quality === 5 ? 1 : 0),
      })
    } else {
      setFlipped(false)
      setShowHint(false)
      setTimeout(() => setCurrentIndex((i) => i + 1), 80)
    }

    setSubmitting(false)
  }, [submitting, currentCard, deckId, accessToken, isLast, summary, onFinish])

  if (!currentCard) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onExit} className="btn-ghost text-sm">
          ← Exit
        </button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-tertiary mono">
            {currentIndex + 1} / {cards.length}
          </span>
          {currentCard.hint && !flipped && (
            <button
              onClick={() => setShowHint((v) => !v)}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {showHint ? 'Hide hint' : 'Show hint'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-elevated rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-text-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto">
        <div className="w-full max-w-2xl">
          <FlashcardCard
            card={currentCard}
            flipped={flipped}
            onFlip={() => !flipped && setFlipped(true)}
            showHint={showHint}
          />
        </div>

        {/* Rating buttons — only visible after flip */}
        <div
          className={`w-full max-w-2xl mt-8 transition-all duration-300 ${
            flipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <p className="text-center text-xs text-text-tertiary mb-4">How well did you know this?</p>
          <div className="grid grid-cols-4 gap-3">
            {QUALITY_BUTTONS.map((btn) => (
              <button
                key={btn.quality}
                onClick={() => handleRating(btn.quality)}
                disabled={submitting}
                className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border font-medium text-sm
                  transition-all duration-150 ${btn.color} ${btn.hoverColor}
                  disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
              >
                {btn.icon}
                <span>{btn.label}</span>
                <span className="text-xs opacity-60 font-normal">{btn.sublabel}</span>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-text-tertiary mt-3 opacity-50">
            1 Again · 2 Hard · 3 Good · 4 Easy · Space to flip
          </p>
        </div>
      </div>
    </div>
  )
}
