'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import type { FlashcardCardWithReview, CardType } from '@/types/flashcard'

interface Props {
  card: FlashcardCardWithReview
  flipped?: boolean
  onFlip?: () => void
  showHint?: boolean
}

const CARD_TYPE_LABELS: Record<CardType, { label: string; color: string }> = {
  basic: { label: 'Basic', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  cloze: { label: 'Cloze', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  definition: { label: 'Definition', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
}

function MarkdownContent({ content }: { content: string }) {
  // Replace cloze markers {{c1::answer}} → underlined answer on back, blank on front
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
        code: ({ children }) => (
          <code className="px-1.5 py-0.5 rounded bg-surface text-xs mono border border-border">{children}</code>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 italic text-text-secondary">{children}</blockquote>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2">{children}</ol>,
        li: ({ children }) => <li className="text-text-secondary">{children}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default function FlashcardCard({ card, flipped = false, onFlip, showHint = false }: Props) {
  const typeInfo = CARD_TYPE_LABELS[card.card_type] || CARD_TYPE_LABELS.basic

  const frontContent = card.card_type === 'cloze'
    ? card.front.replace(/\{\{c1::([^}]+)\}\}/g, '_____')
    : card.front

  const backContent = card.back

  return (
    <div className="relative w-full cursor-pointer" onClick={onFlip}>
      {/* Front — hidden when flipped */}
      <div
        className={`w-full rounded-2xl border border-border bg-elevated p-8 flex flex-col transition-opacity duration-200 ${
          flipped ? 'hidden' : 'block'
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          {card.source_page && (
            <span className="text-xs text-text-tertiary mono">p.{card.source_page}</span>
          )}
        </div>

        <div className="min-h-[140px] flex items-center justify-center text-center">
          <div className="text-lg text-text-primary font-medium leading-relaxed max-w-lg">
            <MarkdownContent content={frontContent} />
          </div>
        </div>

        {showHint && card.hint && (
          <div className="mt-4 pt-4 border-t border-border text-center">
            <span className="text-xs text-text-tertiary italic">💡 {card.hint}</span>
          </div>
        )}

        <div className="mt-6 text-center">
          <span className="text-xs text-text-tertiary">Tap to reveal answer</span>
        </div>
      </div>

      {/* Back — shown when flipped, auto-height so long answers are fully visible */}
      <div
        className={`w-full rounded-2xl border border-border bg-surface p-8 flex flex-col transition-opacity duration-200 ${
          flipped ? 'block' : 'hidden'
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          <span className="text-xs text-text-tertiary">Answer</span>
        </div>

        <div className="text-base text-text-primary leading-relaxed text-left">
          <MarkdownContent content={backContent} />
        </div>

        {card.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {card.tags.map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-background border border-border text-text-tertiary">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
