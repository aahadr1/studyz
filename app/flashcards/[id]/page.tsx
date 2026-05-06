'use client'

import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { FiHome, FiZap, FiCheckSquare, FiMic, FiLogOut, FiLayers, FiPlus, FiTrash2, FiEdit2, FiBook, FiPlay } from 'react-icons/fi'
import Logo from '@/components/Logo'
import FlashcardCard from '@/components/flashcards/FlashcardCard'
import FlashcardStudy from '@/components/flashcards/FlashcardStudy'
import FlashcardEditor from '@/components/flashcards/FlashcardEditor'
import type { FlashcardDeck, FlashcardCardWithReview, SessionSummary } from '@/types/flashcard'

type Tab = 'browse' | 'study'

export default function FlashcardDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [deck, setDeck] = useState<FlashcardDeck | null>(null)
  const [cards, setCards] = useState<FlashcardCardWithReview[]>([])
  const [dueCards, setDueCards] = useState<FlashcardCardWithReview[]>([])
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'browse')
  const [editingCard, setEditingCard] = useState<FlashcardCardWithReview | null>(null)
  const [showNewCard, setShowNewCard] = useState(false)
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set())
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      setUser({ fullName: authUser.user_metadata?.full_name || 'Student', email: authUser.email })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const tok = session.access_token
      setToken(tok)

      const [deckRes, dueRes] = await Promise.all([
        fetch(`/api/flashcards/${deckId}`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`/api/flashcards/${deckId}/due?limit=50`, { headers: { Authorization: `Bearer ${tok}` } }),
      ])

      if (!deckRes.ok) { router.push('/flashcards'); return }
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

  const handleCardSaved = (savedCard: any) => {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === savedCard.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], ...savedCard }
        return updated
      }
      return [...prev, { ...savedCard, review: null }]
    })
    setShowNewCard(false)
    setEditingCard(null)
  }

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm('Delete this card?')) return
    setDeletingCardId(cardId)
    await fetch(`/api/flashcards/${deckId}/cards/${cardId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setCards((prev) => prev.filter((c) => c.id !== cardId))
    setDeletingCardId(null)
  }

  const handleStudyFinish = (summary: SessionSummary) => {
    setSessionSummary(summary)
  }

  const handleLogout = async () => { await createClient().auth.signOut(); router.push('/login') }

  const totalDue = dueCards.length
  const studyCardsCount = totalDue

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  const sidebar = (
    <aside className="w-60 sidebar flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-border">
        <Logo size="md" href="/dashboard" />
      </div>
      <nav className="flex-1 py-4">
        <div className="sidebar-section-title">Menu</div>
        <Link href="/dashboard" className="sidebar-item"><FiHome className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Dashboard</span></Link>
        <Link href="/interactive-lessons" className="sidebar-item"><FiZap className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Lessons</span></Link>
        <Link href="/mcq" className="sidebar-item"><FiCheckSquare className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Quiz Sets</span></Link>
        <Link href="/intelligent-podcast" className="sidebar-item"><FiMic className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Podcasts</span></Link>
        <Link href="/flashcards" className="sidebar-item sidebar-item-active"><FiLayers className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Flashcards</span></Link>
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 border border-border rounded-lg flex items-center justify-center text-sm font-medium mono bg-elevated">
            {user?.fullName?.[0]?.toUpperCase() || 'S'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{user?.fullName}</p>
            <p className="text-xs text-text-tertiary truncate mono">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="sidebar-item w-full text-text-tertiary hover:text-error">
          <FiLogOut className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Sign out</span>
        </button>
      </div>
    </aside>
  )

  // Study mode with active session
  if (tab === 'study' && !sessionSummary) {
    if (dueCards.length === 0) {
      return (
        <div className="min-h-screen bg-background flex">
          {sidebar}
          <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 border border-border rounded-2xl flex items-center justify-center mx-auto mb-6 text-text-tertiary bg-elevated">
              <FiZap className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">All caught up!</h2>
            <p className="text-sm text-text-secondary mb-6">No cards due for review right now. Come back later or add new cards.</p>
            <div className="flex gap-3">
              <button onClick={() => setTab('browse')} className="btn-secondary">Browse Cards</button>
              <Link href="/flashcards" className="btn-ghost">Back to Decks</Link>
            </div>
          </main>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background flex">
        {sidebar}
        <main className="flex-1 overflow-auto p-8">
          <FlashcardStudy
            deckId={deckId}
            cards={dueCards}
            accessToken={token}
            onFinish={handleStudyFinish}
            onExit={() => setTab('browse')}
          />
        </main>
      </div>
    )
  }

  // Session summary screen
  if (tab === 'study' && sessionSummary) {
    const pctGood = sessionSummary.total > 0
      ? Math.round(((sessionSummary.good + sessionSummary.easy) / sessionSummary.total) * 100)
      : 0

    return (
      <div className="min-h-screen bg-background flex">
        {sidebar}
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="text-5xl mb-6">{pctGood >= 80 ? '🎉' : pctGood >= 50 ? '👍' : '💪'}</div>
            <h2 className="text-2xl font-semibold text-text-primary mb-2">Session Complete</h2>
            <p className="text-sm text-text-secondary mb-8">{sessionSummary.total} cards reviewed</p>

            <div className="grid grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Again', value: sessionSummary.again, color: 'text-red-400' },
                { label: 'Hard', value: sessionSummary.hard, color: 'text-orange-400' },
                { label: 'Good', value: sessionSummary.good, color: 'text-emerald-400' },
                { label: 'Easy', value: sessionSummary.easy, color: 'text-blue-400' },
              ].map((s) => (
                <div key={s.label} className="p-4 bg-elevated border border-border rounded-xl">
                  <span className={`block text-2xl font-semibold mono ${s.color}`}>{s.value}</span>
                  <span className="text-xs text-text-tertiary">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setSessionSummary(null); setTab('study') }}
                className="btn-primary"
              >
                <FiPlay className="w-4 h-4" /> Study Again
              </button>
              <button onClick={() => { setSessionSummary(null); setTab('browse') }} className="btn-secondary">
                <FiBook className="w-4 h-4" /> Browse Cards
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Browse mode
  return (
    <div className="min-h-screen bg-background flex">
      {sidebar}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-border flex items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <Link href="/flashcards" className="text-sm text-text-tertiary hover:text-text-primary">←</Link>
            <h1 className="text-sm font-medium text-text-primary truncate max-w-xs">{deck?.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary mono">{cards.length} cards</span>
            {studyCardsCount > 0 && (
              <button
                onClick={() => { setSessionSummary(null); setTab('study') }}
                className="btn-primary"
              >
                <FiPlay className="w-4 h-4" strokeWidth={2} />
                Study ({studyCardsCount})
              </button>
            )}
          </div>
        </header>

        <div className="p-8 max-w-5xl">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-elevated border border-border rounded-xl mb-8 w-fit">
            <button
              onClick={() => setTab('browse')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'browse' ? 'bg-text-primary text-background' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiBook className="inline w-3.5 h-3.5 mr-1.5" />
              Browse
            </button>
            <button
              onClick={() => { setSessionSummary(null); setTab('study') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'study' ? 'bg-text-primary text-background' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiPlay className="inline w-3.5 h-3.5 mr-1.5" />
              Study {studyCardsCount > 0 && `(${studyCardsCount})`}
            </button>
          </div>

          {/* New card form */}
          {showNewCard && (
            <div className="mb-6">
              <FlashcardEditor
                deckId={deckId}
                accessToken={token}
                onSave={handleCardSaved}
                onCancel={() => setShowNewCard(false)}
              />
            </div>
          )}

          {/* Edit card form */}
          {editingCard && (
            <div className="mb-6">
              <FlashcardEditor
                deckId={deckId}
                accessToken={token}
                card={editingCard}
                onSave={handleCardSaved}
                onCancel={() => setEditingCard(null)}
              />
            </div>
          )}

          {/* Add card button */}
          {!showNewCard && !editingCard && (
            <button
              onClick={() => setShowNewCard(true)}
              className="w-full mb-6 py-3 border-2 border-dashed border-border rounded-xl text-sm text-text-tertiary
                hover:border-border-light hover:text-text-secondary hover:bg-elevated transition-all flex items-center justify-center gap-2"
            >
              <FiPlus className="w-4 h-4" />
              Add Card Manually
            </button>
          )}

          {/* Cards grid */}
          {cards.length === 0 ? (
            <div className="text-center py-16 border border-border rounded-2xl bg-elevated">
              <FiLayers className="w-8 h-8 mx-auto mb-4 text-text-tertiary" strokeWidth={1.5} />
              <p className="text-sm text-text-secondary mb-4">No cards yet. Add them manually or go back and upload a PDF.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cards.map((card) => (
                <div key={card.id} className="group relative">
                  <FlashcardCard
                    card={card}
                    flipped={flippedCards.has(card.id)}
                    onFlip={() =>
                      setFlippedCards((prev) => {
                        const next = new Set(prev)
                        if (next.has(card.id)) next.delete(card.id)
                        else next.add(card.id)
                        return next
                      })
                    }
                  />
                  {/* Card actions */}
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingCard(card); setShowNewCard(false) }}
                      className="w-7 h-7 rounded-lg bg-elevated border border-border flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
                      title="Edit"
                    >
                      <FiEdit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteCard(card.id)}
                      disabled={deletingCardId === card.id}
                      className="w-7 h-7 rounded-lg bg-elevated border border-border flex items-center justify-center text-text-tertiary hover:text-error transition-colors"
                      title="Delete"
                    >
                      <FiTrash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Review badge */}
                  {card.review && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-background/80 border border-border text-text-tertiary mono">
                        next: {new Date(card.review.due_date) <= new Date()
                          ? 'due now'
                          : `${Math.ceil((new Date(card.review.due_date).getTime() - Date.now()) / 86400000)}d`}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
