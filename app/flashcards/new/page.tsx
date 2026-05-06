'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import {
  FiUpload, FiFile, FiX, FiHome, FiZap, FiCheckSquare, FiMic, FiLogOut,
  FiLayers, FiPlus, FiFileText, FiSettings, FiChevronDown, FiChevronUp,
} from 'react-icons/fi'
import Logo from '@/components/Logo'

type SourceTab = 'pdf' | 'text'
type UploadStatus = 'idle' | 'converting' | 'generating' | 'done' | 'error'

const PRESETS: Array<{ label: string; instructions: string }> = [
  { label: 'Concise & high-yield', instructions: 'Generate only the most high-yield, exam-relevant cards. Keep cards extremely concise. Skip trivia and decorative content.' },
  { label: 'Heavy on definitions', instructions: 'Prioritise the "definition" card type for every key term. Each definition must include the precise term on the front and a complete formal definition with one example on the back.' },
  { label: 'Cloze-only', instructions: 'Generate ONLY cloze cards. Use {{c1::ANSWER}} markers around the most important word or phrase in each sentence. Do not produce basic or definition cards.' },
  { label: 'Medical exam style', instructions: 'Format cards in the style of medical board exams: emphasise mechanisms, drug names, side effects, and clinical pearls. Add USMLE/ECN-style hooks where useful.' },
  { label: 'Math & formulas', instructions: 'Focus on formulas, theorems, and proofs. Use LaTeX rigorously ($...$ inline, $$...$$ display). Each formula card must include conditions of validity and a worked example on the back.' },
]

export default function NewFlashcardDeckPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sourceTab, setSourceTab] = useState<SourceTab>('pdf')

  // Common
  const [deckName, setDeckName] = useState('')
  const [description, setDescription] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [customInstructions, setCustomInstructions] = useState('')

  // PDF tab state
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Text tab state
  const [pastedText, setPastedText] = useState('')
  const [groupByTheme, setGroupByTheme] = useState(false)

  // Phase 0 — analyze (count + themes)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<null | {
    count: number
    themes: string[]
    language: string
    noise: string
    forText: string
    debug?: any
  }>(null)
  const [showDebug, setShowDebug] = useState(false)

  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      setUser({ fullName: authUser.user_metadata?.full_name || 'Student', email: authUser.email })
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setToken(session.access_token)
    }
    init()
  }, [router])

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf' || dropped?.name.endsWith('.pdf')) {
      setFile(dropped)
      if (!deckName) setDeckName(dropped.name.replace(/\.pdf$/i, ''))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      if (!deckName) setDeckName(selected.name.replace(/\.pdf$/i, ''))
    }
  }

  const isProcessing = status === 'converting' || status === 'generating'

  const generateFromPdf = async () => {
    if (!file || !deckName.trim()) {
      setError('Please provide a deck name and upload a PDF')
      return
    }
    setError(null)
    setStatus('converting')
    setProgress(5)
    setProgressMsg('Converting PDF to images...')

    try {
      const pageImages = await convertPdfToImagesClient(file, 1.5, 0.7)
      setProgress(20)
      setProgressMsg(`${pageImages.length} pages detected. Creating deck...`)

      const deckRes = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null, source_pdf_name: file.name }),
      })
      if (!deckRes.ok) throw new Error((await deckRes.json()).error || 'Failed to create deck')
      const { deck } = await deckRes.json()

      setStatus('generating')
      const batchSize = 5
      let processedPages = 0
      const totalPages = pageImages.length

      for (let i = 0; i < pageImages.length; i += batchSize) {
        const batch = pageImages.slice(i, i + batchSize)
        setProgressMsg(`Generating cards: pages ${i + 1}–${Math.min(i + batchSize, totalPages)} of ${totalPages}...`)

        await fetch(`/api/flashcards/${deck.id}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            pages: batch.map((p) => ({ pageNumber: p.pageNumber, dataUrl: p.dataUrl })),
            customInstructions: customInstructions.trim() || null,
          }),
        })

        processedPages += batch.length
        setProgress(20 + Math.round((processedPages / totalPages) * 75))
      }

      setProgress(100)
      setProgressMsg('All cards generated!')
      setStatus('done')
      setTimeout(() => router.push(`/flashcards/${deck.id}`), 800)
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }

  const analyzeText = async () => {
    if (!pastedText.trim()) { setError('Paste some text first'); return }
    if (pastedText.trim().length < 50) {
      setError('Text is too short — at least 50 characters needed')
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
        debug: data._debug,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // If the user edits the text again, the analysis is stale
  const analysisStale = !!analysis && analysis.forText !== pastedText

  const generateFromText = async () => {
    if (!pastedText.trim() || !deckName.trim()) {
      setError('Please provide a deck name and some text')
      return
    }
    if (pastedText.trim().length < 50) {
      setError('Text is too short — please provide at least 50 characters')
      return
    }
    setError(null)
    setStatus('generating')
    setProgress(8)
    setPhaseLabel(analysis ? 'Phase 1 / 3 — Setup' : 'Setup')
    setProgressMsg('Creating deck...')

    try {
      const deckRes = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null }),
      })
      if (!deckRes.ok) throw new Error((await deckRes.json()).error || 'Failed to create deck')
      const { deck } = await deckRes.json()

      // Phases. If we already have an analysis, we skip the count detection step server-side.
      const hasAnalysis = !!analysis && !analysisStale
      const phasePrefix = hasAnalysis ? '/ 2' : '/ 2'

      setPhaseLabel(`Phase 1 ${phasePrefix} — Cleaning & numbering questions`)
      setProgressMsg(
        hasAnalysis
          ? `Cleaning & numbering ~${analysis!.count} detected questions...`
          : 'Identifying real study questions in your text...'
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
        setPhaseLabel(`Phase 2 ${phasePrefix} — Generating detailed answers`)
        setProgressMsg('Writing complete answers in small batches for accuracy...')
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

      if (!genRes.ok) {
        const err = await genRes.json()
        throw new Error(err.error || 'Generation failed')
      }

      const data = await genRes.json()
      setProgress(100)

      if (data.mode === 'themed' && Array.isArray(data.decks)) {
        setPhaseLabel('Done')
        setProgressMsg(`${data.cardsCreated} cards across ${data.decks.length} themed decks`)
        setStatus('done')
        setTimeout(() => router.push('/flashcards'), 1200)
      } else {
        setPhaseLabel('Done')
        setProgressMsg(`${data.cardsCreated} cards generated from ${data.questionsExtracted ?? '?'} questions`)
        setStatus('done')
        setTimeout(() => router.push(`/flashcards/${deck.id}`), 1000)
      }
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }

  const handleManualCreate = async () => {
    if (!deckName.trim()) { setError('Please enter a deck name'); return }
    setError(null)

    const res = await fetch('/api/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null }),
    })
    if (!res.ok) { setError((await res.json()).error); return }
    const { deck } = await res.json()
    router.push(`/flashcards/${deck.id}`)
  }

  const handleLogout = async () => { await createClient().auth.signOut(); router.push('/login') }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
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

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <header className="h-14 border-b border-border flex items-center px-8">
          <Link href="/flashcards" className="text-sm text-text-tertiary hover:text-text-primary mr-3">←</Link>
          <h1 className="text-sm font-medium text-text-primary uppercase tracking-wider">New Flashcard Deck</h1>
        </header>

        <div className="p-8 max-w-2xl">
          {/* Deck info */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="label mb-1 block">Deck Name *</label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="e.g. Organic Chemistry Ch.5"
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
          </div>

          {/* Source tabs */}
          <div className="mb-3">
            <label className="label mb-2 block">Source</label>
            <div className="flex gap-1 p-1 bg-elevated border border-border rounded-xl w-fit">
              <button
                onClick={() => setSourceTab('pdf')}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  sourceTab === 'pdf' ? 'bg-text-primary text-background' : 'text-text-secondary hover:text-text-primary'
                } disabled:opacity-50`}
              >
                <FiFile className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                onClick={() => setSourceTab('text')}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  sourceTab === 'text' ? 'bg-text-primary text-background' : 'text-text-secondary hover:text-text-primary'
                } disabled:opacity-50`}
              >
                <FiFileText className="w-3.5 h-3.5" />
                Text
              </button>
            </div>
          </div>

          {/* PDF upload zone */}
          {sourceTab === 'pdf' && (
            <div className="mb-6">
              {!file ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragging ? 'border-text-primary bg-surface' : 'border-border hover:border-border-light hover:bg-elevated'
                  }`}
                >
                  <FiUpload className="w-8 h-8 mx-auto mb-4 text-text-tertiary" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-text-primary mb-1">Drop your PDF here</p>
                  <p className="text-xs text-text-tertiary">or click to browse</p>
                  <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileSelect} />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-elevated border border-border rounded-xl">
                  <FiFile className="w-5 h-5 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                    <p className="text-xs text-text-tertiary mono">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  {!isProcessing && (
                    <button onClick={() => setFile(null)} className="text-text-tertiary hover:text-error transition-colors">
                      <FiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Text input zone */}
          {sourceTab === 'text' && (
            <div className="mb-6">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Paste your study material — questions, notes, lessons, articles. The AI will:

  1. Identify real study questions (up to 500), even if mixed with unrelated text
  2. Generate complete, detailed answers (from your text or general knowledge)

Long lists of questions are perfectly supported — answers are produced in small batches for accuracy.`}
                rows={14}
                disabled={isProcessing}
                className="input w-full resize-y text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-text-tertiary mt-1.5 mono">
                <span>{pastedText.length.toLocaleString()} chars</span>
                <span>{pastedText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
              </div>

              {/* Group by theme toggle */}
              <label className="mt-4 flex items-start gap-3 p-4 bg-elevated border border-border rounded-xl cursor-pointer hover:bg-hover transition-all">
                <input
                  type="checkbox"
                  checked={groupByTheme}
                  onChange={(e) => setGroupByTheme(e.target.checked)}
                  disabled={isProcessing}
                  className="mt-0.5 w-4 h-4 accent-text-primary"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">Group by theme</div>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                    Instead of one big deck, the AI groups the cards by topic and creates several
                    smaller numbered sub-decks (e.g. <span className="mono">{deckName || 'My Deck'} — 01 — Theme A</span>).
                  </p>
                </div>
              </label>

              {/* Phase 0 — Analyze */}
              <div className="mt-4 p-4 border border-border rounded-xl bg-surface/40">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-medium text-text-primary">Step 1 — Detect questions</div>
                    <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                      Quickly count how many real study questions your text contains, before generating any cards.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={analyzeText}
                    disabled={analyzing || isProcessing || pastedText.trim().length < 50}
                    className="btn-secondary text-sm whitespace-nowrap disabled:opacity-50"
                  >
                    {analyzing ? (
                      <><div className="spinner w-3.5 h-3.5" /> Analyzing...</>
                    ) : analysis && !analysisStale ? (
                      <>Re-analyze</>
                    ) : (
                      <>Analyze text</>
                    )}
                  </button>
                </div>

                {analysis && (
                  <div className="mt-4 space-y-3">
                    <div className={`p-3 rounded-lg border ${analysisStale ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-semibold mono ${analysisStale ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {analysis.count}
                        </span>
                        <span className="text-sm text-text-secondary">
                          {analysis.count === 1 ? 'question detected' : 'questions detected'}
                        </span>
                        {analysisStale && (
                          <span className="ml-auto text-[10px] uppercase tracking-wider mono text-amber-400">stale — re-analyze</span>
                        )}
                      </div>
                      {analysis.language && analysis.language !== 'unknown' && (
                        <p className="text-xs text-text-tertiary mt-1">
                          Source language: <span className="mono">{analysis.language}</span>
                        </p>
                      )}
                      {analysis.noise && (
                        <p className="text-xs text-text-tertiary mt-1 italic">{analysis.noise}</p>
                      )}
                    </div>

                    {analysis.themes.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wider mono text-text-tertiary mb-1.5">Themes</p>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.themes.map((t, i) => (
                            <span
                              key={`${t}-${i}`}
                              className="text-xs px-2 py-0.5 rounded-full border border-border bg-elevated text-text-secondary"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-text-tertiary leading-relaxed">
                      The next step will use this count as a target so the AI doesn't silently drop questions, and it will produce a clean numbered version of each (Q1, Q2, …, Q{analysis.count}).
                    </p>

                    {/* Debug breakdown — surfaces every strategy's signal so the user can see why we chose this count */}
                    {analysis.debug && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setShowDebug((v) => !v)}
                          className="text-[11px] text-text-tertiary hover:text-text-primary mono underline-offset-2 hover:underline"
                        >
                          {showDebug ? 'Hide' : 'Show'} detection details
                        </button>
                        {showDebug && (
                          <div className="mt-2 p-3 bg-elevated border border-border rounded-lg text-[11px] font-mono space-y-1.5 leading-snug">
                            <div className="text-text-secondary">source: <span className="text-text-primary">{analysis.debug.count_source}</span></div>
                            <div className="text-text-secondary">LLM enumeration: <span className="text-text-primary">{analysis.debug.unique_listed} unique / {analysis.debug.raw_listed} raw across {analysis.debug.chunks} chunk(s)</span></div>
                            {analysis.debug.deterministic?.strategies && (
                              <div>
                                <div className="text-text-secondary mt-1.5">deterministic strategies:</div>
                                {analysis.debug.deterministic.strategies.map((s: any) => (
                                  <div key={s.name} className={`pl-3 ${s.count > 0 ? 'text-text-primary' : 'text-text-tertiary'}`}>
                                    {s.name}: count={s.count}, conf={s.confidence.toFixed(2)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom instructions */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="w-full flex items-center justify-between p-4 bg-elevated border border-border rounded-xl hover:bg-hover transition-all"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <FiSettings className="w-4 h-4" strokeWidth={1.5} />
                Custom AI Instructions
                {customInstructions.trim() && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mono">
                    active
                  </span>
                )}
              </span>
              {showInstructions ? <FiChevronUp className="w-4 h-4 text-text-tertiary" /> : <FiChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>

            {showInstructions && (
              <div className="mt-3 p-4 border border-border rounded-xl bg-elevated space-y-3">
                <p className="text-xs text-text-tertiary leading-relaxed">
                  Tell the AI exactly how you want your flashcards. Examples: focus on formulas, use only cloze cards, write in French, emphasise exam-style mnemonics, etc.
                </p>

                {/* Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setCustomInstructions(p.instructions)}
                      className="text-xs px-2.5 py-1 rounded-full border border-border bg-surface text-text-secondary hover:border-border-light hover:text-text-primary transition-all"
                    >
                      {p.label}
                    </button>
                  ))}
                  {customInstructions && (
                    <button
                      type="button"
                      onClick={() => setCustomInstructions('')}
                      className="text-xs px-2.5 py-1 rounded-full border border-error/30 bg-error/5 text-error hover:bg-error/10 transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Generate only cloze cards. Focus on key dates and names. Write in French. Add a memory hook in the hint field for every card."
                  rows={5}
                  disabled={isProcessing}
                  className="input w-full resize-y text-sm"
                />
              </div>
            )}
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="mb-6 p-4 bg-elevated border border-border rounded-xl">
              {phaseLabel && (
                <div className="text-xs text-text-tertiary uppercase tracking-wider mono mb-2">
                  {phaseLabel}
                </div>
              )}
              <div className="flex items-center justify-between text-sm text-text-primary mb-2">
                <span>{progressMsg}</span>
                <span className="mono text-text-tertiary">{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-text-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {sourceTab === 'text' && (
                <p className="text-xs text-text-tertiary mt-3 leading-relaxed">
                  Long texts are split into chunks for question extraction, and answers are
                  generated in batches of 12 questions for maximum accuracy.
                </p>
              )}
            </div>
          )}

          {status === 'done' && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
              <p className="text-sm font-medium text-emerald-400">Cards generated! Redirecting...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-3 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {sourceTab === 'pdf' && file && (
              <button
                onClick={generateFromPdf}
                disabled={isProcessing || !deckName.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <><div className="spinner w-4 h-4" /> Generating...</>
                ) : (
                  <><FiZap className="w-4 h-4" strokeWidth={2} /> Generate from PDF</>
                )}
              </button>
            )}

            {sourceTab === 'text' && pastedText.trim() && (
              <button
                onClick={generateFromText}
                disabled={isProcessing || !deckName.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <><div className="spinner w-4 h-4" /> Generating...</>
                ) : analysis && !analysisStale ? (
                  <><FiZap className="w-4 h-4" strokeWidth={2} /> Step 2 — Generate {analysis.count} flashcards</>
                ) : (
                  <><FiZap className="w-4 h-4" strokeWidth={2} /> Generate from Text</>
                )}
              </button>
            )}

            {((sourceTab === 'pdf' && !file) || (sourceTab === 'text' && !pastedText.trim())) && (
              <button
                onClick={handleManualCreate}
                disabled={!deckName.trim()}
                className="btn-secondary flex-1 disabled:opacity-50"
              >
                <FiPlus className="w-4 h-4" strokeWidth={2} /> Create Empty Deck
              </button>
            )}

            <Link href="/flashcards" className="btn-ghost">
              Cancel
            </Link>
          </div>

          <p className="text-xs text-text-tertiary text-center mt-4">
            Powered by GPT-4o. Supports Markdown and LaTeX math. Cards include basic, cloze, and definition types.
          </p>
        </div>
      </main>
    </div>
  )
}
