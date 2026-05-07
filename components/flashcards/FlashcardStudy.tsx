'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  FiCheck, FiX, FiMinus, FiPlus, FiRotateCcw, FiStar, FiPause, FiPlay,
  FiBookmark, FiHelpCircle, FiArrowLeft, FiClock, FiZap, FiEye,
} from 'react-icons/fi'
import FlashcardCard from './FlashcardCard'
import SwipeableCard, { flyOut, type SwipeDirection } from './SwipeableCard'
import {
  loadStarred, saveStarred,
  loadSuspended, saveSuspended,
} from '@/lib/flashcard-prefs'
import type {
  FlashcardCardWithReview, ReviewQuality, SessionSummary,
} from '@/types/flashcard'
import type { SessionPrefs } from '@/lib/flashcard-prefs'

interface Props {
  deckId: string
  cards: FlashcardCardWithReview[]
  prefs: SessionPrefs
  accessToken: string
  onFinish: (summary: SessionSummary) => void
  onExit: () => void
}

type ReviewedEntry = {
  cardId: string
  quality: ReviewQuality
  index: number
}

const QUALITY_BUTTONS: Array<{
  quality: ReviewQuality
  label: string
  sublabel: string
  shortcut: string
  className: string
  icon: React.ReactNode
  /** Direction de swipe correspondante. */
  swipe: SwipeDirection
}> = [
  {
    quality: 0, label: 'À revoir', sublabel: '<1 min', shortcut: '1',
    className: 'border-red-500/40 text-red-400 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/60',
    icon: <FiX className="w-5 h-5" />,
    swipe: 'left',
  },
  {
    quality: 2, label: 'Difficile', sublabel: '~1 j', shortcut: '2',
    className: 'border-orange-500/40 text-orange-400 bg-orange-500/5 hover:bg-orange-500/15 hover:border-orange-500/60',
    icon: <FiMinus className="w-5 h-5" />,
    swipe: 'up',
  },
  {
    quality: 3, label: 'Bien', sublabel: 'Normal', shortcut: '3',
    className: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 hover:border-emerald-500/60',
    icon: <FiCheck className="w-5 h-5" />,
    swipe: 'down',
  },
  {
    quality: 5, label: 'Facile', sublabel: 'Long', shortcut: '4',
    className: 'border-blue-500/40 text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 hover:border-blue-500/60',
    icon: <FiPlus className="w-5 h-5" />,
    swipe: 'right',
  },
]

const SWIPE_TO_QUALITY: Record<SwipeDirection, ReviewQuality> = {
  left: 0, up: 2, down: 3, right: 5,
}

const SWIPE_LABEL: Record<SwipeDirection, string> = {
  left: 'À revoir', up: 'Difficile', down: 'Bien', right: 'Facile',
}

export default function FlashcardStudy({
  deckId, cards: initialCards, prefs, accessToken, onFinish, onExit,
}: Props) {
  const [cards, setCards] = useState<FlashcardCardWithReview[]>(initialCards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reviewedHistory, setReviewedHistory] = useState<ReviewedEntry[]>([])
  const [starred, setStarred] = useState<Set<string>>(() => loadStarred(deckId))
  const [suspended, setSuspended] = useState<Set<string>>(() => loadSuspended(deckId))
  const [dragIntent, setDragIntent] = useState<SwipeDirection | null>(null)
  const [dragMagnitude, setDragMagnitude] = useState(0)
  const [reverseOverride, setReverseOverride] = useState<boolean | null>(null)

  // Refs pour les boutons → permet à un clic de déclencher la même animation
  // de fly-out qu'un swipe, donc même feeling sur desktop et tablette.
  const cardRef = useRef<HTMLDivElement>(null)

  const startTimeRef = useRef<number>(Date.now())
  const cardStartTimeRef = useRef<number>(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // Tick d'horloge — pause-aware
  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [paused])

  const currentCard = cards[currentIndex]
  const isLast = currentIndex >= cards.length - 1
  const reviewed = reviewedHistory.length
  const progress = cards.length === 0 ? 0 : Math.round((reviewed / cards.length) * 100)

  const summary = useMemo<SessionSummary>(() => {
    let again = 0, hard = 0, good = 0, easy = 0
    for (const r of reviewedHistory) {
      if (r.quality === 0) again++
      else if (r.quality === 2 || r.quality === 1) hard++
      else if (r.quality === 3 || r.quality === 4) good++
      else if (r.quality === 5) easy++
    }
    return { total: cards.length, again, hard, good, easy, newIntervals: [] }
  }, [reviewedHistory, cards.length])

  // Direction d'affichage pour la carte courante (gère "mixed")
  const reverseForCurrent = useMemo(() => {
    if (reverseOverride !== null) return reverseOverride
    if (prefs.direction === 'front_to_back') return false
    if (prefs.direction === 'back_to_front') return true
    // mixed → on choisit déterministe par l'id pour rester stable au reflip
    return (currentCard?.id?.charCodeAt(0) ?? 0) % 2 === 1
  }, [prefs.direction, currentCard?.id, reverseOverride])

  // Auto-flip optionnel
  useEffect(() => {
    setReverseOverride(null)
    setShowHint(false)
    cardStartTimeRef.current = Date.now()
    if (prefs.autoFlipSec > 0 && !flipped && !paused) {
      const id = window.setTimeout(() => setFlipped(true), prefs.autoFlipSec * 1000)
      return () => window.clearTimeout(id)
    }
  }, [currentIndex, flipped, prefs.autoFlipSec, paused])

  /* ------------------------------- mutations ------------------------------- */

  const persistReview = useCallback(async (cardId: string, quality: ReviewQuality) => {
    try {
      await fetch(`/api/flashcards/${deckId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ cardId, quality }),
      })
    } catch {
      // Non-fatal : on continue la session même si la sauvegarde échoue.
    }
  }, [deckId, accessToken])

  const goToNextOrFinish = useCallback((nextHistory: ReviewedEntry[]) => {
    if (isLast) {
      const final: SessionSummary = nextHistory.reduce<SessionSummary>(
        (acc, r) => {
          if (r.quality === 0) acc.again++
          else if (r.quality === 2 || r.quality === 1) acc.hard++
          else if (r.quality === 3 || r.quality === 4) acc.good++
          else if (r.quality === 5) acc.easy++
          return acc
        },
        { total: cards.length, again: 0, hard: 0, good: 0, easy: 0, newIntervals: [] }
      )
      onFinish(final)
    } else {
      setFlipped(false)
      setShowHint(false)
      window.setTimeout(() => setCurrentIndex((i) => i + 1), 60)
    }
  }, [isLast, cards.length, onFinish])

  const submitRating = useCallback(async (quality: ReviewQuality, fromSwipe = false) => {
    if (submitting || !currentCard || paused) return
    setSubmitting(true)

    const entry: ReviewedEntry = { cardId: currentCard.id, quality, index: currentIndex }
    const nextHistory = [...reviewedHistory, entry]
    setReviewedHistory(nextHistory)

    persistReview(currentCard.id, quality)

    if (!fromSwipe) {
      // Bouton cliqué → on simule la même animation de fly-out par direction.
      const dir = QUALITY_BUTTONS.find((b) => b.quality === quality)?.swipe
      if (dir && cardRef.current) {
        flyOut(cardRef.current, dir)
        // La sortie animée durera ~240ms — on enchaîne après.
        window.setTimeout(() => {
          goToNextOrFinish(nextHistory)
          setSubmitting(false)
        }, 250)
        return
      }
    }
    goToNextOrFinish(nextHistory)
    setSubmitting(false)
  }, [submitting, currentCard, paused, currentIndex, reviewedHistory, persistReview, goToNextOrFinish])

  const handleSwipe = useCallback((direction: SwipeDirection) => {
    if (!flipped) {
      // Swipe alors qu'on n'a pas vu la réponse : on annule et on flip.
      setFlipped(true)
      return
    }
    const quality = SWIPE_TO_QUALITY[direction]
    submitRating(quality, true)
  }, [flipped, submitRating])

  const handleUndo = useCallback(() => {
    if (reviewedHistory.length === 0) return
    const previous = reviewedHistory[reviewedHistory.length - 1]
    setReviewedHistory((h) => h.slice(0, -1))
    setCurrentIndex(previous.index)
    setFlipped(false)
    setShowHint(false)
    // Note : on ne re-revert pas la dernière review côté serveur, mais l'UX
    // permet de re-noter la carte tout de suite, ce qui écrase l'entrée
    // précédente côté backend.
  }, [reviewedHistory])

  const toggleStar = useCallback(() => {
    if (!currentCard) return
    const next = new Set(starred)
    if (next.has(currentCard.id)) next.delete(currentCard.id)
    else next.add(currentCard.id)
    setStarred(next)
    saveStarred(deckId, next)
  }, [currentCard, starred, deckId])

  const toggleSuspended = useCallback(() => {
    if (!currentCard) return
    const next = new Set(suspended)
    if (next.has(currentCard.id)) next.delete(currentCard.id)
    else next.add(currentCard.id)
    setSuspended(next)
    saveSuspended(deckId, next)
  }, [currentCard, suspended, deckId])

  /* ------------------------------ raccourcis ------------------------------- */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!flipped) setFlipped(true)
        return
      }
      if (e.key === 'h' || e.key === 'H') { setShowHint((v) => !v); return }
      if (e.key === 's' || e.key === 'S') { toggleStar(); return }
      if (e.key === 'p' || e.key === 'P') { setPaused((v) => !v); return }
      if (e.key === 'u' || e.key === 'U') { handleUndo(); return }
      if (e.key === 'r' || e.key === 'R') { setReverseOverride((v) => v === null ? !reverseForCurrent : !v); return }
      if (e.key === 'Escape') { onExit(); return }
      if (flipped) {
        if (e.key === '1') { e.preventDefault(); submitRating(0); return }
        if (e.key === '2') { e.preventDefault(); submitRating(2); return }
        if (e.key === '3') { e.preventDefault(); submitRating(3); return }
        if (e.key === '4') { e.preventDefault(); submitRating(5); return }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); submitRating(0); return }
        if (e.key === 'ArrowRight') { e.preventDefault(); submitRating(5); return }
        if (e.key === 'ArrowUp')    { e.preventDefault(); submitRating(2); return }
        if (e.key === 'ArrowDown')  { e.preventDefault(); submitRating(3); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flipped, submitRating, handleUndo, toggleStar, onExit, reverseForCurrent])

  /* ------------------------------ rendu pause ------------------------------ */

  if (paused) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-elevated border border-border flex items-center justify-center mb-6">
          <FiPause className="w-8 h-8 text-text-secondary" />
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-text-primary mb-2">Pause</h2>
        <p className="text-sm text-text-secondary mb-6">
          {reviewed} / {cards.length} cartes vues · {formatTime(elapsed)} écoulé
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={() => setPaused(false)} className="btn-primary text-base px-6 py-3 min-h-[52px]">
            <FiPlay className="w-5 h-5" /> Reprendre
          </button>
          <button onClick={onExit} className="btn-secondary text-base px-6 py-3 min-h-[52px]">
            Quitter la session
          </button>
        </div>
      </div>
    )
  }

  if (!currentCard) return null

  const isStarred = starred.has(currentCard.id)
  const isSuspended = suspended.has(currentCard.id)
  const upcoming = cards.slice(currentIndex + 1, currentIndex + 3)

  /* --------------------------------- rendu --------------------------------- */

  return (
    <div className="study-no-highlight flex flex-col h-[calc(100vh-3.5rem)] min-h-[600px] flashcard-arena">

      {/* ============================== Top bar ============================== */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-8 py-3 border-b border-border">
        <button onClick={onExit} className="btn-ghost px-3 py-2 min-h-[40px]">
          <FiArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Quitter</span>
        </button>

        <div className="flex items-center gap-2 md:gap-4 mono text-xs text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <FiClock className="w-3.5 h-3.5" />
            {formatTime(elapsed)}
          </span>
          <span className="text-text-secondary">{currentIndex + 1} / {cards.length}</span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline text-emerald-400">{summary.good + summary.easy} ✓</span>
          <span className="hidden md:inline text-red-400">{summary.again} ✗</span>
        </div>

        <div className="flex items-center gap-1">
          <ToolbarBtn onClick={handleUndo} disabled={reviewedHistory.length === 0} title="Annuler la dernière (U)">
            <FiRotateCcw className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => setReverseOverride((v) => v === null ? !reverseForCurrent : !v)} title="Inverser recto/verso (R)" active={reverseForCurrent}>
            <FiZap className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={toggleStar} title="Favori (S)" active={isStarred}>
            <FiStar className={`w-4 h-4 ${isStarred ? 'fill-current text-amber-400' : ''}`} />
          </ToolbarBtn>
          <ToolbarBtn onClick={toggleSuspended} title="Suspendre" active={isSuspended}>
            <FiBookmark className={`w-4 h-4 ${isSuspended ? 'fill-current text-cyan-400' : ''}`} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => setPaused(true)} title="Pause (P)">
            <FiPause className="w-4 h-4" />
          </ToolbarBtn>
        </div>
      </div>

      {/* ============================ Progress bar =========================== */}
      <div className="w-full h-1 bg-elevated overflow-hidden">
        <div
          className="h-full bg-text-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ===================== Mini-frise / progress dots ==================== */}
      {prefs.showProgressDots && (
        <div className="px-4 md:px-8 pt-3 pb-1 overflow-x-auto">
          <div className="flex items-center gap-1.5 mono text-[10px]">
            {cards.map((c, i) => {
              const past = reviewedHistory.find((r) => r.index === i)
              let bg = 'bg-border'
              if (past) {
                if (past.quality === 0) bg = 'bg-red-500'
                else if (past.quality === 2 || past.quality === 1) bg = 'bg-orange-500'
                else if (past.quality === 3 || past.quality === 4) bg = 'bg-emerald-500'
                else if (past.quality === 5) bg = 'bg-blue-500'
              } else if (i === currentIndex) bg = 'bg-text-primary'
              const isStar = starred.has(c.id)
              return (
                <span
                  key={c.id}
                  className={`relative h-1.5 flex-1 min-w-[8px] max-w-[20px] rounded-full ${bg} ${i === currentIndex ? 'ring-2 ring-text-primary ring-offset-1 ring-offset-background' : ''}`}
                  title={`Carte ${i + 1}${isStar ? ' · favori' : ''}${past ? ` · noté ${labelForQuality(past.quality)}` : ''}`}
                >
                  {isStar && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-amber-400 text-[8px]">★</span>}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ================================ Card =============================== */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-4 md:py-6 overflow-hidden">
        <div className="relative w-full max-w-3xl flashcard-stack" style={{ minHeight: 'min(60vh, 540px)' }}>

          {/* Cartes du dessous (peek) */}
          {upcoming[1] && (
            <div className="flashcard-stack-item flashcard-stack-next-2">
              <FlashcardCard card={upcoming[1]} flipped={false} reverse={false} passive size="large" />
            </div>
          )}
          {upcoming[0] && (
            <div className="flashcard-stack-item flashcard-stack-next">
              <FlashcardCard card={upcoming[0]} flipped={false} reverse={false} passive size="large" />
            </div>
          )}

          {/* Carte active */}
          <div className="flashcard-stack-active relative" ref={cardRef as any}>
            {prefs.swipeEnabled ? (
              <SwipeableCard
                onSwipe={handleSwipe}
                onTap={() => setFlipped((v) => !v)}
                disabled={submitting}
                enableVertical
                onDragChange={({ x, y, intent }) => {
                  setDragIntent(intent)
                  setDragMagnitude(Math.max(Math.abs(x), Math.abs(y)))
                }}
              >
                <CardWithOverlays
                  card={currentCard}
                  flipped={flipped}
                  reverse={reverseForCurrent}
                  showHint={showHint}
                  isStarred={isStarred}
                  isSuspended={isSuspended}
                  onToggleStar={toggleStar}
                  onToggleSuspended={toggleSuspended}
                  ttsLang={prefs.ttsAutoplay ? 'fr-FR' : null}
                  dragIntent={dragIntent}
                  dragMagnitude={dragMagnitude}
                  flippedHelp={!flipped}
                />
              </SwipeableCard>
            ) : (
              <CardWithOverlays
                card={currentCard}
                flipped={flipped}
                reverse={reverseForCurrent}
                showHint={showHint}
                isStarred={isStarred}
                isSuspended={isSuspended}
                onToggleStar={toggleStar}
                onToggleSuspended={toggleSuspended}
                ttsLang={prefs.ttsAutoplay ? 'fr-FR' : null}
                dragIntent={null}
                dragMagnitude={0}
                onTap={() => setFlipped((v) => !v)}
                flippedHelp={!flipped}
              />
            )}
          </div>
        </div>

        {/* Hint button */}
        {currentCard.hint && !flipped && (
          <button
            onClick={() => setShowHint((v) => !v)}
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <FiHelpCircle className="w-3.5 h-3.5" />
            {showHint ? 'Cacher l\'indice' : 'Afficher un indice'}
          </button>
        )}
      </div>

      {/* ============================== Actions ============================== */}
      <div className="px-4 md:px-8 pb-4 md:pb-6 pt-2">
        {!flipped ? (
          <div className="flex flex-col items-center gap-3 max-w-3xl mx-auto">
            <button
              onClick={() => setFlipped(true)}
              className="w-full rating-btn border-text-primary bg-text-primary text-background hover:opacity-90"
            >
              <FiEye className="w-5 h-5 mb-1" />
              <span>Révéler la réponse</span>
              <span className="shortcut">Espace · Toucher la carte</span>
            </button>
            {prefs.swipeEnabled && (
              <p className="text-xs text-text-tertiary text-center">
                Astuce — vous pouvez aussi glisser la carte dans n'importe quelle direction pour la retourner
              </p>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <p className="text-center text-xs text-text-tertiary mb-3 uppercase tracking-widest">
              À quel point connaissiez-vous cette carte ?
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {QUALITY_BUTTONS.map((btn) => (
                <button
                  key={btn.quality}
                  onClick={() => submitRating(btn.quality)}
                  disabled={submitting}
                  className={`rating-btn ${btn.className} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {btn.icon}
                  <span>{btn.label}</span>
                  <span className="text-xs opacity-60 font-normal">{btn.sublabel}</span>
                  <span className="shortcut">
                    {btn.shortcut} · {arrowFor(btn.swipe)}
                  </span>
                </button>
              ))}
            </div>
            {prefs.swipeEnabled && (
              <p className="text-center text-[11px] text-text-tertiary mt-3 mono opacity-60">
                ← À revoir · → Facile · ↑ Difficile · ↓ Bien
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------- helpers & sous-vues -------------------------- */

function ToolbarBtn({
  onClick, disabled, title, children, active,
}: { onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-10 h-10 md:w-9 md:h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? 'bg-elevated text-text-primary border border-border-light' : 'text-text-tertiary hover:text-text-primary hover:bg-elevated'
      }`}
    >
      {children}
    </button>
  )
}

function CardWithOverlays({
  card, flipped, reverse, showHint, isStarred, isSuspended, onToggleStar, onToggleSuspended,
  ttsLang, dragIntent, dragMagnitude, onTap, flippedHelp,
}: {
  card: FlashcardCardWithReview
  flipped: boolean
  reverse: boolean
  showHint: boolean
  isStarred: boolean
  isSuspended: boolean
  onToggleStar: () => void
  onToggleSuspended: () => void
  ttsLang: string | null
  dragIntent: SwipeDirection | null
  dragMagnitude: number
  onTap?: () => void
  flippedHelp?: boolean
}) {
  // Opacity du overlay grandit avec la magnitude du drag (max ~0.85 vers 200px).
  const opacity = Math.min(0.85, Math.max(0, (dragMagnitude - 24) / 200))

  return (
    <div
      className="relative"
      onClick={onTap ? (e) => {
        const target = e.target as HTMLElement
        if (target.closest('[data-card-action]')) return
        onTap()
      } : undefined}
    >
      <FlashcardCard
        card={card}
        flipped={flipped}
        reverse={reverse}
        showHint={showHint}
        showActions
        starred={isStarred}
        suspended={isSuspended}
        onToggleStar={onToggleStar}
        onToggleSuspended={onToggleSuspended}
        autoTtsLang={ttsLang}
        size="large"
        passive
      />

      {/* Overlays directionnels — guidance visuelle pendant le swipe */}
      {(['left','right','up','down'] as SwipeDirection[]).map((dir) => (
        <div
          key={dir}
          className={`swipe-overlay swipe-overlay-${dir}`}
          style={{ opacity: dragIntent === dir ? opacity : 0 }}
        >
          <span className="text-2xl md:text-3xl">{SWIPE_LABEL[dir]}</span>
        </div>
      ))}
    </div>
  )
}

function arrowFor(d: SwipeDirection): string {
  switch (d) { case 'left': return '←'; case 'right': return '→'; case 'up': return '↑'; case 'down': return '↓' }
}

function labelForQuality(q: ReviewQuality): string {
  if (q === 0) return 'À revoir'
  if (q <= 2) return 'Difficile'
  if (q <= 4) return 'Bien'
  return 'Facile'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
