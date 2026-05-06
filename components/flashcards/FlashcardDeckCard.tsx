'use client'

import Link from 'next/link'
import { FiArrowRight, FiLayers, FiClock, FiZap } from 'react-icons/fi'
import type { FlashcardDeck } from '@/types/flashcard'

interface Props {
  deck: FlashcardDeck
  onDelete?: (id: string) => void
}

function ProgressRing({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const r = 18
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)

  return (
    <svg width="44" height="44" className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={color}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  )
}

export default function FlashcardDeckCard({ deck, onDelete }: Props) {
  const learnedCount = deck.total_cards - deck.new_count
  const learnedPct = deck.total_cards > 0 ? Math.round((learnedCount / deck.total_cards) * 100) : 0

  return (
    <div className="group relative bg-elevated border border-border rounded-2xl p-6 hover:bg-hover hover:border-border-light hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="font-medium text-text-primary truncate group-hover:text-text-primary">
            {deck.name}
          </h3>
          {deck.description && (
            <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{deck.description}</p>
          )}
          {deck.source_pdf_name && (
            <p className="text-xs text-text-tertiary mono mt-1 truncate opacity-60">
              {deck.source_pdf_name}
            </p>
          )}
        </div>

        {/* Progress ring */}
        <div className="flex-shrink-0 relative">
          <ProgressRing value={learnedCount} max={deck.total_cards} color="text-emerald-400" />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium mono text-text-secondary">
            {learnedPct}%
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <FiLayers className="w-3.5 h-3.5" />
          <span>{deck.total_cards} cards</span>
        </div>

        {deck.due_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-orange-400">
            <FiClock className="w-3.5 h-3.5" />
            <span>{deck.due_count} due</span>
          </div>
        )}

        {deck.new_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-blue-400">
            <FiZap className="w-3.5 h-3.5" />
            <span>{deck.new_count} new</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={`/flashcards/${deck.id}?tab=study`}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            deck.due_count > 0 || deck.new_count > 0
              ? 'bg-text-primary text-background hover:opacity-90'
              : 'border border-border text-text-secondary hover:border-border-light hover:bg-surface'
          }`}
        >
          <FiZap className="w-3.5 h-3.5" strokeWidth={2} />
          {deck.due_count > 0 || deck.new_count > 0 ? `Study (${deck.due_count + deck.new_count})` : 'Review'}
        </Link>
        <Link
          href={`/flashcards/${deck.id}`}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text-tertiary hover:border-border-light hover:text-text-primary transition-all"
        >
          <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      </div>

      {onDelete && (
        <button
          onClick={(e) => { e.preventDefault(); onDelete(deck.id) }}
          className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-text-tertiary
            opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10 transition-all text-xs"
          title="Delete deck"
        >
          ×
        </button>
      )}
    </div>
  )
}
