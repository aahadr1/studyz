'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  FiHome, FiZap, FiCheckSquare, FiMic, FiLogOut, FiLayers, FiPlus, FiTrash2, FiEdit2,
  FiBook, FiPlay, FiSearch, FiGrid, FiList, FiStar, FiBookmark, FiX, FiCheck,
  FiClock, FiArrowUp, FiArrowDown, FiEye,
} from 'react-icons/fi'
import Logo from '@/components/Logo'
import FlashcardCard from '@/components/flashcards/FlashcardCard'
import FlashcardStudy from '@/components/flashcards/FlashcardStudy'
import FlashcardEditor from '@/components/flashcards/FlashcardEditor'
import StudySetup from '@/components/flashcards/StudySetup'
import {
  loadStarred, saveStarred,
  loadSuspended, saveSuspended,
  loadViewMode, saveViewMode,
  type ViewMode, type SessionPrefs,
} from '@/lib/flashcard-prefs'
import type { FlashcardDeck, FlashcardCardWithReview, SessionSummary } from '@/types/flashcard'

type Tab = 'browse' | 'study'
type SortKey = 'created_asc' | 'created_desc' | 'due_asc' | 'hardest' | 'alpha'

export default function FlashcardDeckPage({ params }: { params: { id: string } }) {
  const deckId = params.id
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

  // Étude
  const [studyCards, setStudyCards] = useState<FlashcardCardWithReview[] | null>(null)
  const [studyPrefs, setStudyPrefs] = useState<SessionPrefs | null>(null)

  // Vue / filtres
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_asc')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterFavOnly, setFilterFavOnly] = useState(false)
  const [filterDueOnly, setFilterDueOnly] = useState(false)
  const [filterHideSuspended, setFilterHideSuspended] = useState(true)

  // Sélection multiple
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // État local prefs
  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [suspended, setSuspended] = useState<Set<string>>(new Set())

  useEffect(() => {
    setViewMode(loadViewMode())
    setStarred(loadStarred(deckId))
    setSuspended(loadSuspended(deckId))
  }, [deckId])

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      setUser({ fullName: authUser.user_metadata?.full_name || 'Étudiant', email: authUser.email })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const tok = session.access_token
      setToken(tok)

      const [deckRes, dueRes] = await Promise.all([
        fetch(`/api/flashcards/${deckId}`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`/api/flashcards/${deckId}/due?limit=200`, { headers: { Authorization: `Bearer ${tok}` } }),
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
    // Reste en mode "ajout rapide" pour permettre l'enchaînement
    setEditingCard(null)
  }

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm('Supprimer cette carte ?')) return
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
    setStudyCards(null)
  }

  const toggleCardStar = (cardId: string) => {
    const next = new Set(starred)
    if (next.has(cardId)) next.delete(cardId)
    else next.add(cardId)
    setStarred(next); saveStarred(deckId, next)
  }
  const toggleCardSuspended = (cardId: string) => {
    const next = new Set(suspended)
    if (next.has(cardId)) next.delete(cardId)
    else next.add(cardId)
    setSuspended(next); saveSuspended(deckId, next)
  }

  const setView = (m: ViewMode) => { setViewMode(m); saveViewMode(m) }

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Supprimer ${selected.size} carte${selected.size > 1 ? 's' : ''} ?`)) return
    const ids = Array.from(selected)
    await Promise.all(ids.map((id) =>
      fetch(`/api/flashcards/${deckId}/cards/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
    ))
    setCards((prev) => prev.filter((c) => !selected.has(c.id)))
    setSelected(new Set())
    setSelectMode(false)
  }

  const bulkStar = () => {
    const next = new Set(starred); selected.forEach((id) => next.add(id))
    setStarred(next); saveStarred(deckId, next)
  }
  const bulkUnstar = () => {
    const next = new Set(starred); selected.forEach((id) => next.delete(id))
    setStarred(next); saveStarred(deckId, next)
  }
  const bulkSuspend = () => {
    const next = new Set(suspended); selected.forEach((id) => next.add(id))
    setSuspended(next); saveSuspended(deckId, next)
  }
  const bulkUnsuspend = () => {
    const next = new Set(suspended); selected.forEach((id) => next.delete(id))
    setSuspended(next); saveSuspended(deckId, next)
  }

  const exportSelected = () => {
    const subset = cards.filter((c) => selected.size === 0 ? true : selected.has(c.id))
    const tsv = subset.map((c) => [c.front, c.back, c.tags?.join('|') || '', c.hint || ''].map(esc).join('\t')).join('\n')
    download(`${deck?.name || 'deck'}.tsv`, tsv)
  }
  const exportJSON = () => {
    download(`${deck?.name || 'deck'}.json`, JSON.stringify({
      name: deck?.name, description: deck?.description, cards: cards.map(({ id, deck_id, user_id, review, ...rest }) => rest),
    }, null, 2))
  }

  const handleLogout = async () => { await createClient().auth.signOut(); router.push('/login') }

  /* ------------------------------ filtre / tri ----------------------------- */
  const allTags = useMemo(() => {
    const set = new Set<string>()
    cards.forEach((c) => c.tags?.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [cards])

  const filteredCards = useMemo(() => {
    const now = Date.now()
    let pool = cards.slice()

    if (search.trim()) {
      const q = search.toLowerCase()
      pool = pool.filter((c) =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        c.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (filterTags.length > 0) {
      pool = pool.filter((c) => c.tags?.some((t) => filterTags.includes(t)))
    }
    if (filterFavOnly) pool = pool.filter((c) => starred.has(c.id))
    if (filterHideSuspended) pool = pool.filter((c) => !suspended.has(c.id))
    if (filterDueOnly) {
      pool = pool.filter((c) => !c.review || new Date(c.review.due_date).getTime() <= now)
    }

    const cmp = {
      created_asc:  (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      created_desc: (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      alpha:        (a: any, b: any) => a.front.localeCompare(b.front),
      due_asc:      (a: any, b: any) => (a.review ? new Date(a.review.due_date).getTime() : Infinity) - (b.review ? new Date(b.review.due_date).getTime() : Infinity),
      hardest:      (a: any, b: any) => (a.review?.ease_factor ?? 2.5) - (b.review?.ease_factor ?? 2.5),
    }[sortKey]

    return pool.slice().sort(cmp)
  }, [cards, search, filterTags, filterFavOnly, filterDueOnly, filterHideSuspended, starred, suspended, sortKey])

  /* ------------------------------ rendu sidebar ---------------------------- */

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
        <Link href="/dashboard" className="sidebar-item"><FiHome className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Accueil</span></Link>
        <Link href="/interactive-lessons" className="sidebar-item"><FiZap className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Leçons</span></Link>
        <Link href="/mcq" className="sidebar-item"><FiCheckSquare className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">QCM</span></Link>
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
          <FiLogOut className="w-4 h-4" strokeWidth={1.5} /><span className="text-sm">Se déconnecter</span>
        </button>
      </div>
    </aside>
  )

  /* =============================== STUDY MODE =============================== */

  // Étape 1 — preview / setup
  if (tab === 'study' && !studyCards && !sessionSummary) {
    return (
      <div className="min-h-screen bg-background flex">
        {sidebar}
        <main className="flex-1 overflow-auto">
          <StudySetup
            deckId={deckId}
            deckName={deck?.name || ''}
            allCards={cards}
            dueCards={dueCards}
            onStart={(c, p) => { setStudyCards(c); setStudyPrefs(p) }}
            onBack={() => { setTab('browse') }}
          />
        </main>
      </div>
    )
  }

  // Étape 2 — session active (paysage immersif)
  if (tab === 'study' && studyCards && studyPrefs && !sessionSummary) {
    return (
      <div className="min-h-screen bg-background flex">
        <main className="flex-1">
          <FlashcardStudy
            deckId={deckId}
            cards={studyCards}
            prefs={studyPrefs}
            accessToken={token}
            onFinish={handleStudyFinish}
            onExit={() => { setStudyCards(null) }}
          />
        </main>
      </div>
    )
  }

  // Étape 3 — résumé
  if (tab === 'study' && sessionSummary) {
    const total = sessionSummary.total
    const successPct = total > 0
      ? Math.round(((sessionSummary.good + sessionSummary.easy) / total) * 100)
      : 0

    return (
      <div className="min-h-screen bg-background flex">
        {sidebar}
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-xl w-full">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">{successPct >= 80 ? '🎯' : successPct >= 50 ? '👏' : '💪'}</div>
              <h2 className="text-2xl md:text-3xl font-semibold text-text-primary mb-1">Session terminée</h2>
              <p className="text-sm text-text-secondary">{total} cartes · {successPct}% réussite</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'À revoir', value: sessionSummary.again, color: 'text-red-400 border-red-500/30 bg-red-500/5' },
                { label: 'Difficile', value: sessionSummary.hard, color: 'text-orange-400 border-orange-500/30 bg-orange-500/5' },
                { label: 'Bien',      value: sessionSummary.good, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
                { label: 'Facile',    value: sessionSummary.easy, color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
              ].map((s) => (
                <div key={s.label} className={`p-4 rounded-2xl border ${s.color}`}>
                  <span className="block text-3xl font-semibold mono">{s.value}</span>
                  <span className="text-xs uppercase tracking-widest opacity-80">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => { setSessionSummary(null) }} className="btn-primary">
                <FiPlay className="w-4 h-4" /> Nouvelle session
              </button>
              {sessionSummary.again > 0 && (
                <button
                  onClick={() => setSessionSummary(null)}
                  className="btn-secondary"
                  title="Relancer le setup pour ne refaire que les cartes ratées"
                >
                  <FiRefreshIcon /> Refaire les ratées
                </button>
              )}
              <button onClick={() => { setSessionSummary(null); setStudyCards(null); setTab('browse') }} className="btn-ghost">
                <FiBook className="w-4 h-4" /> Retour aux cartes
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  /* =============================== BROWSE MODE ============================== */

  const hasFiltersActive = !!search.trim() || filterTags.length > 0 || filterFavOnly || filterDueOnly

  return (
    <div className="min-h-screen bg-background flex">
      {sidebar}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/flashcards" className="text-sm text-text-tertiary hover:text-text-primary">←</Link>
            <h1 className="text-sm font-medium text-text-primary truncate max-w-xs">{deck?.name}</h1>
            <span className="hidden md:inline text-xs text-text-tertiary mono">{cards.length} cartes</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSessionSummary(null); setStudyCards(null); setTab('study') }}
              className="btn-primary"
            >
              <FiPlay className="w-4 h-4" strokeWidth={2} />
              Étudier
            </button>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {/* Onglets */}
          <div className="flex gap-1 p-1 bg-elevated border border-border rounded-xl mb-6 w-fit">
            <button
              onClick={() => setTab('browse')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'browse' ? 'bg-text-primary text-background' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiBook className="inline w-3.5 h-3.5 mr-1.5" />
              Cartes
            </button>
            <button
              onClick={() => { setSessionSummary(null); setStudyCards(null); setTab('study') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'study' ? 'bg-text-primary text-background' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiPlay className="inline w-3.5 h-3.5 mr-1.5" />
              Étudier {dueCards.length > 0 && `(${dueCards.length})`}
            </button>
          </div>

          {/* Stats compactes */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat icon={<FiLayers className="w-4 h-4" />} label="Total"     value={cards.length} />
            <Stat icon={<FiClock className="w-4 h-4" />}  label="À revoir"  value={dueCards.length} accent={dueCards.length > 0 ? 'orange' : undefined} />
            <Stat icon={<FiStar className="w-4 h-4" />}   label="Favoris"   value={starred.size} accent={starred.size > 0 ? 'amber' : undefined} />
            <Stat icon={<FiBookmark className="w-4 h-4" />} label="Suspendues" value={suspended.size} />
          </div>

          {/* Barre d'outils */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher dans les cartes…"
                className="input pl-9 w-full"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-text-tertiary hover:text-text-primary hover:bg-elevated flex items-center justify-center">
                  <FiX className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SortMenu value={sortKey} onChange={setSortKey} />

              <button
                onClick={() => setFilterFavOnly((v) => !v)}
                className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 min-h-[40px] ${
                  filterFavOnly ? 'border-amber-400 bg-amber-400/10 text-amber-400' : 'border-border text-text-secondary hover:border-border-light'
                }`}
                title="Afficher uniquement les favoris"
              >
                <FiStar className={`w-4 h-4 ${filterFavOnly ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">Favoris</span>
              </button>
              <button
                onClick={() => setFilterDueOnly((v) => !v)}
                className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 min-h-[40px] ${
                  filterDueOnly ? 'border-orange-400 bg-orange-400/10 text-orange-400' : 'border-border text-text-secondary hover:border-border-light'
                }`}
                title="Afficher uniquement les cartes à revoir"
              >
                <FiClock className="w-4 h-4" />
                <span className="hidden sm:inline">À revoir</span>
              </button>
              <button
                onClick={() => setFilterHideSuspended((v) => !v)}
                className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 min-h-[40px] ${
                  !filterHideSuspended ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400' : 'border-border text-text-secondary hover:border-border-light'
                }`}
                title={filterHideSuspended ? 'Afficher les cartes suspendues' : 'Cacher les suspendues'}
              >
                <FiBookmark className={`w-4 h-4 ${!filterHideSuspended ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">Suspendues</span>
              </button>

              <div className="flex bg-elevated border border-border rounded-lg p-0.5">
                <button
                  onClick={() => setView('grid')}
                  className={`px-2.5 py-1.5 rounded text-text-secondary ${viewMode === 'grid' ? 'bg-text-primary text-background' : 'hover:text-text-primary'}`}
                  title="Vue grille"
                ><FiGrid className="w-4 h-4" /></button>
                <button
                  onClick={() => setView('list')}
                  className={`px-2.5 py-1.5 rounded text-text-secondary ${viewMode === 'list' ? 'bg-text-primary text-background' : 'hover:text-text-primary'}`}
                  title="Vue liste"
                ><FiList className="w-4 h-4" /></button>
              </div>

              <button
                onClick={() => { setSelectMode((v) => !v); setSelected(new Set()) }}
                className={`px-3 py-2 rounded-lg border text-sm min-h-[40px] ${
                  selectMode ? 'border-text-primary bg-elevated' : 'border-border text-text-secondary hover:border-border-light'
                }`}
              >
                {selectMode ? 'Annuler' : 'Sélectionner'}
              </button>
            </div>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {allTags.map((t) => {
                const active = filterTags.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => setFilterTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                    className={`px-2.5 py-1 rounded-full border text-xs font-medium ${
                      active
                        ? 'border-text-primary bg-text-primary text-background'
                        : 'border-border text-text-secondary hover:border-border-light hover:bg-elevated'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
              {filterTags.length > 0 && (
                <button onClick={() => setFilterTags([])} className="px-2.5 py-1 rounded-full border border-error/30 text-error text-xs hover:bg-error/10">
                  Effacer
                </button>
              )}
            </div>
          )}

          {/* Barre d'actions multiples */}
          {selectMode && (
            <div className="sticky top-2 z-10 mb-4 p-3 rounded-xl bg-elevated border border-border-light shadow-md flex items-center gap-2 flex-wrap">
              <span className="text-sm text-text-primary mono">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
              <button onClick={() => setSelected(new Set(filteredCards.map((c) => c.id)))} className="btn-ghost text-xs">Tout</button>
              <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs">Aucune</button>
              <div className="ml-auto flex flex-wrap gap-2">
                <button onClick={bulkStar} className="btn-secondary text-xs"><FiStar className="w-3.5 h-3.5" /> Favoriser</button>
                <button onClick={bulkUnstar} className="btn-ghost text-xs">Retirer fav.</button>
                <button onClick={bulkSuspend} className="btn-secondary text-xs"><FiBookmark className="w-3.5 h-3.5" /> Suspendre</button>
                <button onClick={bulkUnsuspend} className="btn-ghost text-xs">Réactiver</button>
                <button onClick={exportSelected} className="btn-ghost text-xs">Export TSV</button>
                <button onClick={bulkDelete} disabled={selected.size === 0} className="btn-danger text-xs"><FiTrash2 className="w-3.5 h-3.5" /> Supprimer</button>
              </div>
            </div>
          )}

          {/* Édition / nouveau formulaire */}
          {(showNewCard || editingCard) && (
            <div className="mb-6">
              <FlashcardEditor
                deckId={deckId}
                accessToken={token}
                card={editingCard ?? undefined}
                onSave={handleCardSaved}
                onCancel={() => { setShowNewCard(false); setEditingCard(null) }}
              />
            </div>
          )}

          {/* Bouton ajout rapide */}
          {!showNewCard && !editingCard && (
            <button
              onClick={() => setShowNewCard(true)}
              className="w-full mb-4 py-3.5 border-2 border-dashed border-border rounded-xl text-sm text-text-tertiary
                hover:border-border-light hover:text-text-secondary hover:bg-elevated transition-all flex items-center justify-center gap-2 min-h-[52px]"
            >
              <FiPlus className="w-4 h-4" />
              Ajouter une carte manuellement
            </button>
          )}

          {/* Export du deck entier */}
          {!selectMode && cards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-text-tertiary">
              <span>Export :</span>
              <button onClick={exportSelected} className="underline-offset-2 hover:underline hover:text-text-primary">TSV</button>
              <span>·</span>
              <button onClick={exportJSON} className="underline-offset-2 hover:underline hover:text-text-primary">JSON</button>
            </div>
          )}

          {/* Grille / liste de cartes */}
          {filteredCards.length === 0 ? (
            <div className="text-center py-16 border border-border rounded-2xl bg-elevated">
              <FiLayers className="w-8 h-8 mx-auto mb-4 text-text-tertiary" strokeWidth={1.5} />
              <p className="text-sm text-text-secondary mb-4">
                {hasFiltersActive ? 'Aucune carte ne correspond aux filtres.' : 'Aucune carte pour le moment.'}
              </p>
              {hasFiltersActive && (
                <button onClick={() => { setSearch(''); setFilterTags([]); setFilterFavOnly(false); setFilterDueOnly(false); setFilterHideSuspended(true) }} className="btn-secondary text-sm">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  flipped={flippedCards.has(card.id)}
                  onFlip={() => setFlippedCards((prev) => {
                    const next = new Set(prev); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next
                  })}
                  starred={starred.has(card.id)}
                  suspended={suspended.has(card.id)}
                  onStar={() => toggleCardStar(card.id)}
                  onSuspend={() => toggleCardSuspended(card.id)}
                  onEdit={() => { setEditingCard(card); setShowNewCard(false) }}
                  onDelete={() => handleDeleteCard(card.id)}
                  deleting={deletingCardId === card.id}
                  selectMode={selectMode}
                  selected={selected.has(card.id)}
                  onSelect={() => toggleSelected(card.id)}
                />
              ))}
            </div>
          ) : (
            <CardListView
              cards={filteredCards}
              starred={starred}
              suspended={suspended}
              onStar={toggleCardStar}
              onSuspend={toggleCardSuspended}
              onEdit={(c) => { setEditingCard(c); setShowNewCard(false) }}
              onDelete={handleDeleteCard}
              deletingCardId={deletingCardId}
              selectMode={selectMode}
              selected={selected}
              onSelect={toggleSelected}
            />
          )}
        </div>
      </main>
    </div>
  )
}

/* ----------------------------- petits composants ---------------------------- */

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: 'orange' | 'amber' }) {
  const accentClass = accent === 'orange'
    ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
    : accent === 'amber'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    : 'border-border bg-elevated text-text-primary'
  return (
    <div className={`rounded-2xl border ${accentClass} px-4 py-3 flex items-center gap-3`}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-background/40 border border-border">
        {icon}
      </div>
      <div>
        <div className="text-xl font-semibold mono">{value}</div>
        <div className="text-[10px] uppercase tracking-widest text-text-tertiary">{label}</div>
      </div>
    </div>
  )
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const options: Array<{ key: SortKey; label: string; icon: React.ReactNode }> = [
    { key: 'created_asc',  label: 'Plus anciennes',     icon: <FiArrowUp className="w-3 h-3" /> },
    { key: 'created_desc', label: 'Plus récentes',      icon: <FiArrowDown className="w-3 h-3" /> },
    { key: 'due_asc',      label: 'À revoir bientôt',   icon: <FiClock className="w-3 h-3" /> },
    { key: 'hardest',      label: 'Plus difficiles',    icon: <FiZap className="w-3 h-3" /> },
    { key: 'alpha',        label: 'Alphabétique',       icon: <FiList className="w-3 h-3" /> },
  ]
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="input py-2 pl-3 pr-8 text-sm min-h-[40px] cursor-pointer"
      style={{ backgroundImage: 'none' }}
    >
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )
}

function CardTile({
  card, flipped, onFlip, starred, suspended, onStar, onSuspend, onEdit, onDelete, deleting,
  selectMode, selected, onSelect,
}: {
  card: FlashcardCardWithReview
  flipped: boolean
  onFlip: () => void
  starred: boolean
  suspended: boolean
  onStar: () => void
  onSuspend: () => void
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
  selectMode: boolean
  selected: boolean
  onSelect: () => void
}) {
  const dueLabel = card.review
    ? new Date(card.review.due_date) <= new Date()
      ? 'à revoir'
      : `dans ${Math.ceil((new Date(card.review.due_date).getTime() - Date.now()) / 86400000)} j`
    : 'jamais étudiée'
  return (
    <div className={`group relative rounded-2xl ${selected ? 'ring-2 ring-text-primary' : ''}`}>
      {selectMode && (
        <button
          onClick={onSelect}
          className={`absolute top-3 left-3 z-10 w-7 h-7 rounded-lg border-2 flex items-center justify-center ${
            selected ? 'bg-text-primary border-text-primary text-background' : 'bg-background/70 border-border-light text-transparent'
          }`}
        >
          <FiCheck className="w-4 h-4" />
        </button>
      )}

      <div onClick={selectMode ? onSelect : onFlip} className="cursor-pointer">
        <FlashcardCard
          card={card}
          flipped={flipped}
          showActions={false}
          starred={starred}
          suspended={suspended}
          passive
        />
      </div>

      <div className="absolute top-3 right-3 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onStar() }} title={starred ? 'Retirer des favoris' : 'Mettre en favori'}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
            starred ? 'border-amber-400/50 bg-amber-400/10 text-amber-400' : 'border-border bg-elevated text-text-tertiary hover:text-amber-400'
          }`}>
          <FiStar className={`w-3.5 h-3.5 ${starred ? 'fill-current' : ''}`} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onSuspend() }} title={suspended ? 'Réactiver' : 'Suspendre'}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
            suspended ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400' : 'border-border bg-elevated text-text-tertiary hover:text-cyan-400'
          }`}>
          <FiBookmark className={`w-3.5 h-3.5 ${suspended ? 'fill-current' : ''}`} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit() }} title="Modifier"
          className="w-8 h-8 rounded-lg border border-border bg-elevated text-text-tertiary hover:text-text-primary flex items-center justify-center">
          <FiEdit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} disabled={deleting} title="Supprimer"
          className="w-8 h-8 rounded-lg border border-border bg-elevated text-text-tertiary hover:text-error flex items-center justify-center disabled:opacity-50">
          <FiTrash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-background/80 border border-border text-text-tertiary mono uppercase tracking-widest">
          {dueLabel}
        </span>
        {suspended && <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400 mono">suspendue</span>}
      </div>
    </div>
  )
}

function CardListView({
  cards, starred, suspended, onStar, onSuspend, onEdit, onDelete, deletingCardId,
  selectMode, selected, onSelect,
}: {
  cards: FlashcardCardWithReview[]
  starred: Set<string>
  suspended: Set<string>
  onStar: (id: string) => void
  onSuspend: (id: string) => void
  onEdit: (c: FlashcardCardWithReview) => void
  onDelete: (id: string) => void
  deletingCardId: string | null
  selectMode: boolean
  selected: Set<string>
  onSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div className="border border-border rounded-2xl bg-surface overflow-hidden">
      {cards.map((c, i) => {
        const isSel = selected.has(c.id)
        const open = expanded.has(c.id)
        return (
          <div
            key={c.id}
            className={`flex items-stretch border-b border-border last:border-b-0 ${isSel ? 'bg-text-primary/5' : 'hover:bg-elevated'}`}
          >
            {selectMode && (
              <button
                onClick={() => onSelect(c.id)}
                className={`w-12 flex items-center justify-center border-r border-border ${isSel ? 'bg-text-primary/10 text-text-primary' : 'text-text-tertiary'}`}
              >
                <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${isSel ? 'bg-text-primary border-text-primary text-background' : 'border-border-light'}`}>
                  {isSel && <FiCheck className="w-3.5 h-3.5" />}
                </span>
              </button>
            )}
            <button
              onClick={() => selectMode ? onSelect(c.id) : toggle(c.id)}
              className="flex-1 text-left px-4 py-3 flex items-start gap-3 min-w-0"
            >
              <span className="text-xs text-text-tertiary mono w-6 flex-shrink-0 pt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary line-clamp-2">{c.front}</div>
                {open && <div className="mt-2 text-sm text-text-secondary border-l-2 border-border pl-3">{c.back}</div>}
                {c.tags?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-background border border-border text-text-tertiary">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <FiEye className={`w-4 h-4 mt-0.5 flex-shrink-0 ${open ? 'text-text-primary' : 'text-text-tertiary'}`} />
            </button>
            <div className="flex items-center gap-1 px-2 border-l border-border">
              <button onClick={() => onStar(c.id)} className={`w-9 h-9 flex items-center justify-center rounded-lg ${starred.has(c.id) ? 'text-amber-400' : 'text-text-tertiary hover:text-amber-400'}`}>
                <FiStar className={`w-4 h-4 ${starred.has(c.id) ? 'fill-current' : ''}`} />
              </button>
              <button onClick={() => onSuspend(c.id)} className={`w-9 h-9 flex items-center justify-center rounded-lg ${suspended.has(c.id) ? 'text-cyan-400' : 'text-text-tertiary hover:text-cyan-400'}`}>
                <FiBookmark className={`w-4 h-4 ${suspended.has(c.id) ? 'fill-current' : ''}`} />
              </button>
              <button onClick={() => onEdit(c)} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary">
                <FiEdit2 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(c.id)} disabled={deletingCardId === c.id} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-error disabled:opacity-40">
                <FiTrash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------- utilitaires ------------------------------- */

function esc(s: string): string {
  return (s ?? '').replace(/\t/g, '  ').replace(/\r?\n/g, ' ')
}

function download(filename: string, content: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// petit alias d'icône pour ne pas importer un autre fichier
function FiRefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.418 8a8 8 0 0 0-14.836 0M4.582 16a8 8 0 0 0 14.836 0M5 4v4h4M19 20v-4h-4" />
    </svg>
  )
}
