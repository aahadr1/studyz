'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import MobileLayout, { MobileHeader } from '@/components/mobile/MobileLayout'
import { FiUpload, FiFile, FiX, FiZap, FiPlus } from 'react-icons/fi'

type UploadStatus = 'idle' | 'converting' | 'generating' | 'done' | 'error'

export default function MobileNewFlashcardDeckPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [deckName, setDeckName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
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

  const handleGenerate = async () => {
    if (!file || !deckName.trim()) { setError('Please provide a deck name and upload a PDF'); return }
    setError(null)
    setStatus('converting')
    setProgress(5)
    setProgressMsg('Converting PDF...')

    try {
      const pageImages = await convertPdfToImagesClient(file, 1.2, 0.6)
      setProgress(20)
      setProgressMsg(`${pageImages.length} pages found. Creating deck...`)

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
        setProgressMsg(`Pages ${i + 1}–${Math.min(i + batchSize, pageImages.length)} of ${pageImages.length}...`)

        await fetch(`/api/flashcards/${deck.id}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pages: batch.map((p) => ({ pageNumber: p.pageNumber, dataUrl: p.dataUrl })) }),
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

  const isProcessing = status === 'converting' || status === 'generating'

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

        {/* File */}
        {!file ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-text-tertiary"
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

        {/* Progress */}
        {isProcessing && (
          <div>
            <div className="flex justify-between text-xs text-text-tertiary mb-1">
              <span>{progressMsg}</span>
              <span className="mono">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
              <div className="h-full bg-text-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {status === 'done' && (
          <p className="text-sm text-emerald-400 text-center">Done! Redirecting...</p>
        )}

        {error && <p className="text-sm text-error">{error}</p>}

        {file ? (
          <button
            onClick={handleGenerate}
            disabled={isProcessing || !deckName.trim()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {isProcessing ? <><div className="spinner w-4 h-4" /> Generating...</> : <><FiZap className="w-4 h-4" /> Generate with AI</>}
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
