'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLoader, FiArrowLeft, FiPlay, FiDownload, FiRefreshCw, FiX } from 'react-icons/fi'
import Link from 'next/link'
import MCQEditor, { MCQQuestionData } from '@/components/MCQEditor'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

export default function MCQEditPage({ params }: { params: { id: string } }) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestionData[]>([])
  const [accessToken, setAccessToken] = useState<string>('')
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [startingSelection, setStartingSelection] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<'with_answers' | 'no_answers' | null>(null)
  const [recorrectOpen, setRecorrectOpen] = useState(false)
  const [recorrectFile, setRecorrectFile] = useState<File | null>(null)
  const [recorrecting, setRecorrecting] = useState(false)
  const [recorrectError, setRecorrectError] = useState<string | null>(null)

  useEffect(() => {
    const loadMCQSet = async () => {
      const supabase = createClient()
      
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
          window.location.href = '/login'
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError('Not authenticated')
          setIsLoading(false)
          return
        }

        setAccessToken(session.access_token)

        const response = await fetch(`/api/mcq/${params.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load MCQ set')
        }

        const data = await response.json()
        setMcqSet(data.set)
        setQuestions(data.questions || [])
      } catch (err: any) {
        console.error('Load error:', err)
        setError(err.message || 'Failed to load MCQ set')
      } finally {
        setIsLoading(false)
      }
    }

    loadMCQSet()
  }, [params.id])

  const reloadQuestions = async () => {
    if (!accessToken) return
    const response = await fetch(`/api/mcq/${params.id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })
    if (!response.ok) throw new Error('Failed to reload MCQ set')
    const data = await response.json()
    setMcqSet(data.set)
    setQuestions(data.questions || [])
  }

  const handleQuestionsUpdate = (updatedQuestions: MCQQuestionData[]) => {
    setQuestions(updatedQuestions)
    // Update set's total questions
    if (mcqSet) {
      setMcqSet({ ...mcqSet, total_questions: updatedQuestions.length })
    }
  }

  const handleStudySelected = async () => {
    if (!accessToken || selectedQuestionIds.length === 0) return
    setStartingSelection(true)
    try {
      const orderedIds = questions
        .map(q => q.id)
        .filter(id => selectedQuestionIds.includes(id))

      const res = await fetch(`/api/mcq/${params.id}/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'study',
          questionIds: orderedIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      const sessionId = data.session?.id
      if (!sessionId) throw new Error('Missing session id')
      window.location.href = `/mcq/${params.id}?session=${sessionId}`
    } catch (e) {
      console.error('Failed to start selection session:', e)
    } finally {
      setStartingSelection(false)
    }
  }

  const downloadExport = async (mode: 'with_answers' | 'no_answers') => {
    if (!accessToken) return
    setExporting(mode)
    try {
      const res = await fetch(`/api/mcq/${params.id}/export?mode=${mode}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const details = data?.details
        const msg =
          (data?.error || 'Failed to export PDF') +
          (details ? `\n\nDetails: ${typeof details === 'string' ? details : JSON.stringify(details)}` : '')
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${mcqSet?.name || 'mcq'}-${mode === 'with_answers' ? 'with-answers' : 'no-answers'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
      alert((e as any)?.message || 'Export failed')
    } finally {
      setExporting(null)
      setExportOpen(false)
    }
  }

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

  const handleRecorrect = async () => {
    if (!accessToken || !recorrectFile || recorrecting) return
    setRecorrectError(null)
    setRecorrecting(true)
    try {
      const file = recorrectFile
      let pages: Array<{ pageNumber: number; dataUrl: string }> = []

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const imgs = await convertPdfToImagesClient(file, 1.4, 0.75)
        const capped = imgs.slice(0, 20)
        pages = capped.map(p => ({ pageNumber: p.pageNumber, dataUrl: p.dataUrl }))
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await readFileAsDataUrl(file)
        pages = [{ pageNumber: 1, dataUrl }]
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or an image.')
      }

      const res = await fetch(`/api/mcq/${params.id}/recorrect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pages }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const details = data?.details
        throw new Error((data?.error || 'Failed to recorrect') + (details ? `: ${details}` : ''))
      }

      await reloadQuestions()
      setRecorrectOpen(false)
      setRecorrectFile(null)
    } catch (e: any) {
      console.error('Recorrect failed:', e)
      setRecorrectError(e?.message || 'Recorrect failed')
    } finally {
      setRecorrecting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-secondary">
          <FiLoader className="w-6 h-6 animate-spin" />
          <span>Loading MCQ set...</span>
        </div>
      </div>
    )
  }

  if (error || !mcqSet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <p className="text-text-primary font-medium mb-2">Error</p>
          <p className="text-text-secondary mb-4">{error || 'MCQ set not found'}</p>
          <Link href="/mcq" className="btn-primary inline-flex">
            Back to MCQ Sets
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 bg-sidebar">
        <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/mcq" className="p-2 hover:bg-elevated rounded-lg transition-colors text-text-tertiary hover:text-text-primary">
              <FiArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{mcqSet.name}</h1>
              <p className="text-sm text-text-secondary">
                Editing {questions.length} question{questions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setRecorrectError(null)
                setRecorrectOpen(true)
              }}
              disabled={!accessToken || recorrecting || exporting !== null}
              title="Re-apply correct answers from an answer key document"
            >
              {recorrecting ? <span className="spinner w-4 h-4" /> : <FiRefreshCw className="w-4 h-4" />}
              Recorrect
            </button>
            <div className="relative">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setExportOpen(v => !v)}
                disabled={!accessToken || exporting !== null}
                title="Export PDF"
              >
                {exporting ? <span className="spinner w-4 h-4" /> : <FiDownload className="w-4 h-4" />}
                Export
              </button>
              {exportOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-sidebar shadow-lg p-2 z-50"
                  onMouseLeave={() => setExportOpen(false)}
                >
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated text-sm text-text-primary"
                    onClick={() => downloadExport('with_answers')}
                    disabled={exporting !== null}
                  >
                    Export PDF (with answers)
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated text-sm text-text-primary"
                    onClick={() => downloadExport('no_answers')}
                    disabled={exporting !== null}
                  >
                    Export PDF (without answers)
                  </button>
                </div>
              )}
            </div>
            <Link href={`/mcq/${params.id}`} className="btn-primary">
              <FiPlay className="w-4 h-4" />
              Practice
            </Link>
          </div>
          {selectedQuestionIds.length > 0 && (
            <button
              onClick={handleStudySelected}
              disabled={startingSelection}
              className="btn-secondary"
            >
              {startingSelection ? <span className="spinner w-4 h-4" /> : <FiPlay className="w-4 h-4" />}
              Study selected ({selectedQuestionIds.length})
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <MCQEditor
            questions={questions}
            mcqSetId={params.id}
            accessToken={accessToken}
            onUpdate={handleQuestionsUpdate}
            enableSelection={true}
            onSelectionChange={setSelectedQuestionIds}
          />
        </div>
      </main>

      {/* Recorrect Modal */}
      {recorrectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !recorrecting && setRecorrectOpen(false)}
          />
          <div className="relative w-full max-w-lg card p-6 mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-text-primary">Recorrect from Answer Key</h3>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-elevated text-text-tertiary hover:text-text-primary"
                onClick={() => !recorrecting && setRecorrectOpen(false)}
                title="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-text-secondary mb-4">
              Upload a PDF/image that contains the correct answers (answer key). We’ll extract the mapping (Q1→A, Q2→C…)
              and update the set so the UI reflects the corrected answers.
            </p>

            <div className="space-y-3">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  setRecorrectFile(f)
                  setRecorrectError(null)
                }}
                disabled={recorrecting}
              />

              {recorrectError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                  {recorrectError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRecorrectOpen(false)}
                  disabled={recorrecting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleRecorrect}
                  disabled={!recorrectFile || recorrecting}
                >
                  {recorrecting ? <span className="spinner w-4 h-4" /> : <FiRefreshCw className="w-4 h-4" />}
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

