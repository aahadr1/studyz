'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader } from '@/components/mobile/MobileLayout'
import { FiPlay, FiBook, FiPlus, FiTrash2, FiRotateCcw, FiCheck, FiMinus, FiX } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import type { FlashcardDeck, FlashcardCardWithReview, ReviewQuality, SessionSummary } from '@/types/flashcard'

type Tab = 'browse' | 'study'

export default function MobileFlashcardDeckPage({ params }: { params: { id: string } }) {
  const deckId = params.id
  const router = useRouter()
  const searchParams = useSearchParams()

  const [deck, setDeck] = useState<FlashcardDeck | null>(null)
  const [cards, setCards] = useState<FlashcardCardWithReview[]>([])
  const [dueCards, setDueCards] = useState<FlashcardCardWithReview[]>([])
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'browse')

  // Study state
  const [studyIndex, setStudyIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState<SessionSummary | null>(null)

  // Browse state
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/m/login'); return }
      setToken(session.access_token)

      const [deckRes, dueRes] = await Promise.all([
        fetch(`/api/flashcards/${deckId}`, { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch(`/api/flashcards/${deckId}/due?limit=50`, { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ])

      if (!deckRes.ok) { router.push('/m/flashcards'); return }
      const deckData = await deckRes.json()
      setDeck(deckData.deck)
      setCards(deckData.cards || [])

      if (dueRes.ok) {
        const dueData = await dueRes.json()
        setDueCards(dueData.cards || [])
      }
      setLoading(false)
    }
    load()
  }, [deckId, router])

  const handleRating = async (quality: ReviewQuality) => {
    if (submitting || dueCards.length === 0) return
    setSubmitting(true)
    const currentCard = dueCards[studyIndex]

    await fetch(`/api/flashcards/${deckId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cardId: currentCard.id, quality }),
    }).catch(() => {})

    const isLast = studyIndex >= dueCards.length - 1
    if (isLast) {
      setSummary({ total: dueCards.length, again: 0, hard: 0, good: 0, easy: 0, newIntervals: [] })
    } else {
      setFlipped(false)
      setTimeout(() => setStudyIndex((i) => i + 1), 60)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Loading..." backHref="/m/flashcards" />
        <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
      </MobileLayout>
    )
  }

  const currentStudyCard = dueCards[studyIndex]
  const studyProgress = dueCards.length > 0 ? Math.round((studyIndex / dueCards.length) * 100) : 0

  // Study tab
  if (tab === 'study') {
    if (summary) {
      return (
        <MobileLayout>
          <MobileHeader title={deck?.name || 'Deck'} backHref="/m/flashcards" />
          <div className="mobile-content flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-semibold mb-2">Session Complete!</h2>
            <p className="text-sm text-text-secondary mb-6">{dueCards.length} cards reviewed</p>
            <div className="flex gap-3">
              <button onClick={() => { setSummary(null); setStudyIndex(0); setFlipped(false) }} className="btn-primary">
                <FiPlay className="w-4 h-4" /> Again
              </button>
              <button onClick={() => setTab('browse')} className="btn-secondary">
                <FiBook className="w-4 h-4" /> Browse
              </button>
            </div>
          </div>
        </MobileLayout>
      )
    }

    if (dueCards.length === 0) {
      return (
        <MobileLayout>
          <MobileHeader title={deck?.name || 'Deck'} backHref="/m/flashcards" />
          <div className="mobile-content flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-lg font-semibold mb-2">All caught up!</h2>
            <p className="text-sm text-text-secondary mb-6">No cards due. Come back later or add new cards.</p>
            <button onClick={() => setTab('browse')} className="btn-secondary">Browse Cards</button>
          </div>
        </MobileLayout>
      )
    }

    return (
      <MobileLayout>
        <MobileHeader
          title={`${studyIndex + 1} / ${dueCards.length}`}
          backHref="/m/flashcards"
          onBack={() => setTab('browse')}
        />
        <div className="mobile-content p-4 flex flex-col">
          {/* Progress */}
          <div className="w-full h-1 bg-elevated rounded-full mb-6">
            <div className="h-full bg-text-primary rounded-full transition-all" style={{ width: `${studyProgress}%` }} />
          </div>

          {/* Card */}
          <div
            className="flex-1 mobile-card p-6 flex flex-col overflow-y-auto cursor-pointer mb-6"
            onClick={() => !flipped && setFlipped(true)}
          >
            {!flipped ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-3">{currentStudyCard?.card_type}</p>
                <div className="text-base text-text-primary leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                    {currentStudyCard?.card_type === 'cloze'
                      ? currentStudyCard.front.replace(/\{\{c1::([^}]+)\}\}/g, '_____')
                      : currentStudyCard?.front || ''}
                  </ReactMarkdown>
                </div>
                <p className="text-xs text-text-tertiary mt-6">Tap to reveal</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">{currentStudyCard?.card_type}</p>
                  <div className="text-sm text-text-secondary leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                      {currentStudyCard?.card_type === 'cloze'
                        ? currentStudyCard.front.replace(/\{\{c1::([^}]+)\}\}/g, '_____')
                        : currentStudyCard?.front || ''}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Answer</p>
                  <div className="text-base text-text-primary leading-relaxed text-left">
                    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                      {currentStudyCard?.back || ''}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rating buttons */}
          {flipped && (
            <div className="grid grid-cols-4 gap-2">
              {([
                { quality: 0 as ReviewQuality, label: 'Again', color: 'border-red-500/40 text-red-400' },
                { quality: 2 as ReviewQuality, label: 'Hard', color: 'border-orange-500/40 text-orange-400' },
                { quality: 3 as ReviewQuality, label: 'Good', color: 'border-emerald-500/40 text-emerald-400' },
                { quality: 5 as ReviewQuality, label: 'Easy', color: 'border-blue-500/40 text-blue-400' },
              ]).map((btn) => (
                <button
                  key={btn.quality}
                  onClick={() => handleRating(btn.quality)}
                  disabled={submitting}
                  className={`py-3 rounded-xl border text-xs font-medium transition-all active:scale-95 ${btn.color}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </MobileLayout>
    )
  }

  // Browse tab
  return (
    <MobileLayout>
      <MobileHeader title={deck?.name || 'Deck'} backHref="/m/flashcards" />
      <div className="mobile-content p-4 pb-24">
        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-elevated border border-border rounded-xl mb-4 w-fit">
          {/* We only reach this JSX when tab === 'browse', so Browse is always active */}
          <button onClick={() => setTab('browse')} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all bg-text-primary text-background">Browse</button>
          <button onClick={() => { setSummary(null); setStudyIndex(0); setFlipped(false); setTab('study') }} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all text-text-secondary">
            Study {dueCards.length > 0 && `(${dueCards.length})`}
          </button>
        </div>

        {/* Cards list */}
        {cards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-text-secondary">No cards yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className="mobile-card p-4 cursor-pointer"
                onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-tertiary uppercase mb-1">{card.card_type}</p>
                    <p className="text-sm text-text-primary">
                      {card.card_type === 'cloze'
                        ? card.front.replace(/\{\{c1::([^}]+)\}\}/g, '_____')
                        : card.front}
                    </p>
                  </div>
                  <span className="text-xs text-text-tertiary">{expandedCard === card.id ? '▲' : '▼'}</span>
                </div>

                {expandedCard === card.id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-sm text-text-secondary">
                      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                        {card.back}
                      </ReactMarkdown>
                    </div>
                    {card.review && (
                      <p className="text-xs text-text-tertiary mono mt-2">
                        Next: {new Date(card.review.due_date) <= new Date() ? 'due now' : `${Math.ceil((new Date(card.review.due_date).getTime() - Date.now()) / 86400000)}d`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  )
}
