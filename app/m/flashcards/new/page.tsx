'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import MobileLayout, { MobileHeader } from '@/components/mobile/MobileLayout'
import {
  FiUpload, FiFile, FiX, FiZap, FiPlus, FiFileText, FiSettings, FiChevronDown, FiChevronUp,
} from 'react-icons/fi'

type SourceTab = 'pdf' | 'text'
type UploadStatus = 'idle' | 'converting' | 'generating' | 'done' | 'error'

const PRESETS: Array<{ label: string; instructions: string }> = [
  { label: 'High-yield', instructions: 'Generate only the most high-yield, exam-relevant cards. Keep them concise.' },
  { label: 'Definitions', instructions: 'Prioritise the "definition" card type for every key term.' },
  { label: 'Cloze-only', instructions: 'Generate ONLY cloze cards using {{c1::ANSWER}} markers.' },
  { label: 'Math', instructions: 'Focus on formulas and theorems. Use LaTeX rigorously.' },
]

export default function MobileNewFlashcardDeckPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sourceTab, setSourceTab] = useState<SourceTab>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [groupByTheme, setGroupByTheme] = useState(false)
  const [deckName, setDeckName] = useState('')
  const [description, setDescription] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [customInstructions, setCustomInstructions] = useState('')

  // Phase 0 analysis
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<null | {
    count: number
    themes: string[]
    language: string
    noise: string
    forText: string
  }>(null)

  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/m/login'); return }
      setToken(session.access_token)
    }
    init()
  }, [router])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      if (!deckName) setDeckName(selected.name.replace(/\.pdf$/i, ''))
    }
  }

  const isProcessing = status === 'converting' || status === 'generating'

  const generateFromPdf = async () => {
    if (!file || !deckName.trim()) { setError('Please provide a deck name and upload a PDF'); return }
    setError(null)
    setStatus('converting')
    setProgress(5)
    setProgressMsg('Converting PDF...')

    try {
      const pageImages = await convertPdfToImagesClient(file, 1.2, 0.6)
      setProgress(20)
      setProgressMsg(`${pageImages.length} pages found...`)

      const deckRes = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null, source_pdf_name: file.name }),
      })
      if (!deckRes.ok) throw new Error((await deckRes.json()).error)
      const { deck } = await deckRes.json()

      setStatus('generating')
      const batchSize = 3
      let processed = 0

      for (let i = 0; i < pageImages.length; i += batchSize) {
        const batch = pageImages.slice(i, i + batchSize)
        setProgressMsg(`Pages ${i + 1}–${Math.min(i + batchSize, pageImages.length)}/${pageImages.length}`)

        await fetch(`/api/flashcards/${deck.id}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            pages: batch.map((p) => ({ pageNumber: p.pageNumber, dataUrl: p.dataUrl })),
            customInstructions: customInstructions.trim() || null,
          }),
        })
        processed += batch.length
        setProgress(20 + Math.round((processed / pageImages.length) * 75))
      }

      setProgress(100)
      setStatus('done')
      setTimeout(() => router.push(`/m/flashcards/${deck.id}`), 600)
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }

  const analyzeText = async () => {
    if (!pastedText.trim() || pastedText.trim().length < 50) {
      setError('Text is too short — at least 50 characters')
      return
    }
    setError(null)
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const res = await fetch('/api/flashcards/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: pastedText }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Analysis failed')
      const data = await res.json()
      setAnalysis({
        count: data.estimated_question_count || 0,
        themes: data.themes || [],
        language: data.language || 'unknown',
        noise: data.noise_summary || '',
        forText: pastedText,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const analysisStale = !!analysis && analysis.forText !== pastedText

  const generateFromText = async () => {
    if (!pastedText.trim() || !deckName.trim()) {
      setError('Please provide a deck name and some text')
      return
    }
    if (pastedText.trim().length < 50) {
      setError('Text is too short — at least 50 characters needed')
      return
    }
    setError(null)
    setStatus('generating')
    setProgress(8)
    setPhaseLabel('Setup')
    setProgressMsg('Creating deck...')

    try {
      const deckRes = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null }),
      })
      if (!deckRes.ok) throw new Error((await deckRes.json()).error)
      const { deck } = await deckRes.json()

      const hasAnalysis = !!analysis && !analysisStale
      setPhaseLabel('Phase 1 / 2 — Cleaning & numbering')
      setProgressMsg(
        hasAnalysis
          ? `Cleaning ~${analysis!.count} questions...`
          : 'Detecting study questions...'
      )
      setProgress(15)

      let progressTicker: ReturnType<typeof setInterval> | null = null
      let p = 15
      let phaseOneFinished = false

      progressTicker = setInterval(() => {
        const ceiling = phaseOneFinished ? 92 : 55
        if (p < ceiling) {
          p += phaseOneFinished ? 1.2 : 0.8
          setProgress(Math.min(Math.round(p), ceiling))
        }
      }, 600)

      const phaseOneApprox = Math.max(8000, Math.min(60000, Math.ceil(pastedText.length / 12)))
      setTimeout(() => {
        phaseOneFinished = true
        setPhaseLabel('Phase 2 / 2 — Writing answers')
        setProgressMsg('Answers in small batches for accuracy...')
      }, phaseOneApprox)

      const genRes = await fetch(`/api/flashcards/${deck.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: pastedText,
          customInstructions: customInstructions.trim() || null,
          groupByTheme,
          expectedCount: hasAnalysis ? analysis!.count : null,
          themesHint: hasAnalysis ? analysis!.themes : null,
        }),
      })

      if (progressTicker) clearInterval(progressTicker)

      if (!genRes.ok) throw new Error((await genRes.json()).error || 'Generation failed')
      const data = await genRes.json()
      setProgress(100)
      setPhaseLabel('Done')

      if (data.mode === 'themed' && Array.isArray(data.decks)) {
        setProgressMsg(`${data.cardsCreated} cards across ${data.decks.length} themed decks`)
        setStatus('done')
        setTimeout(() => router.push('/m/flashcards'), 1000)
      } else {
        setProgressMsg(`${data.cardsCreated} cards created!`)
        setStatus('done')
        setTimeout(() => router.push(`/m/flashcards/${deck.id}`), 800)
      }
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }

  const handleManual = async () => {
    if (!deckName.trim()) { setError('Please enter a name'); return }
    const res = await fetch('/api/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null }),
    })
    if (!res.ok) { setError((await res.json()).error); return }
    const { deck } = await res.json()
    router.push(`/m/flashcards/${deck.id}`)
  }

  const hasInput = (sourceTab === 'pdf' && !!file) || (sourceTab === 'text' && pastedText.trim().length >= 50)

  return (
    <MobileLayout>
      <MobileHeader title="New Deck" backHref="/m/flashcards" />

      <div className="mobile-content p-4 pb-24 space-y-4">
        <div>
          <label className="label mb-1 block">Deck Name *</label>
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="e.g. Bio Chapter 3"
            className="input w-full"
            disabled={isProcessing}
          />
        </div>

        <div>
          <label className="label mb-1 block">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            className="input w-full"
            disabled={isProcessing}
          />
        </div>

        {/* Source tabs */}
        <div>
          <label className="label mb-2 block">Source</label>
          <div className="flex gap-1 p-1 bg-elevated border border-border rounded-xl">
            <button
              onClick={() => setSourceTab('pdf')}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                sourceTab === 'pdf' ? 'bg-text-primary text-background' : 'text-text-secondary'
              } disabled:opacity-50`}
            >
              <FiFile className="w-3.5 h-3.5" /> PDF
            </button>
            <button
              onClick={() => setSourceTab('text')}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                sourceTab === 'text' ? 'bg-text-primary text-background' : 'text-text-secondary'
              } disabled:opacity-50`}
            >
              <FiFileText className="w-3.5 h-3.5" /> Text
            </button>
          </div>
        </div>

        {/* PDF source */}
        {sourceTab === 'pdf' && (
          <>
            {!file ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-text-tertiary disabled:opacity-50"
              >
                <FiUpload className="w-6 h-6" />
                <span className="text-sm">Tap to upload PDF</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-elevated border border-border rounded-xl">
                <FiFile className="w-5 h-5 text-text-tertiary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-text-tertiary">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                {!isProcessing && (
                  <button onClick={() => setFile(null)}><FiX className="w-4 h-4 text-text-tertiary" /></button>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileSelect} />
          </>
        )}

        {/* Text source */}
        {sourceTab === 'text' && (
          <div className="space-y-3">
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`Paste questions, notes or any study material.

The AI will:
1. Detect real study questions
2. Write detailed answers in batches`}
              rows={10}
              disabled={isProcessing}
              className="input w-full resize-y text-sm"
            />
            <div className="flex justify-between text-xs text-text-tertiary mono">
              <span>{pastedText.length.toLocaleString()} chars</span>
              <span>{pastedText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
            </div>

            <label className="flex items-start gap-3 p-3 bg-elevated border border-border rounded-xl">
              <input
                type="checkbox"
                checked={groupByTheme}
                onChange={(e) => setGroupByTheme(e.target.checked)}
                disabled={isProcessing}
                className="mt-0.5 w-4 h-4 accent-text-primary"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">Group by theme</div>
                <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                  Create several smaller numbered sub-decks instead of one large one.
                </p>
              </div>
            </label>

            {/* Phase 0 analyze */}
            <div className="p-3 border border-border rounded-xl bg-surface/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Step 1 — Detect questions</div>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                    Count real questions before generating cards.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={analyzeText}
                  disabled={analyzing || isProcessing || pastedText.trim().length < 50}
                  className="btn-secondary text-xs whitespace-nowrap disabled:opacity-50"
                >
                  {analyzing ? 'Analyzing...' : analysis && !analysisStale ? 'Re-analyze' : 'Analyze'}
                </button>
              </div>

              {analysis && (
                <div className="mt-3 space-y-2">
                  <div className={`p-2.5 rounded-lg border ${analysisStale ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-xl font-semibold mono ${analysisStale ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {analysis.count}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {analysis.count === 1 ? 'question detected' : 'questions detected'}
                      </span>
                    </div>
                    {analysisStale && (
                      <p className="text-[10px] uppercase tracking-wider mono text-amber-400 mt-1">
                        Text changed — re-analyze
                      </p>
                    )}
                  </div>
                  {analysis.themes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {analysis.themes.slice(0, 8).map((t, i) => (
                        <span
                          key={`${t}-${i}`}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-elevated text-text-secondary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom instructions */}
        <div>
          <button
            type="button"
            onClick={() => setShowInstructions((v) => !v)}
            className="w-full flex items-center justify-between p-3 bg-elevated border border-border rounded-xl"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <FiSettings className="w-4 h-4" />
              AI Instructions
              {customInstructions.trim() && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 mono">on</span>
              )}
            </span>
            {showInstructions ? <FiChevronUp className="w-4 h-4 text-text-tertiary" /> : <FiChevronDown className="w-4 h-4 text-text-tertiary" />}
          </button>

          {showInstructions && (
            <div className="mt-2 p-3 border border-border rounded-xl bg-elevated space-y-2">
              <p className="text-xs text-text-tertiary">Tell the AI exactly how you want your cards.</p>

              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCustomInstructions(p.instructions)}
                    className="text-xs px-2 py-1 rounded-full border border-border bg-surface text-text-secondary"
                  >
                    {p.label}
                  </button>
                ))}
                {customInstructions && (
                  <button
                    type="button"
                    onClick={() => setCustomInstructions('')}
                    className="text-xs px-2 py-1 rounded-full border border-error/30 bg-error/5 text-error"
                  >
                    Clear
                  </button>
                )}
              </div>

              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Only cloze cards. Write in French."
                rows={4}
                disabled={isProcessing}
                className="input w-full resize-y text-sm"
              />
            </div>
          )}
        </div>

        {/* Progress */}
        {isProcessing && (
          <div className="p-3 bg-elevated border border-border rounded-xl">
            {phaseLabel && (
              <div className="text-[10px] uppercase tracking-wider mono text-text-tertiary mb-1">
                {phaseLabel}
              </div>
            )}
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-primary">{progressMsg}</span>
              <span className="mono text-text-tertiary">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-text-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {status === 'done' && (
          <p className="text-sm text-emerald-400 text-center">Done! Redirecting...</p>
        )}

        {error && <p className="text-sm text-error">{error}</p>}

        {hasInput ? (
          <button
            onClick={sourceTab === 'pdf' ? generateFromPdf : generateFromText}
            disabled={isProcessing || !deckName.trim()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {isProcessing ? (
              <><div className="spinner w-4 h-4" /> Generating...</>
            ) : sourceTab === 'text' && analysis && !analysisStale ? (
              <><FiZap className="w-4 h-4" /> Step 2 — Generate {analysis.count} flashcards</>
            ) : (
              <><FiZap className="w-4 h-4" /> Generate with AI</>
            )}
          </button>
        ) : (
          <button onClick={handleManual} disabled={!deckName.trim()} className="btn-secondary w-full disabled:opacity-50">
            <FiPlus className="w-4 h-4" /> Create Empty Deck
          </button>
        )}
      </div>
    </MobileLayout>
  )
}
