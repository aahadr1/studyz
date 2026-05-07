'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import { FiStar, FiVolume2, FiBookmark } from 'react-icons/fi'
import type { FlashcardCardWithReview, CardType } from '@/types/flashcard'

interface Props {
  card: FlashcardCardWithReview
  flipped?: boolean
  onFlip?: () => void
  showHint?: boolean
  /** Inverse l'affichage (révise back→front au lieu de front→back). */
  reverse?: boolean
  /** Affiche les contrôles d'étude (favori, TTS, masquer). */
  showActions?: boolean
  starred?: boolean
  suspended?: boolean
  onToggleStar?: () => void
  onToggleSuspended?: () => void
  /** Si fourni, lit automatiquement la face affichée à chaque changement. */
  autoTtsLang?: string | null
  /** Taille de la carte. "large" = mode étude immersif. */
  size?: 'normal' | 'large'
  /** Si vrai, désactive l'événement onFlip (utile en mode liste). */
  passive?: boolean
}

const CARD_TYPE_LABELS: Record<CardType, { label: string; color: string }> = {
  basic:      { label: 'Basique',    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  cloze:      { label: 'À trous',    color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  definition: { label: 'Définition', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
        code: ({ children }) => (
          <code className="px-1.5 py-0.5 rounded bg-surface text-[0.85em] mono border border-border">{children}</code>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 italic text-text-secondary">{children}</blockquote>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1.5 mb-3">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1.5 mb-3">{children}</ol>,
        li: ({ children }) => <li className="text-text-secondary">{children}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

/** Strip simple Markdown / LaTeX delimiters before sending to speech synth. */
function speakable(content: string): string {
  return content
    .replace(/\{\{c\d+::([^}]+)\}\}/g, '$1')
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/[*_`#>~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function speak(text: string, lang?: string | null) {
  if (typeof window === 'undefined') return
  if (!('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    if (lang) utter.lang = lang
    utter.rate = 0.95
    window.speechSynthesis.speak(utter)
  } catch { /* ignore */ }
}

export default function FlashcardCard({
  card,
  flipped = false,
  onFlip,
  showHint = false,
  reverse = false,
  showActions = false,
  starred = false,
  suspended = false,
  onToggleStar,
  onToggleSuspended,
  autoTtsLang = null,
  size = 'normal',
  passive = false,
}: Props) {
  const typeInfo = CARD_TYPE_LABELS[card.card_type] || CARD_TYPE_LABELS.basic

  // Sur "reverse", on échange front/back (mais on garde le marquage cloze côté front).
  const sourceFront = reverse ? card.back : card.front
  const sourceBack  = reverse ? card.front : card.back

  const frontContent = card.card_type === 'cloze' && !reverse
    ? sourceFront.replace(/\{\{c\d+::([^}]+)\}\}/g, '_____')
    : sourceFront
  const backContent = card.card_type === 'cloze' && !reverse
    ? sourceBack.replace(/\{\{c\d+::([^}]+)\}\}/g, (_m, p1) => `**${p1}**`)
    : sourceBack

  // Lecture automatique à chaque changement de face si activée.
  const lastSpokenRef = useRef<string>('')
  useEffect(() => {
    if (!autoTtsLang) return
    const text = speakable(flipped ? backContent : frontContent)
    if (text && text !== lastSpokenRef.current) {
      lastSpokenRef.current = text
      // léger délai pour ne pas couper le clic / l'animation
      const t = window.setTimeout(() => speak(text, autoTtsLang), 120)
      return () => window.clearTimeout(t)
    }
  }, [flipped, frontContent, backContent, autoTtsLang])

  const padding = size === 'large' ? 'p-8 md:p-12' : 'p-6 md:p-8'
  const minH    = size === 'large' ? 'min-h-[44vh] md:min-h-[52vh]' : 'min-h-[180px]'
  const titleSz = size === 'large' ? 'text-xl md:text-3xl' : 'text-lg md:text-xl'
  const bodySz  = size === 'large' ? 'text-base md:text-xl' : 'text-base'

  const handleClick = (e: React.MouseEvent) => {
    if (passive) return
    // Évite que les clics sur les boutons d'action retournent la carte.
    const target = e.target as HTMLElement
    if (target.closest('[data-card-action]')) return
    onFlip?.()
  }

  return (
    <div
      className={`relative w-full ${passive ? '' : 'cursor-pointer'} flashcard-3d`}
      onClick={handleClick}
    >
      <div className={`flashcard-inner ${flipped ? 'is-flipped' : ''}`}>
        {/* ============================== FRONT ============================== */}
        <div
          className={`flashcard-face flashcard-front w-full rounded-3xl border border-border bg-elevated ${padding} flex flex-col`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            <div className="flex items-center gap-1.5">
              {card.source_page && (
                <span className="text-xs text-text-tertiary mono">p.{card.source_page}</span>
              )}
              {showActions && (
                <>
                  <button
                    data-card-action
                    onClick={(e) => { e.stopPropagation(); speak(speakable(frontContent), autoTtsLang || undefined) }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
                    title="Lire à voix haute"
                  >
                    <FiVolume2 className="w-4 h-4" />
                  </button>
                  {onToggleStar && (
                    <button
                      data-card-action
                      onClick={(e) => { e.stopPropagation(); onToggleStar() }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        starred ? 'text-amber-400 hover:bg-amber-400/10' : 'text-text-tertiary hover:text-amber-400 hover:bg-surface'
                      }`}
                      title={starred ? 'Retirer des favoris' : 'Mettre en favori'}
                    >
                      <FiStar className={`w-4 h-4 ${starred ? 'fill-current' : ''}`} />
                    </button>
                  )}
                  {onToggleSuspended && (
                    <button
                      data-card-action
                      onClick={(e) => { e.stopPropagation(); onToggleSuspended() }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        suspended ? 'text-cyan-400 hover:bg-cyan-400/10' : 'text-text-tertiary hover:text-cyan-400 hover:bg-surface'
                      }`}
                      title={suspended ? 'Réactiver la carte' : 'Suspendre la carte'}
                    >
                      <FiBookmark className={`w-4 h-4 ${suspended ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={`${minH} flex items-center justify-center text-center`}>
            <div className={`${titleSz} text-text-primary font-medium leading-relaxed max-w-3xl px-2`}>
              <MarkdownContent content={frontContent} />
            </div>
          </div>

          {showHint && card.hint && (
            <div className="mt-4 pt-4 border-t border-border text-center">
              <span className="text-sm text-text-tertiary italic">Indice — {card.hint}</span>
            </div>
          )}

          {!passive && (
            <div className="mt-6 text-center">
              <span className="text-xs text-text-tertiary uppercase tracking-widest">Touchez pour révéler</span>
            </div>
          )}
        </div>

        {/* =============================== BACK =============================== */}
        <div
          className={`flashcard-face flashcard-back w-full rounded-3xl border border-border bg-surface ${padding} flex flex-col`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-tertiary uppercase tracking-widest">Réponse</span>
              {showActions && (
                <button
                  data-card-action
                  onClick={(e) => { e.stopPropagation(); speak(speakable(backContent), autoTtsLang || undefined) }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-elevated transition-colors"
                  title="Lire à voix haute"
                >
                  <FiVolume2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className={`${bodySz} text-text-primary leading-relaxed text-left flex-1`}>
            <MarkdownContent content={backContent} />
          </div>

          {card.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {card.tags.map((tag) => (
                <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-background border border-border text-text-tertiary">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
