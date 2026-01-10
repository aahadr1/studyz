'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, BottomSheet } from '@/components/mobile/MobileLayout'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'
import { 
  FiUpload, 
  FiFile, 
  FiFileText,
  FiX, 
  FiCheck,
  FiAlertCircle,
  FiCheckCircle,
  FiZap,
  FiBook,
  FiLoader
} from 'react-icons/fi'

type InputMode = 'pdf' | 'text'

interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

export default function MobileNewMCQPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [inputMode, setInputMode] = useState<InputMode>('pdf')
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [textContent, setTextContent] = useState('')
  const [extractionInstructions, setExtractionInstructions] = useState('')
  const [expectedTotalQuestions, setExpectedTotalQuestions] = useState<number | ''>('')
  const [expectedOptionsPerQuestion, setExpectedOptionsPerQuestion] = useState<number | ''>('')
  const [expectedCorrectOptionsPerQuestion, setExpectedCorrectOptionsPerQuestion] = useState<number | ''>('')
  
  // Options
  const [autoCorrect, setAutoCorrect] = useState(true)
  const [generateLessonCards, setGenerateLessonCards] = useState(true)
  
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [currentProgress, setCurrentProgress] = useState(0)
  const [error, setError] = useState('')

  const runWithConcurrency = async <T,>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<void>
  ) => {
    const queue = items.map((item, index) => ({ item, index }))
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, queue.length) }).map(async () => {
      while (cursor < queue.length) {
        const current = queue[cursor]
        cursor += 1
        await worker(current.item, current.index)
      }
    })
    await Promise.all(runners)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    
    if (!selectedFile.type.includes('pdf')) {
      setError('Please select a PDF file')
      return
    }
    
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB')
      return
    }
    
    setFile(selectedFile)
    setError('')
    
    if (!name) {
      setName(selectedFile.name.replace('.pdf', ''))
    }
  }

  const updateStep = (stepId: string, status: ProcessingStep['status']) => {
    setProcessingSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status } : step
    ))
  }

  // Split text into chunks (prefer question boundaries; smaller chunks reduce LLM truncation)
  const splitTextIntoChunks = (text: string, maxChars: number = 6000): string[] => {
    const normalized = text.trim()
    if (!normalized) return []

    // Try to split by question starts (best effort)
    const starts: number[] = []
    const re = /(^|\n)\s*(?:Q?\d{1,4}\s*[).:-]|Question\s+\d{1,4}\b)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(normalized)) !== null) {
      starts.push(m.index + (m[1] ? m[1].length : 0))
      if (starts.length > 2000) break
    }

    if (starts.length >= 5) {
      const blocks: string[] = []
      for (let i = 0; i < starts.length; i++) {
        const start = starts[i]
        const end = i + 1 < starts.length ? starts[i + 1] : normalized.length
        const block = normalized.slice(start, end).trim()
        if (block) blocks.push(block)
      }

      const chunks: string[] = []
      let current = ''
      for (const block of blocks) {
        if (!current) {
          current = block
          continue
        }
        if ((current.length + 2 + block.length) <= maxChars) current += '\n\n' + block
        else {
          chunks.push(current.trim())
          current = block
        }
      }
      if (current.trim()) chunks.push(current.trim())
      return chunks
    }

    // Fallback: sentence/newline splitting
    const chunks: string[] = []
    let remaining = normalized

    while (remaining.length > 0) {
      if (remaining.length <= maxChars) {
        chunks.push(remaining)
        break
      }

      let splitIndex = maxChars
      const searchStart = Math.max(0, maxChars - 1500)
      const searchSection = remaining.substring(searchStart, maxChars + 300)

      const sentenceEndRegex = /[.?!]\s+/g
      let lastMatch: RegExpExecArray | null = null
      let match: RegExpExecArray | null
      while ((match = sentenceEndRegex.exec(searchSection)) !== null) {
        if (searchStart + match.index + match[0].length <= maxChars) {
          lastMatch = match
        }
      }

      if (lastMatch) {
        splitIndex = searchStart + lastMatch.index + lastMatch[0].length
      } else {
        const newlineIndex = remaining.lastIndexOf('\n', maxChars)
        if (newlineIndex > maxChars * 0.5) splitIndex = newlineIndex + 1
      }

      chunks.push(remaining.substring(0, splitIndex).trim())
      remaining = remaining.substring(splitIndex).trim()
    }

    return chunks
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const hasInput = inputMode === 'pdf' ? !!file : textContent.trim().length > 0
    
    if (!hasInput) {
      setError(inputMode === 'pdf' ? 'Please select a PDF file' : 'Please enter some text')
      return
    }

    setIsProcessing(true)
    setError('')
    
    // Initialize steps
    const steps: ProcessingStep[] = [
      { id: 'convert', label: inputMode === 'pdf' ? 'Converting PDF' : 'Processing text', status: 'pending' },
      { id: 'extract', label: 'Extracting questions', status: 'pending' },
    ]
    if (autoCorrect) steps.push({ id: 'correct', label: 'AI verification', status: 'pending' })
    if (generateLessonCards) steps.push({ id: 'lessons', label: 'Generating lessons', status: 'pending' })
    steps.push({ id: 'finalize', label: 'Finalizing', status: 'pending' })
    setProcessingSteps(steps)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/m/login')
        return
      }

      let mcqSetId: string
      let totalItems = 0
      let processedItems = 0

      // Step 1: Convert/Process
      updateStep('convert', 'active')

      if (inputMode === 'pdf') {
        const pageImages = await convertPdfToImagesClient(file!, 1.5)
        
        if (pageImages.length === 0) throw new Error('No pages found in PDF')
        if (pageImages.length > 40) throw new Error(`PDF has ${pageImages.length} pages, max 40 allowed`)

        totalItems = pageImages.length
        updateStep('convert', 'done')

        // Create MCQ set
        const createRes = await fetch('/api/mcq', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name || file!.name.replace('.pdf', ''),
            sourcePdfName: file!.name,
            totalPages: pageImages.length,
            extractionInstructions,
            expectedTotalQuestions: expectedTotalQuestions === '' ? null : expectedTotalQuestions,
            expectedOptionsPerQuestion: expectedOptionsPerQuestion === '' ? null : expectedOptionsPerQuestion,
            expectedCorrectOptionsPerQuestion: expectedCorrectOptionsPerQuestion === '' ? null : expectedCorrectOptionsPerQuestion,
          }),
        })

        const createData = await createRes.json()
        if (!createRes.ok) throw new Error(createData.error || 'Failed to create')
        mcqSetId = createData.set.id

        // Step 2: Extract questions
        updateStep('extract', 'active')

        const concurrency = 2
        await runWithConcurrency(pageImages, concurrency, async (pageImage, i) => {
          try {
            await fetch(`/api/mcq/${mcqSetId}/page`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                pageNumber: pageImage.pageNumber,
                dataUrl: pageImage.dataUrl,
                prevDataUrl: i > 0 ? pageImages[i - 1]?.dataUrl : null,
                nextDataUrl: i + 1 < pageImages.length ? pageImages[i + 1]?.dataUrl : null,
              }),
            })
          } finally {
            processedItems++
            setCurrentProgress(Math.round((processedItems / totalItems) * 100))
          }
        })
      } else {
        // Text mode
        const chunks = splitTextIntoChunks(textContent)
        totalItems = chunks.length
        updateStep('convert', 'done')

        // Create MCQ set
        const createRes = await fetch('/api/mcq', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name || 'Pasted MCQ Set',
            sourcePdfName: null,
            totalPages: chunks.length,
            extractionInstructions,
            expectedTotalQuestions: expectedTotalQuestions === '' ? null : expectedTotalQuestions,
            expectedOptionsPerQuestion: expectedOptionsPerQuestion === '' ? null : expectedOptionsPerQuestion,
            expectedCorrectOptionsPerQuestion: expectedCorrectOptionsPerQuestion === '' ? null : expectedCorrectOptionsPerQuestion,
          }),
        })

        const createData = await createRes.json()
        if (!createRes.ok) throw new Error(createData.error || 'Failed to create')
        mcqSetId = createData.set.id

        // Step 2: Extract questions
        updateStep('extract', 'active')

        for (let i = 0; i < chunks.length; i++) {
          await fetch(`/api/mcq/${mcqSetId}/text`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: chunks[i],
              chunkIndex: i,
            }),
          })

          processedItems++
          setCurrentProgress(Math.round((processedItems / totalItems) * 100))
        }
      }

      updateStep('extract', 'done')

      // Step 2.5: Deduplicate questions (remove duplicates from mixed documents)
      try {
        const dedupRes = await fetch(`/api/mcq/${mcqSetId}/deduplicate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        const dedupData = await dedupRes.json()
        if (dedupData.duplicatesRemoved > 0) {
          console.log(`Removed ${dedupData.duplicatesRemoved} duplicate questions`)
        }
      } catch (dedupError) {
        console.log('Deduplication step skipped:', dedupError)
      }

      // Step 3: Auto-correct
      if (autoCorrect) {
        updateStep('correct', 'active')
        await fetch(`/api/mcq/${mcqSetId}/auto-correct`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        updateStep('correct', 'done')
      }

      // Step 4: Generate lesson cards
      if (generateLessonCards) {
        updateStep('lessons', 'active')
        await fetch(`/api/mcq/${mcqSetId}/generate-lesson-cards`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        updateStep('lessons', 'done')
      }

      // Step 5: Finalize
      updateStep('finalize', 'active')
      await new Promise(resolve => setTimeout(resolve, 500))
      updateStep('finalize', 'done')

      // Navigate to the new MCQ set
      router.push(`/m/mcq/${mcqSetId}`)

    } catch (err: any) {
      console.error('Processing error:', err)
      setError(err.message || 'Failed to process')
      setIsProcessing(false)
    }
  }

  // Processing View
  if (isProcessing) {
    return (
      <div className="mobile-app">
        <MobileHeader title="Creating Quiz" />
        
        <div className="mobile-content-full flex flex-col items-center justify-center px-6" style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-area-top))' }}>
          {/* Animated icon */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center mb-8 animate-pulse">
            <FiZap className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            Processing...
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] text-center mb-8">
            This may take a minute
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-xs mb-8">
            <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-secondary)] rounded-full transition-all duration-500"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
            <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-2">
              {currentProgress}%
            </p>
          </div>

          {/* Steps */}
          <div className="w-full max-w-xs space-y-3">
            {processingSteps.map((step) => (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  step.status === 'active' ? 'bg-[var(--color-accent-soft)]' : 
                  step.status === 'done' ? 'bg-[var(--color-success-soft)]' : 
                  'bg-[var(--color-surface)]'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  step.status === 'active' ? 'bg-[var(--color-accent)]' : 
                  step.status === 'done' ? 'bg-[var(--color-success)]' : 
                  'bg-[var(--color-border)]'
                }`}>
                  {step.status === 'active' ? (
                    <FiLoader className="w-3.5 h-3.5 text-white animate-spin" />
                  ) : step.status === 'done' ? (
                    <FiCheck className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[var(--color-text-tertiary)]" />
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  step.status === 'active' ? 'text-[var(--color-accent)]' : 
                  step.status === 'done' ? 'text-[var(--color-success)]' : 
                  'text-[var(--color-text-tertiary)]'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <MobileLayout hideTabBar={true}>
      <MobileHeader 
        title="New Quiz" 
        backHref="/m/mcq"
      />

      <div className="mobile-content px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Quiz Name */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Quiz Name (Optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Biology Chapter 5"
              className="input-mobile"
            />
          </div>

          {/* Input Mode Toggle */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Input Method</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInputMode('pdf')}
                className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  inputMode === 'pdf' 
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' 
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <FiUpload className={`w-5 h-5 ${inputMode === 'pdf' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'}`} />
                <span className={`font-medium text-sm ${inputMode === 'pdf' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>
                  Upload PDF
                </span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  inputMode === 'text' 
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' 
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <FiFileText className={`w-5 h-5 ${inputMode === 'text' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'}`} />
                <span className={`font-medium text-sm ${inputMode === 'text' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>
                  Paste Text
                </span>
              </button>
            </div>
          </div>

          {/* PDF Upload */}
          {inputMode === 'pdf' && (
            <div className="input-group-mobile">
              {!file ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="upload-area-mobile w-full"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-soft)] flex items-center justify-center mb-3">
                      <FiUpload className="w-7 h-7 text-[var(--color-accent)]" />
                    </div>
                    <p className="text-[var(--color-text-primary)] font-semibold mb-1">
                      Tap to upload
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      PDF file (max 50MB, 40 pages)
                    </p>
                  </div>
                </button>
              ) : (
                <div className="mobile-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-soft)] flex items-center justify-center flex-shrink-0">
                      <FiFile className="w-5 h-5 text-[var(--color-accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--color-text-primary)] truncate text-sm">
                        {file.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="w-9 h-9 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center"
                    >
                      <FiX className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Text Input */}
          {inputMode === 'text' && (
            <div className="input-group-mobile">
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste your MCQ questions here..."
                className="input-mobile min-h-[200px] resize-y font-mono text-sm"
              />
              {textContent.length > 0 && (
                <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                  {textContent.length.toLocaleString()} characters
                </p>
              )}
            </div>
          )}

          {/* Extraction constraints */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Extraction constraints (optional)</label>
            <div className="mobile-card p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Total</label>
                  <input
                    type="number"
                    min={1}
                    value={expectedTotalQuestions}
                    onChange={(e) => setExpectedTotalQuestions(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="input-mobile mt-1"
                    placeholder="250"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Options</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={expectedOptionsPerQuestion}
                    onChange={(e) => setExpectedOptionsPerQuestion(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="input-mobile mt-1"
                    placeholder="10"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Correct</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={expectedCorrectOptionsPerQuestion}
                    onChange={(e) => setExpectedCorrectOptionsPerQuestion(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="input-mobile mt-1"
                    placeholder="5"
                    disabled={isProcessing}
                  />
                </div>
              </div>
              <textarea
                value={extractionInstructions}
                onChange={(e) => setExtractionInstructions(e.target.value)}
                placeholder='Custom instructions (e.g. "250 questions, 10 options A-J, 5 correct per question. Do not drop options.")'
                className="input-mobile min-h-[90px] resize-y text-sm"
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* AI Options */}
          <div className="space-y-3">
            <label className="input-label-mobile">AI Features</label>
            
            <label className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] cursor-pointer">
              <input
                type="checkbox"
                checked={autoCorrect}
                onChange={(e) => setAutoCorrect(e.target.checked)}
                className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-accent)]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                  <span className="font-medium text-sm text-[var(--color-text-primary)]">Auto-Correct</span>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  AI verifies and fixes answers
                </p>
              </div>
            </label>

            <label className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] cursor-pointer">
              <input
                type="checkbox"
                checked={generateLessonCards}
                onChange={(e) => setGenerateLessonCards(e.target.checked)}
                className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-accent)]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FiBook className="w-4 h-4 text-[var(--color-accent)]" />
                  <span className="font-medium text-sm text-[var(--color-text-primary)]">Lesson Cards</span>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Generate explanations for each question
                </p>
              </div>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-error-soft)] border border-[var(--color-error)]/20">
              <FiAlertCircle className="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-error)]">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={(inputMode === 'pdf' ? !file : textContent.trim().length === 0)}
            className="btn-mobile btn-primary-mobile w-full"
          >
            <FiZap className="w-5 h-5" />
            Extract Questions
          </button>
        </form>
      </div>
    </MobileLayout>
  )
}

