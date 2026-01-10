'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowLeft, FiUpload, FiFileText, FiZap, FiCheck, FiAlertCircle, FiFile, FiX } from 'react-icons/fi'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { convertPdfToImagesClient } from '@/lib/client-pdf-to-images'

type TabType = 'upload-doc' | 'paste-text' | 'generate'

export default function GenerateMCQsPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string

  const [activeTab, setActiveTab] = useState<TabType>('generate')
  const [lessonName, setLessonName] = useState('')
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  
  // Upload document state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploadDragging, setIsUploadDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadProcessing, setUploadProcessing] = useState(false)

  // Paste text state
  const [pasteText, setPasteText] = useState('')
  const [pasteProcessing, setPasteProcessing] = useState(false)

  // Generate from lesson state
  const [generateProcessing, setGenerateProcessing] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const [mcqsPerPage, setMcqsPerPage] = useState(5)
  const [comprehensiveMode, setComprehensiveMode] = useState(false)
  const [currentGeneratingPage, setCurrentGeneratingPage] = useState(0)
  const [generatedCount, setGeneratedCount] = useState(0)

  // Result state
  const [result, setResult] = useState<{ success: boolean; message: string; count?: number } | null>(null)

  useEffect(() => {
    loadLesson()
  }, [lessonId])

  const loadLesson = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      const response = await fetch(`/api/interactive-lessons/${lessonId}/data`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setLessonName(data.lesson?.name || '')
        setTotalPages(data.totalPages || 0)
      }
    } catch (error) {
      console.error('Error loading lesson:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadDocument = async () => {
    if (!uploadFile || uploadProcessing) return

    setUploadProcessing(true)
    setUploadProgress('Converting PDF to images...')
    setResult(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Convert PDF to images
      const pageImages = await convertPdfToImagesClient(uploadFile, 1.5)
      setUploadProgress(`Converted ${pageImages.length} pages. Extracting MCQs...`)

      // Send to API for extraction
      const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'images',
          page_images: pageImages.map(p => ({
            page_number: p.pageNumber,
            url: p.dataUrl
          }))
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult({ 
          success: true, 
          message: data.message || `Extracted ${data.extracted} MCQs`,
          count: data.extracted
        })
      } else {
        throw new Error(data.error || 'Failed to extract MCQs')
      }
    } catch (error: any) {
      console.error('Error uploading document:', error)
      setResult({ success: false, message: error.message || 'Failed to process document' })
    } finally {
      setUploadProcessing(false)
      setUploadProgress('')
    }
  }

  const handlePasteText = async () => {
    if (!pasteText.trim() || pasteProcessing) return

    setPasteProcessing(true)
    setResult(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'text',
          content: pasteText,
          start_page: 1
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult({ 
          success: true, 
          message: data.message || `Extracted ${data.extracted} MCQs`,
          count: data.extracted
        })
        setPasteText('')
      } else {
        throw new Error(data.error || 'Failed to extract MCQs')
      }
    } catch (error: any) {
      console.error('Error processing text:', error)
      setResult({ success: false, message: error.message || 'Failed to process text' })
    } finally {
      setPasteProcessing(false)
    }
  }

  const handleGenerateFromLesson = async () => {
    if (generateProcessing || totalPages === 0) return

    setGenerateProcessing(true)
    setGenerateProgress(0)
    setCurrentGeneratingPage(0)
    setGeneratedCount(0)
    setResult(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      let totalGenerated = 0
      let failedPages: number[] = []

      // Process pages one at a time
      for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1
        setCurrentGeneratingPage(pageNum)
        setGenerateProgress(Math.round(((i + 1) / totalPages) * 100))

        try {
          const response = await fetch(`/api/interactive-lessons/${lessonId}/mcqs/generate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              page_number: pageNum,
              mcqs_per_page: mcqsPerPage,
              total_pages: totalPages,
              current_page_index: i,
              mode: comprehensiveMode ? 'comprehensive' : 'standard'
            }),
          })

          const data = await response.json()

          if (data.success) {
            totalGenerated += data.generated || 0
            setGeneratedCount(totalGenerated)
          } else {
            console.warn(`Failed to generate MCQs for page ${pageNum}:`, data.error)
            failedPages.push(pageNum)
          }
        } catch (pageError) {
          console.error(`Error processing page ${pageNum}:`, pageError)
          failedPages.push(pageNum)
        }
      }

      if (totalGenerated > 0) {
        let message = `Generated ${totalGenerated} MCQs from ${totalPages} pages`
        if (failedPages.length > 0) {
          message += ` (${failedPages.length} pages failed)`
        }
        setResult({ 
          success: true, 
          message,
          count: totalGenerated
        })
      } else {
        throw new Error('Failed to generate any MCQs')
      }
    } catch (error: any) {
      console.error('Error generating MCQs:', error)
      setResult({ success: false, message: error.message || 'Failed to generate MCQs' })
    } finally {
      setGenerateProcessing(false)
      setCurrentGeneratingPage(0)
    }
  }

  const handleSelectedUploadFile = (file?: File | null) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setResult({ success: false, message: 'Please select a PDF file' })
      return
    }
    setUploadFile(file)
    setResult(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedUploadFile(e.target.files?.[0])
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-8 gap-4">
        <Link href={`/interactive-lessons/${lessonId}/mcqs`} className="btn-ghost">
          <FiArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text-primary">Generate MCQs</h1>
          <p className="text-xs text-text-tertiary">{lessonName} • {totalPages} pages</p>
        </div>
      </header>

      <div className="p-8 max-w-2xl mx-auto">
        {/* Result message */}
        {result && (
          <div className={`mb-6 p-4 rounded border ${
            result.success 
              ? 'bg-success/10 border-success/20 text-success' 
              : 'bg-error/10 border-error/20 text-error'
          }`}>
            <div className="flex items-center gap-2">
              {result.success ? <FiCheck className="w-4 h-4" /> : <FiAlertCircle className="w-4 h-4" />}
              <span className="text-sm font-medium">{result.message}</span>
            </div>
            {result.success && result.count && result.count > 0 && (
              <div className="mt-2">
                <Link 
                  href={`/interactive-lessons/${lessonId}/mcqs`}
                  className="text-sm underline"
                >
                  View MCQs →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="border border-border mb-6">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('generate')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'generate' 
                  ? 'bg-elevated text-text-primary border-b-2 border-accent' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiZap className="w-4 h-4 inline mr-2" />
              Generate from Lesson
            </button>
            <button
              onClick={() => setActiveTab('upload-doc')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'upload-doc' 
                  ? 'bg-elevated text-text-primary border-b-2 border-accent' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiUpload className="w-4 h-4 inline mr-2" />
              Upload Document
            </button>
            <button
              onClick={() => setActiveTab('paste-text')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'paste-text' 
                  ? 'bg-elevated text-text-primary border-b-2 border-accent' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FiFileText className="w-4 h-4 inline mr-2" />
              Paste Text
            </button>
          </div>

          <div className="p-6">
            {/* Generate from Lesson Tab */}
            {activeTab === 'generate' && (
              <div>
                <p className="text-sm text-text-secondary mb-4">
                  AI will analyze each page of your lesson and create MCQs. 
                  Each question will be answerable only from the content on that specific page.
                </p>

                {/* Comprehensive Mode Toggle */}
                <div className="mb-6 p-4 bg-elevated border border-border rounded-lg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={comprehensiveMode}
                      onChange={(e) => {
                        setComprehensiveMode(e.target.checked)
                        if (e.target.checked) {
                          setMcqsPerPage(30) // Default to max in comprehensive mode
                        } else {
                          setMcqsPerPage(5) // Default in standard mode
                        }
                      }}
                      className="mt-1 w-4 h-4 text-accent rounded border-border"
                      disabled={generateProcessing}
                    />
                    <div>
                      <span className="text-sm font-medium text-text-primary">
                        🔬 Mode exhaustif (jusqu'à 30 MCQs/page)
                      </span>
                      <p className="text-xs text-text-tertiary mt-1">
                        L'IA analysera chaque détail de la page pour créer un maximum de questions. 
                        Parfait pour une révision complète de chaque concept, formule, définition et exemple.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="mb-6">
                  <label className="input-label">
                    {comprehensiveMode ? 'Maximum de MCQs par page' : 'MCQs par page'}
                  </label>
                  <select
                    value={mcqsPerPage}
                    onChange={(e) => setMcqsPerPage(parseInt(e.target.value))}
                    className="input"
                    disabled={generateProcessing}
                  >
                    {comprehensiveMode ? (
                      <>
                        <option value={15}>15 questions</option>
                        <option value={20}>20 questions</option>
                        <option value={25}>25 questions</option>
                        <option value={30}>30 questions (maximum)</option>
                      </>
                    ) : (
                      <>
                        <option value={3}>3 questions</option>
                        <option value={5}>5 questions (recommended)</option>
                        <option value={7}>7 questions</option>
                        <option value={10}>10 questions</option>
                      </>
                    )}
                  </select>
                </div>

                <div className={`border p-4 rounded mb-6 ${comprehensiveMode ? 'bg-accent/5 border-accent/30' : 'bg-surface border-border'}`}>
                  <p className="text-sm text-text-primary font-medium mb-2">
                    {comprehensiveMode ? '🎯 ' : ''}
                    {comprehensiveMode 
                      ? `Génération exhaustive : jusqu'à ${totalPages * mcqsPerPage} MCQs`
                      : `This will generate approximately ${totalPages * mcqsPerPage} MCQs`
                    }
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {totalPages} pages × {comprehensiveMode ? `jusqu'à ${mcqsPerPage}` : mcqsPerPage} questions par page
                  </p>
                  {comprehensiveMode && (
                    <p className="text-xs text-accent mt-2">
                      ✓ Chaque détail sera couvert • ✓ Formules et définitions incluses • ✓ Tous les exemples testés
                    </p>
                  )}
                </div>

                {generateProcessing && (
                  <div className="bg-surface border border-border p-4 rounded mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-primary">
                        Processing page {currentGeneratingPage} of {totalPages}
                      </span>
                      <span className="text-sm text-text-tertiary mono">
                        {generatedCount} MCQs generated
                      </span>
                    </div>
                    <div className="w-full bg-border rounded-full h-2">
                      <div 
                        className="bg-accent h-2 rounded-full transition-all duration-300"
                        style={{ width: `${generateProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-tertiary mt-2">
                      {generateProgress}% complete - Please wait, this may take a few minutes...
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGenerateFromLesson}
                  disabled={generateProcessing || totalPages === 0}
                  className={`w-full disabled:opacity-50 ${comprehensiveMode ? 'btn-primary bg-accent' : 'btn-primary'}`}
                >
                  {generateProcessing ? (
                    <>
                      <div className="spinner w-4 h-4" />
                      {comprehensiveMode ? 'Analyse exhaustive' : 'Generating'}... ({currentGeneratingPage}/{totalPages})
                    </>
                  ) : (
                    <>
                      <FiZap className="w-4 h-4" />
                      {comprehensiveMode ? '🔬 Générer MCQs exhaustifs' : 'Generate MCQs from Lesson'}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Upload Document Tab */}
            {activeTab === 'upload-doc' && (
              <div>
                <p className="text-sm text-text-secondary mb-4">
                  Upload a PDF containing multiple choice questions. AI will extract and parse all MCQs found in the document.
                </p>

                {!uploadFile ? (
                  <label
                    className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                      isUploadDragging ? 'border-accent bg-elevated' : 'border-border bg-surface hover:bg-elevated'
                    }`}
                    onDragEnter={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!uploadProcessing) setIsUploadDragging(true)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!uploadProcessing) setIsUploadDragging(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsUploadDragging(false)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsUploadDragging(false)
                      if (uploadProcessing) return
                      handleSelectedUploadFile(e.dataTransfer.files?.[0])
                    }}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <FiUpload className="w-8 h-8 text-text-tertiary mb-3" />
                      <p className="text-sm text-text-secondary mb-1">
                        <span className="font-medium text-accent">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-text-tertiary">PDF files only</p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={uploadProcessing}
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-elevated rounded-lg mb-4">
                    <div className="w-10 h-10 bg-accent-muted rounded-lg flex items-center justify-center">
                      <FiFile className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {uploadFile.name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    {!uploadProcessing && (
                      <button
                        onClick={() => setUploadFile(null)}
                        className="btn-ghost text-text-tertiary hover:text-error"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {uploadProgress && (
                  <div className="p-3 bg-accent-muted rounded-lg text-sm text-accent mb-4">
                    <div className="flex items-center gap-2">
                      <div className="spinner w-4 h-4" />
                      {uploadProgress}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleUploadDocument}
                  disabled={!uploadFile || uploadProcessing}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {uploadProcessing ? (
                    <>
                      <div className="spinner w-4 h-4" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FiUpload className="w-4 h-4" />
                      Extract MCQs from Document
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Paste Text Tab */}
            {activeTab === 'paste-text' && (
              <div>
                <p className="text-sm text-text-secondary mb-4">
                  Paste MCQs as text. AI will parse and structure the questions automatically.
                </p>

                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Paste your MCQs here, for example:

1. What is the capital of France?
A) London
B) Paris
C) Berlin
D) Madrid
Answer: B

2. Which planet is closest to the sun?
A) Venus
B) Earth
C) Mercury
D) Mars
Answer: C`}
                  className="input min-h-[200px] font-mono text-sm mb-4"
                  disabled={pasteProcessing}
                />

                <button
                  onClick={handlePasteText}
                  disabled={!pasteText.trim() || pasteProcessing}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {pasteProcessing ? (
                    <>
                      <div className="spinner w-4 h-4" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FiFileText className="w-4 h-4" />
                      Extract MCQs from Text
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

