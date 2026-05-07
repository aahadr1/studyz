'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FiPlay, FiClock, FiShuffle, FiStar, FiRotateCcw, FiTag,
  FiZap, FiCheckCircle, FiArrowLeft, FiVolume2,
} from 'react-icons/fi'
import type { FlashcardCardWithReview } from '@/types/flashcard'
import {
  DEFAULT_SESSION_PREFS,
  loadSessionPrefs,
  saveSessionPrefs,
  loadStarred,
  loadSuspended,
  type SessionPrefs,
  type StudyMode,
  type StudyOrder,
  type StudyDirection,
} from '@/lib/flashcard-prefs'

interface Props {
  deckId: string
  deckName: string
  /** Toutes les cartes du deck (avec leur état de révision). */
  allCards: FlashcardCardWithReview[]
  /** Cartes "due" calculées côté serveur (cartes en retard + nouvelles). */
  dueCards: FlashcardCardWithReview[]
  /** Lance la session avec les cartes filtrées + les préférences. */
  onStart: (cards: FlashcardCardWithReview[], prefs: SessionPrefs) => void
  /** Retour vers la vue liste. */
  onBack: () => void
}

const MODES: Array<{ value: StudyMode; label: string; description: string; icon: React.ReactNode }> = [
  { value: 'spaced',     label: 'Révision intelligente', description: 'Cartes en retard + nouvelles (algorithme SM-2)', icon: <FiZap className="w-4 h-4" /> },
  { value: 'cram',       label: 'Bachotage',            description: 'Toutes les cartes, ignore le calendrier',         icon: <FiClock className="w-4 h-4" /> },
  { value: 'starred',    label: 'Favoris uniquement',   description: 'Réviser les cartes mises en favori',              icon: <FiStar className="w-4 h-4" /> },
  { value: 'again_only', label: 'Cartes ratées',        description: 'Cartes répondues "À revoir" récemment',           icon: <FiRotateCcw className="w-4 h-4" /> },
]

const ORDERS: Array<{ value: StudyOrder; label: string }> = [
  { value: 'due_first',     label: 'Plus en retard d\'abord' },
  { value: 'random',        label: 'Aléatoire' },
  { value: 'hardest_first', label: 'Plus difficiles d\'abord' },
  { value: 'newest_first',  label: 'Plus récentes d\'abord' },
  { value: 'oldest_first',  label: 'Plus anciennes d\'abord' },
]

const DIRECTIONS: Array<{ value: StudyDirection; label: string; description: string }> = [
  { value: 'front_to_back', label: 'Recto → Verso',      description: 'Sens normal' },
  { value: 'back_to_front', label: 'Verso → Recto',      description: 'Inverser pour tester l\'autre sens' },
  { value: 'mixed',         label: 'Mélangé',           description: 'Aléatoirement dans les deux sens' },
]

const LIMITS = [10, 20, 30, 50, 100, 9999] as const

export default function StudySetup({ deckId, deckName, allCards, dueCards, onStart, onBack }: Props) {
  const [prefs, setPrefs] = useState<SessionPrefs>(DEFAULT_SESSION_PREFS)
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [suspendedIds, setSuspendedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setPrefs(loadSessionPrefs())
    setStarredIds(loadStarred(deckId))
    setSuspendedIds(loadSuspended(deckId))
  }, [deckId])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    allCards.forEach((c) => c.tags?.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [allCards])

  // Cartes candidates en fonction du mode + filtres
  const filtered = useMemo(() => {
    let pool: FlashcardCardWithReview[] = []
    switch (prefs.mode) {
      case 'spaced':
        pool = dueCards.slice()
        break
      case 'cram':
        pool = allCards.slice()
        break
      case 'starred':
        pool = allCards.filter((c) => starredIds.has(c.id))
        break
      case 'again_only':
        pool = allCards.filter((c) => c.review?.last_quality !== null && (c.review?.last_quality ?? 99) <= 1)
        break
    }

    // Toujours retirer les cartes "suspendues" (sauf en mode favoris où l'utilisateur peut vouloir voir)
    pool = pool.filter((c) => !suspendedIds.has(c.id))

    // Filtre par tags (au moins un tag commun)
    if (prefs.selectedTags.length > 0) {
      pool = pool.filter((c) => c.tags?.some((t) => prefs.selectedTags.includes(t)))
    }

    // Tri
    const byDue = (a: FlashcardCardWithReview, b: FlashcardCardWithReview) => {
      const da = a.review ? new Date(a.review.due_date).getTime() : Number.POSITIVE_INFINITY
      const db = b.review ? new Date(b.review.due_date).getTime() : Number.POSITIVE_INFINITY
      return da - db
    }
    const byEase = (a: FlashcardCardWithReview, b: FlashcardCardWithReview) => {
      const ea = a.review?.ease_factor ?? 2.5
      const eb = b.review?.ease_factor ?? 2.5
      return ea - eb // ease faible = plus difficile
    }
    const byCreated = (a: FlashcardCardWithReview, b: FlashcardCardWithReview) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()

    switch (prefs.order) {
      case 'due_first':     pool.sort(byDue); break
      case 'random':        pool = shuffle(pool); break
      case 'hardest_first': pool.sort(byEase); break
      case 'newest_first':  pool.sort((a, b) => -byCreated(a, b)); break
      case 'oldest_first':  pool.sort(byCreated); break
    }

    if (prefs.shuffle && prefs.order !== 'random') pool = shuffle(pool)

    return pool.slice(0, prefs.limit === 9999 ? pool.length : prefs.limit)
  }, [prefs, allCards, dueCards, starredIds, suspendedIds])

  const update = (patch: Partial<SessionPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    saveSessionPrefs(next)
  }

  const toggleTag = (t: string) => {
    const has = prefs.selectedTags.includes(t)
    update({ selectedTags: has ? prefs.selectedTags.filter((x) => x !== t) : [...prefs.selectedTags, t] })
  }

  const start = () => {
    if (filtered.length === 0) return
    onStart(filtered, prefs)
  }

  return (
    <div className="max-w-4xl mx-auto py-6 md:py-10 px-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="btn-ghost px-3 py-2" title="Retour">
          <FiArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-text-tertiary">Préparer la session</p>
          <h1 className="text-xl md:text-2xl font-semibold text-text-primary truncate">{deckName}</h1>
        </div>
      </div>

      {/* Aperçu rapide */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total" value={allCards.length} />
        <Stat label="À revoir" value={dueCards.length} accent={dueCards.length > 0 ? 'orange' : undefined} />
        <Stat label="Favoris" value={starredIds.size} accent={starredIds.size > 0 ? 'amber' : undefined} />
        <Stat label="Suspendues" value={suspendedIds.size} />
      </div>

      {/* Mode */}
      <Section title="Mode" icon={<FiZap className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => update({ mode: m.value })}
              className={`text-left px-4 py-3.5 rounded-2xl border transition-all min-h-[64px] ${
                prefs.mode === m.value
                  ? 'border-text-primary bg-elevated shadow-sm'
                  : 'border-border bg-surface/60 hover:border-border-light hover:bg-elevated'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-text-primary font-medium">
                {m.icon}
                {m.label}
              </div>
              <p className="text-xs text-text-tertiary">{m.description}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Limite + ordre + sens */}
      <Section title="Réglages" icon={<FiClock className="w-4 h-4" />}>
        <div className="space-y-4">
          <Row label="Nombre de cartes">
            <div className="flex flex-wrap gap-2">
              {LIMITS.map((n) => (
                <button
                  key={n}
                  onClick={() => update({ limit: n })}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium min-h-[40px] ${
                    prefs.limit === n
                      ? 'border-text-primary bg-text-primary text-background'
                      : 'border-border text-text-secondary hover:border-border-light'
                  }`}
                >
                  {n === 9999 ? 'Tout' : n}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Ordre">
            <div className="flex flex-wrap gap-2">
              {ORDERS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => update({ order: o.value })}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium min-h-[40px] ${
                    prefs.order === o.value
                      ? 'border-text-primary bg-elevated'
                      : 'border-border text-text-secondary hover:border-border-light'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Sens">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => update({ direction: d.value })}
                  className={`text-left px-3.5 py-3 rounded-xl border min-h-[56px] ${
                    prefs.direction === d.value
                      ? 'border-text-primary bg-elevated'
                      : 'border-border hover:border-border-light'
                  }`}
                >
                  <div className="text-sm font-medium text-text-primary">{d.label}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">{d.description}</div>
                </button>
              ))}
            </div>
          </Row>

          {/* Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <Toggle
              checked={prefs.shuffle}
              onChange={(v) => update({ shuffle: v })}
              icon={<FiShuffle className="w-4 h-4" />}
              label="Mélanger en plus du tri"
              description="Pratique pour casser la routine."
            />
            <Toggle
              checked={prefs.swipeEnabled}
              onChange={(v) => update({ swipeEnabled: v })}
              icon={<FiZap className="w-4 h-4" />}
              label="Swipes activés"
              description="Glisser ← / → pour À revoir / Facile, ↑ / ↓ pour Difficile / Bien."
            />
            <Toggle
              checked={prefs.showProgressDots}
              onChange={(v) => update({ showProgressDots: v })}
              icon={<FiCheckCircle className="w-4 h-4" />}
              label="Points de progression"
              description="Afficher la mini-frise des cartes au-dessus."
            />
            <Toggle
              checked={prefs.ttsAutoplay}
              onChange={(v) => update({ ttsAutoplay: v })}
              icon={<FiVolume2 className="w-4 h-4" />}
              label="Lecture vocale auto"
              description="Lit chaque face quand elle s'affiche (FR par défaut)."
            />
          </div>

          {/* Auto-flip */}
          <Row label="Retournement automatique">
            <div className="flex flex-wrap gap-2">
              {[0, 5, 8, 12, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => update({ autoFlipSec: s })}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium min-h-[40px] ${
                    prefs.autoFlipSec === s
                      ? 'border-text-primary bg-text-primary text-background'
                      : 'border-border text-text-secondary hover:border-border-light'
                  }`}
                >
                  {s === 0 ? 'Désactivé' : `${s}s`}
                </button>
              ))}
            </div>
          </Row>
        </div>
      </Section>

      {/* Tags */}
      {allTags.length > 0 && (
        <Section title="Filtrer par tags" icon={<FiTag className="w-4 h-4" />}>
          <div className="flex flex-wrap gap-2">
            {allTags.map((t) => {
              const active = prefs.selectedTags.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    active
                      ? 'border-text-primary bg-text-primary text-background'
                      : 'border-border text-text-secondary hover:border-border-light hover:bg-elevated'
                  }`}
                >
                  {t}
                </button>
              )
            })}
            {prefs.selectedTags.length > 0 && (
              <button
                onClick={() => update({ selectedTags: [] })}
                className="px-3 py-1.5 rounded-full border border-error/30 text-error text-xs font-medium hover:bg-error/10"
              >
                Tout effacer
              </button>
            )}
          </div>
        </Section>
      )}

      {/* CTA */}
      <div className="sticky bottom-4 mt-8 rounded-2xl bg-elevated border border-border p-4 md:p-5 shadow-lg flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-text-tertiary mb-1">Session prête</div>
          <div className="text-text-primary font-medium">
            {filtered.length === 0
              ? 'Aucune carte ne correspond aux filtres'
              : `${filtered.length} carte${filtered.length > 1 ? 's' : ''} sélectionnée${filtered.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <button
          onClick={start}
          disabled={filtered.length === 0}
          className="btn-primary text-base px-6 py-3.5 min-h-[52px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiPlay className="w-5 h-5" />
          Démarrer
        </button>
      </div>
    </div>
  )
}

/* --------------------------------- helpers -------------------------------- */

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'orange' | 'amber' }) {
  const accentClass = accent === 'orange'
    ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
    : accent === 'amber'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    : 'border-border bg-elevated text-text-primary'
  return (
    <div className={`rounded-2xl border ${accentClass} p-4`}>
      <div className="text-2xl md:text-3xl font-semibold mono">{value}</div>
      <div className="text-xs uppercase tracking-widest text-text-tertiary mt-1">{label}</div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-text-tertiary mb-3">
        {icon}
        {title}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-text-tertiary uppercase tracking-widest mb-2">{label}</div>
      {children}
    </div>
  )
}

function Toggle({
  checked, onChange, icon, label, description,
}: { checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string; description: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`text-left flex items-start gap-3 p-3.5 rounded-2xl border min-h-[64px] transition-colors ${
        checked
          ? 'border-text-primary bg-elevated'
          : 'border-border bg-surface/60 hover:border-border-light hover:bg-elevated'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        checked ? 'bg-text-primary text-background' : 'bg-elevated text-text-secondary border border-border'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary flex items-center gap-2">
          {label}
          <span className={`ml-auto text-[10px] uppercase tracking-widest mono ${checked ? 'text-emerald-400' : 'text-text-tertiary'}`}>
            {checked ? 'Activé' : 'Désactivé'}
          </span>
        </div>
        <div className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</div>
      </div>
    </button>
  )
}
