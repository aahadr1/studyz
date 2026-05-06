'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import { FiEye, FiEdit2 } from 'react-icons/fi'
import type { CardType, FlashcardCard } from '@/types/flashcard'

interface Props {
  deckId: string
  accessToken: string
  card?: FlashcardCard | null
  onSave: (card: FlashcardCard) => void
  onCancel: () => void
}

const CARD_TYPES: Array<{ value: CardType; label: string; description: string }> = [
  { value: 'basic', label: 'Basic', description: 'Question → Answer' },
  { value: 'cloze', label: 'Cloze', description: 'Fill in the blank (use {{c1::answer}})' },
  { value: 'definition', label: 'Definition', description: 'Term → Definition' },
]

function Preview({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-1 last:mb-0 text-sm leading-relaxed text-text-primary">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children }) => (
          <code className="px-1 py-0.5 rounded bg-background text-xs mono border border-border">{children}</code>
        ),
      }}
    >
      {content || '*Empty*'}
    </ReactMarkdown>
  )
}

export default function FlashcardEditor({ deckId, accessToken, card, onSave, onCancel }: Props) {
  const [cardType, setCardType] = useState<CardType>(card?.card_type || 'basic')
  const [front, setFront] = useState(card?.front || '')
  const [back, setBack] = useState(card?.back || '')
  const [hint, setHint] = useState(card?.hint || '')
  const [tags, setTags] = useState(card?.tags?.join(', ') || '')
  const [previewFront, setPreviewFront] = useState(false)
  const [previewBack, setPreviewBack] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!card

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      setError('Front and back are required')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean)

      let res: Response
      if (isEditing) {
        res = await fetch(`/api/flashcards/${deckId}/cards/${card.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ card_type: cardType, front, back, hint: hint || null, tags: parsedTags }),
        })
      } else {
        res = await fetch(`/api/flashcards/${deckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ card_type: cardType, front, back, hint: hint || null, tags: parsedTags }),
        })
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }

      const data = await res.json()
      onSave(data.card)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-elevated border border-border rounded-2xl p-6 space-y-5">
      <h3 className="text-sm font-medium text-text-primary">
        {isEditing ? 'Edit Card' : 'New Card'}
      </h3>

      {/* Card type selector */}
      <div>
        <label className="label mb-2 block">Card Type</label>
        <div className="flex gap-2">
          {CARD_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setCardType(t.value)}
              className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                cardType === t.value
                  ? 'border-text-primary bg-text-primary text-background'
                  : 'border-border text-text-secondary hover:border-border-light'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          {CARD_TYPES.find((t) => t.value === cardType)?.description}
        </p>
      </div>

      {/* Front */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Front</label>
          <button
            onClick={() => setPreviewFront((v) => !v)}
            className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1"
          >
            {previewFront ? <FiEdit2 className="w-3 h-3" /> : <FiEye className="w-3 h-3" />}
            {previewFront ? 'Edit' : 'Preview'}
          </button>
        </div>
        {previewFront ? (
          <div className="min-h-[80px] p-3 rounded-lg border border-border bg-surface">
            <Preview content={front} />
          </div>
        ) : (
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={3}
            placeholder={
              cardType === 'cloze'
                ? 'The {{c1::mitochondria}} is the powerhouse of the cell.'
                : cardType === 'definition'
                ? 'Entropy'
                : 'What is...'
            }
            className="input w-full resize-none text-sm"
          />
        )}
      </div>

      {/* Back */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Back</label>
          <button
            onClick={() => setPreviewBack((v) => !v)}
            className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1"
          >
            {previewBack ? <FiEdit2 className="w-3 h-3" /> : <FiEye className="w-3 h-3" />}
            {previewBack ? 'Edit' : 'Preview'}
          </button>
        </div>
        {previewBack ? (
          <div className="min-h-[80px] p-3 rounded-lg border border-border bg-surface">
            <Preview content={back} />
          </div>
        ) : (
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={4}
            placeholder="Supports **Markdown** and $LaTeX$"
            className="input w-full resize-none text-sm"
          />
        )}
      </div>

      {/* Hint */}
      <div>
        <label className="label mb-1 block">Hint (optional)</label>
        <input
          type="text"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="A subtle clue..."
          className="input w-full text-sm"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="label mb-1 block">Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="biology, cell, organelles"
          className="input w-full text-sm"
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-ghost flex-1" disabled={saving}>
          Cancel
        </button>
        <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Card'}
        </button>
      </div>
    </div>
  )
}
