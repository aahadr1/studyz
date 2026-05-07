'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { FiHome, FiZap, FiCheckSquare, FiMic, FiLogOut, FiPlus, FiLayers } from 'react-icons/fi'
import Logo from '@/components/Logo'
import FlashcardDeckCard from '@/components/flashcards/FlashcardDeckCard'
import type { FlashcardDeck } from '@/types/flashcard'

export default function FlashcardsPage() {
  const router = useRouter()
  const [decks, setDecks] = useState<FlashcardDeck[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      setUser({ fullName: authUser.user_metadata?.full_name || 'Student', email: authUser.email })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setToken(session.access_token)

      // Idempotent server-side seed of the default CDC starter deck. We
      // await the result so the deck list below already reflects it on
      // the very first visit. Subsequent visits short-circuit server-side.
      try {
        if (typeof window !== 'undefined' && !sessionStorage.getItem('starter_deck_checked')) {
          sessionStorage.setItem('starter_deck_checked', '1')
          await fetch('/api/starter-deck/seed', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        }
      } catch { /* silent: never block the deck list on the seeder */ }

      const res = await fetch('/api/flashcards', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDecks(data.decks || [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  const handleDelete = async (deckId: string) => {
    if (!confirm('Delete this deck and all its cards?')) return
    await fetch(`/api/flashcards/${deckId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setDecks((prev) => prev.filter((d) => d.id !== deckId))
  }

  const handleLogout = async () => {
    await createClient().auth.signOut()
    router.push('/login')
  }

  const totalDue = decks.reduce((s, d) => s + d.due_count, 0)

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Logo size="md" href="/dashboard" />
        </div>
        <nav className="flex-1 py-4">
          <div className="sidebar-section-title">Menu</div>
          <Link href="/dashboard" className="sidebar-item">
            <FiHome className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link href="/interactive-lessons" className="sidebar-item">
            <FiZap className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Lessons</span>
          </Link>
          <Link href="/mcq" className="sidebar-item">
            <FiCheckSquare className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Quiz Sets</span>
          </Link>
          <Link href="/intelligent-podcast" className="sidebar-item">
            <FiMic className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Podcasts</span>
          </Link>
          <Link href="/flashcards" className="sidebar-item sidebar-item-active">
            <FiLayers className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Flashcards</span>
          </Link>
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
            <FiLogOut className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-border flex items-center justify-between px-8">
          <h1 className="text-sm font-medium text-text-primary uppercase tracking-wider">Flashcards</h1>
          <Link href="/flashcards/new" className="btn-primary">
            <FiPlus className="w-4 h-4" strokeWidth={2} />
            New Deck
          </Link>
        </header>

        <div className="p-8 max-w-5xl">
          {/* Stats bar */}
          {decks.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-10">
              <div className="p-5 bg-elevated border border-border rounded-xl">
                <span className="block text-3xl font-semibold mono text-text-primary">{decks.length}</span>
                <span className="text-xs text-text-secondary uppercase tracking-wider">Decks</span>
              </div>
              <div className="p-5 bg-elevated border border-border rounded-xl">
                <span className="block text-3xl font-semibold mono text-text-primary">
                  {decks.reduce((s, d) => s + d.total_cards, 0)}
                </span>
                <span className="text-xs text-text-secondary uppercase tracking-wider">Total Cards</span>
              </div>
              <div className={`p-5 border rounded-xl ${totalDue > 0 ? 'bg-orange-500/5 border-orange-500/20' : 'bg-elevated border-border'}`}>
                <span className={`block text-3xl font-semibold mono ${totalDue > 0 ? 'text-orange-400' : 'text-text-primary'}`}>
                  {totalDue}
                </span>
                <span className="text-xs text-text-secondary uppercase tracking-wider">Due Today</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
            </div>
          ) : decks.length === 0 ? (
            <div className="border border-border rounded-2xl p-16 text-center bg-elevated">
              <div className="w-16 h-16 border border-border rounded-2xl flex items-center justify-center mx-auto mb-6 text-text-tertiary bg-surface">
                <FiLayers className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">No flashcard decks yet</h3>
              <p className="text-sm text-text-secondary mb-6">
                Upload a PDF and let AI generate flashcards, or create them manually.
              </p>
              <Link href="/flashcards/new" className="btn-primary inline-flex">
                <FiPlus className="w-4 h-4" strokeWidth={2} />
                Create Your First Deck
              </Link>
            </div>
          ) : (
            <>
              {totalDue > 0 && (
                <div className="mb-8 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-400">
                      {totalDue} card{totalDue > 1 ? 's' : ''} due for review
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5">Keep your streak going!</p>
                  </div>
                  <Link
                    href={`/flashcards/${decks.find(d => d.due_count > 0)?.id}?tab=study`}
                    className="text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    Study now →
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {decks.map((deck) => (
                  <FlashcardDeckCard key={deck.id} deck={deck} onDelete={handleDelete} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
