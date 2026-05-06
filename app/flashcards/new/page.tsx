'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import { FiUpload, FiFile, FiX, FiArrowRight, FiHome, FiZap, FiCheckSquare, FiMic, FiLogOut, FiLayers, FiPlus } from 'react-icons/fi'
import Logo from '@/components/Logo'

type UploadStatus = 'idle' | 'converting' | 'generating' | 'done' | 'error'

export default function NewFlashcardDeckPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [deckName, setDeckName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
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

  const handleGenerate = async () => {
    if (!file || !deckName.trim()) {
      setError('Please provide a deck name and upload a PDF')
      return
    }
    setError(null)
    setStatus('converting')
    setProgress(5)
    setProgressMsg('Converting PDF to images...')

    try {
      // 1. Convert PDF to page images client-side
      const pageImages = await convertPdfToImagesClient(file, 1.5, 0.7)
      setProgress(20)
      setProgressMsg(`${pageImages.length} pages detected. Creating deck...`)

      // 2. Create the deck
      const deckRes = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: deckName.trim(), description: description.trim() || null, source_pdf_name: file.name }),
      })
      if (!deckRes.ok) throw new Error((await deckRes.json()).error || 'Failed to create deck')
      const { deck } = await deckRes.json()

      // 3. Send pages to AI in batches of 5
      setStatus('generating')
      const batchSize = 5
      let processedPages = 0
      const totalPages = pageImages.length

      for (let i = 0; i < pageImages.length; i += batchSize) {
        const batch = pageImages.slice(i, i + batchSize)
        setProgressMsg(`Generating cards: pages ${i + 1}–${Math.min(i + batchSize, totalPages)} of ${totalPages}...`)

        const pages = batch.map((p) => ({ pageNumber: p.pageNumber, dataUrl: p.dataUrl }))
        const genRes = await fetch(`/api/flashcards/${deck.id}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pages }),
        })

        if (!genRes.ok) {
          const err = await genRes.json()
          console.warn(`Batch ${i}–${i + batchSize} failed:`, err.error)
        } else {
          const genData = await genRes.json()
          processedPages += batch.length
          setProgress(20 + Math.round((processedPages / totalPages) * 75))
        }
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

  const isProcessing = status === 'converting' || status === 'generating'

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
          <div className="space-y-4 mb-8">
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

          {/* Upload zone */}
          <div className="mb-8">
            <label className="label mb-3 block">Upload PDF for AI Generation</label>

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

          {/* Progress */}
          {isProcessing && (
            <div className="mb-8">
              <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
                <span>{progressMsg}</span>
                <span className="mono">{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-text-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === 'done' && (
            <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
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
            {file ? (
              <button
                onClick={handleGenerate}
                disabled={isProcessing || !deckName.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <><div className="spinner w-4 h-4" /> Generating...</>
                ) : (
                  <><FiZap className="w-4 h-4" strokeWidth={2} /> Generate with AI</>
                )}
              </button>
            ) : (
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

          {file && (
            <p className="text-xs text-text-tertiary text-center mt-4">
              AI will analyze each page and generate 3–8 flashcards per page using GPT-4o Vision.
              Supports Markdown and LaTeX math.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
