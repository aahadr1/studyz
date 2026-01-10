'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiUpload, FiFile, FiX, FiLoader, FiCheck, FiEdit2, FiBook, FiCheckCircle, FiZap, FiFileText } from 'react-icons/fi'
import Link from 'next/link'
import MCQViewer, { MCQQuestion, Lesson } from '@/components/MCQViewer'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

type InputMode = 'pdf' | 'text'

export default function NewMCQPage() {
  const [user, setUser] = useState<any>(null)
  const [inputMode, setInputMode] = useState<InputMode>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [isFileDragging, setIsFileDragging] = useState(false)
  const [textContent, setTextContent] = useState('')
  const [name, setName] = useState('')
  const [extractionInstructions, setExtractionInstructions] = useState('')
  const [expectedTotalQuestions, setExpectedTotalQuestions] = useState<number | ''>('')
  const [expectedOptionsPerQuestion, setExpectedOptionsPerQuestion] = useState<number | ''>('')
  const [expectedCorrectOptionsPerQuestion, setExpectedCorrectOptionsPerQuestion] = useState<number | ''>('')
  const [generateLesson, setGenerateLesson] = useState(false)
  const [generateLessonCards, setGenerateLessonCards] = useState(true)
  const [autoCorrect, setAutoCorrect] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [failedPages, setFailedPages] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    set: { id: string; name: string; total_pages: number; total_questions: number }
    questions: MCQQuestion[]
    lesson?: Lesson | null
    message: string
  } | null>(null)

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

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !authUser) {
        window.location.href = '/login'
        return
      }

      setUser(authUser)
    }

    checkAuth()
  }, [])

  const handleSelectedFile = (selectedFile?: File | null) => {
    if (!selectedFile) return
    if (!selectedFile.type.includes('pdf') && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file')
      return
    }
    setFile(selectedFile)
    setError(null)
    if (!name) {
      setName(selectedFile.name.replace(/\.pdf$/i, ''))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedFile(e.target.files?.[0])
  }

  const handleModeSwitch = (mode: InputMode) => {
    setInputMode(mode)
    setError(null)
    // Clear the other input when switching
    if (mode === 'pdf') {
      setTextContent('')
    } else {
      setFile(null)
    }
  }

  // Split text into chunks that preserve question boundaries when possible.
  // Smaller chunks reduce LLM truncation (important for large sets like 250 questions with 10 options each).
  const splitTextIntoChunks = (text: string, maxChars: number = 6000): string[] => {
    const normalized = text.trim()
    if (!normalized) return []

    // Try to split by question starts (best effort)
    const starts: number[] = []
    const re = /(^|\n)\s*(?:Q?\d{1,4}\s*[).:-]|Question\s+\d{1,4}\b)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(normalized)) !== null) {
      starts.push(m.index + (m[1] ? m[1].length : 0))
      // safety
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
        if ((current.length + 2 + block.length) <= maxChars) {
          current += '\n\n' + block
        } else {
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
    setError(null)
    setFailedPages([])

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setError('Not authenticated')
        setIsProcessing(false)
        return
      }

      let mcqSetId: string
      let allQuestions: MCQQuestion[] = []
      let finalSetName = name

      if (inputMode === 'pdf') {
        // PDF processing flow
        setProcessingStep('Converting PDF to images...')
        
        const pageImages = await convertPdfToImagesClient(file!, 1.5)
        console.log(`Converted ${pageImages.length} pages`)

        if (pageImages.length === 0) {
          throw new Error('No pages found in PDF')
        }

        if (pageImages.length > 40) {
          throw new Error(`PDF has ${pageImages.length} pages, which exceeds the maximum limit of 40 pages`)
        }

        setTotalPages(pageImages.length)

        // Create MCQ set
        setProcessingStep('Creating MCQ set...')
        const createResponse = await fetch('/api/mcq', {
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

        const createData = await createResponse.json()
        if (!createResponse.ok) {
          throw new Error(createData.error || 'Failed to create MCQ set')
        }

        mcqSetId = createData.set.id
        finalSetName = createData.set.name

        // Process pages concurrently (faster than sequential)
        const concurrency = 4
        let completed = 0
        setProcessingStep(`Extracting MCQs (${concurrency} concurrent workers)...`)

        await runWithConcurrency(pageImages, concurrency, async (pageImage, i) => {
          try {
            const pageResponse = await fetch(`/api/mcq/${mcqSetId}/page`, {
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

            const pageData = await pageResponse.json()

            if (!pageResponse.ok) {
              console.error(`Error processing page ${i + 1}:`, pageData.error, pageData.details)
              setFailedPages(prev => [...prev, pageImage.pageNumber])
              return
            }

            if (pageData.questions && pageData.questions.length > 0) {
              allQuestions.push(...pageData.questions)
            }
          } catch (pageError) {
            console.error(`Error processing page ${i + 1}:`, pageError)
            setFailedPages(prev => [...prev, pageImage.pageNumber])
          } finally {
            completed += 1
            setCurrentPage(completed)
            setProcessingStep(`Extracting MCQs... (${completed}/${pageImages.length})`)
          }
        })
      } else {
        // Text processing flow
        setProcessingStep('Preparing text for processing...')
        
        const textChunks = splitTextIntoChunks(textContent)
        console.log(`Split text into ${textChunks.length} chunks`)
        
        setTotalPages(textChunks.length)

        // Create MCQ set
        setProcessingStep('Creating MCQ set...')
        const createResponse = await fetch('/api/mcq', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name || 'Pasted MCQ Set',
            sourcePdfName: null,
            totalPages: textChunks.length,
            extractionInstructions,
            expectedTotalQuestions: expectedTotalQuestions === '' ? null : expectedTotalQuestions,
            expectedOptionsPerQuestion: expectedOptionsPerQuestion === '' ? null : expectedOptionsPerQuestion,
            expectedCorrectOptionsPerQuestion: expectedCorrectOptionsPerQuestion === '' ? null : expectedCorrectOptionsPerQuestion,
          }),
        })

        const createData = await createResponse.json()
        if (!createResponse.ok) {
          throw new Error(createData.error || 'Failed to create MCQ set')
        }

        mcqSetId = createData.set.id
        finalSetName = createData.set.name

        // Process each text chunk
        for (let i = 0; i < textChunks.length; i++) {
          const chunk = textChunks[i]
          setCurrentPage(i + 1)
          setProcessingStep(`Extracting MCQs from chunk ${i + 1} of ${textChunks.length}...`)

          try {
            const textResponse = await fetch(`/api/mcq/${mcqSetId}/text`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text: chunk,
                chunkIndex: i,
              }),
            })

            const textData = await textResponse.json()

            if (!textResponse.ok) {
              console.error(`Error processing chunk ${i + 1}:`, textData.error)
              continue
            }

            if (textData.questions && textData.questions.length > 0) {
              allQuestions.push(...textData.questions)
            }

            console.log(`Chunk ${i + 1}: extracted ${textData.extractedQuestionCount} questions`)
          } catch (chunkError) {
            console.error(`Error processing chunk ${i + 1}:`, chunkError)
          }
        }
      }

      // Common post-processing steps
      
      // Deduplicate questions (remove duplicates from mixed documents)
      if (allQuestions.length > 1) {
        setProcessingStep('Removing duplicate questions...')
        try {
          const dedupResponse = await fetch(`/api/mcq/${mcqSetId}/deduplicate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })
          const dedupData = await dedupResponse.json()
          if (dedupData.duplicatesRemoved > 0) {
            console.log(`Removed ${dedupData.duplicatesRemoved} duplicate questions`)
          }
        } catch (dedupError) {
          console.log('Deduplication step skipped:', dedupError)
        }
      }

      // Auto-correct if enabled
      if (autoCorrect && allQuestions.length > 0) {
        setProcessingStep('AI is verifying and correcting questions...')
        setCurrentPage(0)
        
        try {
          const correctResponse = await fetch(`/api/mcq/${mcqSetId}/auto-correct`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })

          const correctData = await correctResponse.json()

          if (correctResponse.ok) {
            console.log(`Auto-correction: ${correctData.summary?.questionsModified || 0} questions modified`)
          } else {
            console.error('Auto-correction failed:', correctData.error)
          }
        } catch (correctError) {
          console.error('Error during auto-correction:', correctError)
        }
      }

      // Generate lesson cards if enabled
      if (generateLessonCards && allQuestions.length > 0) {
        setProcessingStep('Generating individual lesson cards...')
        setCurrentPage(0)
        
        try {
          const cardsResponse = await fetch(`/api/mcq/${mcqSetId}/generate-lesson-cards`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })

          const cardsData = await cardsResponse.json()

          if (cardsResponse.ok) {
            console.log(`Generated ${cardsData.cardsGenerated} lesson cards`)
          } else {
            console.error('Lesson card generation failed:', cardsData.error)
          }
        } catch (cardsError) {
          console.error('Error generating lesson cards:', cardsError)
        }
      }

      // Generate section-based lesson if enabled
      let lesson: Lesson | null = null
      if (generateLesson && allQuestions.length > 0) {
        setProcessingStep('Generating lesson content with AI...')
        setCurrentPage(0)
        
        try {
          const lessonResponse = await fetch(`/api/mcq/${mcqSetId}/generate-lesson`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })

          const lessonData = await lessonResponse.json()

          if (lessonResponse.ok && lessonData.lesson) {
            lesson = lessonData.lesson
            console.log(`Generated lesson with ${lessonData.lesson.sections.length} sections`)
          } else {
            console.error('Failed to generate lesson:', lessonData.error)
          }
        } catch (lessonError) {
          console.error('Error generating lesson:', lessonError)
        }
      }

      // Final step: Refetch all questions with updated data
      setProcessingStep('Finalizing...')
      const questionsResponse = await fetch(`/api/mcq/${mcqSetId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
      
      if (questionsResponse.ok) {
        const questionsData = await questionsResponse.json()
        allQuestions = questionsData.questions || []
        if (questionsData.set.lesson_content) {
          lesson = questionsData.set.lesson_content
        }
      }

      setResult({
        set: {
          id: mcqSetId,
          name: finalSetName,
          total_pages: totalPages,
          total_questions: allQuestions.length,
        },
        questions: allQuestions,
        lesson,
        message: `Successfully extracted ${allQuestions.length} questions`
      })
    } catch (err: any) {
      console.error('Processing error:', err)
      setError(err.message || 'Failed to process input')
    } finally {
      setIsProcessing(false)
      setProcessingStep('')
      setCurrentPage(0)
    }
  }

  const handleReset = () => {
    setFile(null)
    setTextContent('')
    setName('')
    setGenerateLesson(false)
    setGenerateLessonCards(true)
    setAutoCorrect(true)
    setError(null)
    setResult(null)
    setCurrentPage(0)
    setTotalPages(0)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  // Show results with MCQ viewer
  if (result) {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-14 border-b border-border flex items-center px-8 bg-sidebar">
          <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{result.set.name}</h1>
              <p className="text-sm text-text-secondary">
                {result.set.total_questions} question{result.set.total_questions !== 1 ? 's' : ''} extracted
                {result.lesson && ' · Lesson generated'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link href={`/mcq/${result.set.id}/edit`} className="btn-secondary">
                <FiEdit2 className="w-4 h-4" />
                Edit Questions
              </Link>
              <button onClick={handleReset} className="btn-secondary">
                Create Another
              </button>
              <Link href="/mcq" className="btn-secondary">
                All MCQ Sets
              </Link>
            </div>
          </div>
        </header>

        <main className="p-8">
          <div className="max-w-7xl mx-auto">
            {result.questions.length > 0 ? (
              <MCQViewer questions={result.questions} lesson={result.lesson} />
            ) : (
              <div className="card p-8 text-center">
                <p className="text-text-secondary mb-4">
                  No MCQ questions were found in the input.
                </p>
                {failedPages.length > 0 && (
                  <p className="text-xs text-text-tertiary mb-4">
                    Note: {failedPages.length} page(s) failed to process (likely rate-limit/timeouts): {failedPages.slice(0, 12).join(',')}
                    {failedPages.length > 12 ? '…' : ''}
                  </p>
                )}
                <button onClick={handleReset} className="btn-primary">
                  Try Again
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  // Show upload form
  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center px-8 bg-sidebar">
        <div className="flex items-center justify-between w-full max-w-4xl mx-auto">
          <h1 className="text-lg font-semibold text-text-primary">New MCQ Set</h1>
          <Link href="/mcq" className="btn-secondary">
            Back to MCQ Sets
          </Link>
        </div>
      </header>

      <main className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="card p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-text-primary mb-2">
                Create MCQ Set
              </h2>
              <p className="text-text-secondary">
                Upload a PDF or paste text containing multiple choice questions. Our AI will extract, verify, and format them into an interactive quiz.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name input */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-text-primary mb-2">
                  Set Name (Optional)
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Biology Chapter 5 Quiz"
                  className="w-full px-4 py-2 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
                  disabled={isProcessing}
                />
              </div>

              {/* Input Mode Toggle */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Input Method
                </label>
                <div className="flex rounded-lg overflow-hidden border border-border">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('pdf')}
                    disabled={isProcessing}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                      inputMode === 'pdf'
                        ? 'bg-accent text-white'
                        : 'bg-elevated text-text-secondary hover:bg-border'
                    }`}
                  >
                    <FiUpload className="w-4 h-4" />
                    Upload PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('text')}
                    disabled={isProcessing}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                      inputMode === 'text'
                        ? 'bg-accent text-white'
                        : 'bg-elevated text-text-secondary hover:bg-border'
                    }`}
                  >
                    <FiFileText className="w-4 h-4" />
                    Paste Text
                  </button>
                </div>
              </div>

              {/* PDF Upload */}
              {inputMode === 'pdf' && (
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    PDF File
                  </label>
                  
                  {!file ? (
                    <label className="block w-full cursor-pointer">
                      <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                          isFileDragging ? 'border-accent bg-accent-muted' : 'border-border hover:border-accent hover:bg-accent-muted'
                        }`}
                        onDragEnter={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!isProcessing) setIsFileDragging(true)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!isProcessing) setIsFileDragging(true)
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsFileDragging(false)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsFileDragging(false)
                          if (isProcessing) return
                          const dropped = e.dataTransfer.files?.[0]
                          handleSelectedFile(dropped)
                        }}
                      >
                        <FiUpload className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
                        <p className="text-text-primary font-medium mb-1">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-sm text-text-secondary">
                          PDF file (max 50MB, up to 40 pages)
                        </p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={isProcessing}
                      />
                    </label>
                  ) : (
                    <div className="border-2 border-accent rounded-lg p-4 bg-accent-muted">
                      <div className="flex items-center gap-3">
                        <FiFile className="w-10 h-10 text-accent flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-text-primary truncate">
                            {file.name}
                          </p>
                          <p className="text-sm text-text-secondary">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        {!isProcessing && (
                          <button
                            type="button"
                            onClick={() => setFile(null)}
                            className="p-2 hover:bg-background rounded-lg transition-colors"
                          >
                            <FiX className="w-5 h-5 text-text-tertiary" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Text Input */}
              {inputMode === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    MCQ Text
                  </label>
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder={`Paste your MCQ questions here. Example format:

1. What is the capital of France?
A) London
B) Paris
C) Berlin
D) Madrid
Answer: B

2. Which planet is closest to the Sun?
A) Venus
B) Earth
C) Mercury
D) Mars
Correct: C

You can paste as much text as you want - there's no character limit!`}
                    className="w-full px-4 py-3 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-y min-h-[300px] font-mono text-sm"
                    disabled={isProcessing}
                  />
                  <p className="mt-2 text-xs text-text-tertiary">
                    {textContent.length > 0 && (
                      <>
                        {textContent.length.toLocaleString()} characters
                        {textContent.length > 6000 && (
                          <span className="ml-2">
                            (will be processed in {Math.ceil(textContent.length / 6000)} chunks)
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Extraction constraints */}
              <div className="p-4 bg-elevated rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Extraction constraints (optional)
                  </label>
                  <span className="text-xs text-text-tertiary">
                    Helps avoid missing options/questions on large exams
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Total questions</label>
                    <input
                      type="number"
                      min={1}
                      value={expectedTotalQuestions}
                      onChange={(e) => setExpectedTotalQuestions(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                      placeholder="250"
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Options / question</label>
                    <input
                      type="number"
                      min={2}
                      max={10}
                      value={expectedOptionsPerQuestion}
                      onChange={(e) => setExpectedOptionsPerQuestion(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                      placeholder="10"
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Correct options (MCQ)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={expectedCorrectOptionsPerQuestion}
                      onChange={(e) => setExpectedCorrectOptionsPerQuestion(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                      placeholder="5"
                      disabled={isProcessing}
                    />
                  </div>
                </div>

                <textarea
                  value={extractionInstructions}
                  onChange={(e) => setExtractionInstructions(e.target.value)}
                  placeholder='Custom instructions for the extractor (e.g. "This exam has 250 questions. Each has exactly 10 options (A-J). Each question has 5 correct answers. Do not drop any options.")'
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-y min-h-[80px] text-sm"
                  disabled={isProcessing}
                />
              </div>

              {/* AI Enhancement Options */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  AI Enhancements
                </label>

                {/* Auto-Correct Toggle */}
                <div className="p-4 bg-elevated rounded-lg border border-border">
                  <label className="flex items-start gap-4 cursor-pointer">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={autoCorrect}
                        onChange={(e) => setAutoCorrect(e.target.checked)}
                        disabled={isProcessing}
                        className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FiCheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-text-primary">Auto-Correct Questions</span>
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full">Recommended</span>
                      </div>
                      <p className="text-sm text-text-secondary">
                        AI will verify each question, fix errors, and ensure correct answers are accurate.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Generate Lesson Cards Toggle */}
                <div className="p-4 bg-elevated rounded-lg border border-border">
                  <label className="flex items-start gap-4 cursor-pointer">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={generateLessonCards}
                        onChange={(e) => setGenerateLessonCards(e.target.checked)}
                        disabled={isProcessing}
                        className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FiZap className="w-5 h-5 text-yellow-500" />
                        <span className="font-medium text-text-primary">Generate Lesson Cards</span>
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">Recommended</span>
                      </div>
                      <p className="text-sm text-text-secondary">
                        Each question gets a dedicated lesson card with explanations, key points, and memory hooks.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Generate Section Lesson Toggle */}
                <div className="p-4 bg-elevated rounded-lg border border-border">
                  <label className="flex items-start gap-4 cursor-pointer">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={generateLesson}
                        onChange={(e) => setGenerateLesson(e.target.checked)}
                        disabled={isProcessing}
                        className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FiBook className="w-5 h-5 text-blue-500" />
                        <span className="font-medium text-text-primary">Generate Full Lesson</span>
                      </div>
                      <p className="text-sm text-text-secondary">
                        AI will create a comprehensive structured lesson based on all MCQs, organized into topic sections.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Processing status */}
              {isProcessing && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <FiLoader className="w-5 h-5 text-blue-600 animate-spin" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900">
                        {processingStep}
                      </p>
                    </div>
                  </div>
                  {totalPages > 0 && currentPage > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-blue-700 mb-1">
                        <span>{inputMode === 'pdf' ? 'Page' : 'Chunk'} {currentPage} of {totalPages}</span>
                        <span>{Math.round((currentPage / totalPages) * 100)}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(currentPage / totalPages) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={(inputMode === 'pdf' ? !file : textContent.trim().length === 0) || isProcessing}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FiCheck className="w-4 h-4" />
                    Extract MCQs
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
