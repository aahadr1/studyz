'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiUpload, FiFile, FiX, FiLoader } from 'react-icons/fi'
import Link from 'next/link'
import MCQViewer, { MCQQuestion } from '@/components/MCQViewer'

export default function NewMCQPage() {
  const [user, setUser] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    set: { id: string; name: string; total_pages: number; total_questions: number }
    questions: MCQQuestion[]
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

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setError('Not authenticated')
        setIsProcessing(false)
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      if (name) {
        formData.append('name', name)
      }

      const response = await fetch('/api/mcq', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process PDF')
      }

      setResult(data)
    } catch (err: any) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to process PDF')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setName('')
    setError(null)
    setResult(null)
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
          <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{result.set.name}</h1>
              <p className="text-sm text-text-secondary">
                {result.set.total_questions} question{result.set.total_questions !== 1 ? 's' : ''} extracted
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleReset} className="btn-secondary">
                Upload Another
              </button>
              <Link href="/dashboard" className="btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-8">
          <div className="max-w-6xl mx-auto">
            {result.questions.length > 0 ? (
              <MCQViewer questions={result.questions} />
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
          <Link href="/dashboard" className="btn-secondary">
            Back to Dashboard
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
                Upload a PDF containing multiple choice questions. Our AI will extract and format them into an interactive quiz.
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

              {/* Error message */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Processing status */}
              {isProcessing && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FiLoader className="w-5 h-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        Processing PDF...
                      </p>
                      <p className="text-xs text-blue-700">
                        This may take a few minutes. We're converting pages and extracting MCQs.
                      </p>
                    </div>
                  </div>
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

