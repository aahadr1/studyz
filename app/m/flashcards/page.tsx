'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, {
  MobileHeader,
  FloatingActionButton,
  EmptyState,
} from '@/components/mobile/MobileLayout'
import { FiPlus, FiZap, FiLayers, FiClock } from 'react-icons/fi'
import type { FlashcardDeck } from '@/types/flashcard'

export default function MobileFlashcardsPage() {
  const router = useRouter()
  const [decks, setDecks] = useState<FlashcardDeck[]>([])
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')

  const loadDecks = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/m/login'); return }
    setToken(session.access_token)

    try {
      if (typeof window !== 'undefined' && !sessionStorage.getItem('starter_deck_checked_v2')) {
        sessionStorage.setItem('starter_deck_checked_v2', '1')
        await fetch('/api/starter-deck/seed', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
      }
    } catch { /* silent */ }

    const res = await fetch('/api/flashcards', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setDecks(data.decks || [])
    }
    setLoading(false)
  }, [router])

  useEffect(() => { loadDecks() }, [loadDecks])

  const totalDue = decks.reduce((s, d) => s + d.due_count, 0)

  return (
    <MobileLayout>
      <MobileHeader title="Flashcards" />

      <div className="mobile-content pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner" />
          </div>
        ) : decks.length === 0 ? (
          <EmptyState
            icon={<FiLayers className="w-8 h-8" />}
            title="No decks yet"
            description="Create your first flashcard deck"
            action={
              <Link href="/m/flashcards/new" className="btn-primary">
                <FiPlus className="w-4 h-4" /> New Deck
              </Link>
            }
          />
        ) : (
          <div className="space-y-3 p-4">
            {totalDue > 0 && (
              <div className="mobile-card p-4 border-l-4 border-orange-400">
                <p className="text-sm font-medium text-orange-400">{totalDue} cards due for review</p>
              </div>
            )}

            {decks.map((deck) => {
              const learnedPct = deck.total_cards > 0
                ? Math.round(((deck.total_cards - deck.new_count) / deck.total_cards) * 100)
                : 0

              return (
                <Link key={deck.id} href={`/m/flashcards/${deck.id}`} className="mobile-card block p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <h3 className="font-medium text-text-primary truncate">{deck.name}</h3>
                      {deck.description && (
                        <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{deck.description}</p>
                      )}
                    </div>
                    <span className="text-xs font-medium mono text-text-tertiary flex-shrink-0">{learnedPct}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1 bg-elevated rounded-full mb-3">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${learnedPct}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-text-tertiary">
                    <span className="flex items-center gap-1">
                      <FiLayers className="w-3 h-3" /> {deck.total_cards}
                    </span>
                    {deck.due_count > 0 && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <FiClock className="w-3 h-3" /> {deck.due_count} due
                      </span>
                    )}
                    {deck.new_count > 0 && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <FiZap className="w-3 h-3" /> {deck.new_count} new
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <FloatingActionButton
        onClick={() => router.push('/m/flashcards/new')}
        icon={<FiPlus className="w-6 h-6" />}
        label="New deck"
      />
    </MobileLayout>
  )
}
