'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiUpload, FiFile, FiX, FiLoader, FiCheck, FiEdit2, FiBook, FiCheckCircle, FiZap } from 'react-icons/fi'
import Link from 'next/link'
import MCQViewer, { MCQQuestion, Lesson } from '@/components/MCQViewer'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

export default function NewMCQPage() {
  const [user, setUser] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [generateLesson, setGenerateLesson] = useState(false)
  const [generateLessonCards, setGenerateLessonCards] = useState(true) // Default on
  const [autoCorrect, setAutoCorrect] = useState(true) // Default on
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    set: { id: string; name: string; total_pages: number; total_questions: number }
    questions: MCQQuestion[]
    lesson?: Lesson | null
    message: string
  } | null>(null)

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.type.includes('pdf')) {
        setError('Please select a PDF file')
        return
      }
      setFile(selectedFile)
      setError(null)
      // Auto-fill name from filename if not set
      if (!name) {
        setName(selectedFile.name.replace('.pdf', ''))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file) {
      setError('Please select a PDF file')
      return
    }

    setIsProcessing(true)
    setError(null)
    setProcessingStep('Converting PDF to images...')

    try {
      // Convert PDF to images on client side
      const pageImages = await convertPdfToImagesClient(file, 1.5)
      console.log(`Converted ${pageImages.length} pages`)

      if (pageImages.length === 0) {
        throw new Error('No pages found in PDF')
      }

      if (pageImages.length > 40) {
        throw new Error(`PDF has ${pageImages.length} pages, which exceeds the maximum limit of 40 pages`)
      }

      setTotalPages(pageImages.length)

      // Get auth session
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setError('Not authenticated')
        setIsProcessing(false)
        return
      }

      // Step 1: Create MCQ set
      setProcessingStep('Creating MCQ set...')
      const createResponse = await fetch('/api/mcq', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name || file.name.replace('.pdf', ''),
          sourcePdfName: file.name,
          totalPages: pageImages.length,
        }),
      })

      const createData = await createResponse.json()

      if (!createResponse.ok) {
        throw new Error(createData.error || 'Failed to create MCQ set')
      }

      const mcqSetId = createData.set.id
      let allQuestions: MCQQuestion[] = []

      // Step 2: Upload and process each page one by one
      for (let i = 0; i < pageImages.length; i++) {
        const pageImage = pageImages[i]
        setCurrentPage(i + 1)
        setProcessingStep(`Extracting MCQs from page ${i + 1} of ${pageImages.length}...`)

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
            }),
          })

          const pageData = await pageResponse.json()

          if (!pageResponse.ok) {
            console.error(`Error processing page ${i + 1}:`, pageData.error)
            continue
          }

          // Collect questions from this page
          if (pageData.questions && pageData.questions.length > 0) {
            allQuestions.push(...pageData.questions)
          }

          console.log(`Page ${i + 1}: extracted ${pageData.extractedQuestionCount} questions`)
        } catch (pageError) {
          console.error(`Error processing page ${i + 1}:`, pageError)
        }
      }

      // Step 3: Auto-correct questions if enabled
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

      // Step 4: Generate lesson cards if enabled
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

      // Step 5: Generate section-based lesson if enabled
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
          name: createData.set.name,
          total_pages: pageImages.length,
          total_questions: allQuestions.length,
        },
        questions: allQuestions,
        lesson,
        message: `Successfully extracted ${allQuestions.length} questions from ${pageImages.length} pages`
      })
    } catch (err: any) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to process PDF')
    } finally {
      setIsProcessing(false)
      setProcessingStep('')
      setCurrentPage(0)
    }
  }

  const handleReset = () => {
    setFile(null)
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
        {/* Header */}
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
                Upload Another
              </button>
              <Link href="/mcq" className="btn-secondary">
                All MCQ Sets
              </Link>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-8">
          <div className="max-w-7xl mx-auto">
            {result.questions.length > 0 ? (
              <MCQViewer questions={result.questions} lesson={result.lesson} />
            ) : (
              <div className="card p-8 text-center">
                <p className="text-text-secondary mb-4">
                  No MCQ questions were found in the uploaded PDF.
                </p>
                <button onClick={handleReset} className="btn-primary">
                  Try Another PDF
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
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 bg-sidebar">
        <div className="flex items-center justify-between w-full max-w-4xl mx-auto">
          <h1 className="text-lg font-semibold text-text-primary">New MCQ Set</h1>
          <Link href="/mcq" className="btn-secondary">
            Back to MCQ Sets
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="card p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-text-primary mb-2">
                Upload MCQ PDF
              </h2>
              <p className="text-text-secondary">
                Upload a PDF containing multiple choice questions. Our AI will extract, verify, and format them into an interactive quiz.
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

              {/* File upload */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  PDF File
                </label>
                
                {!file ? (
                  <label className="block w-full cursor-pointer">
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-accent hover:bg-accent-muted transition-colors">
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
                        AI will verify each question, fix OCR errors, and ensure correct answers are accurate.
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
                        <span>Page {currentPage} of {totalPages}</span>
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
                disabled={!file || isProcessing}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FiUpload className="w-4 h-4" />
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
