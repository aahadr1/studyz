'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FiUpload, FiX, FiBook, FiFileText, FiArrowLeft, FiArrowRight, FiLoader } from 'react-icons/fi'

export default function NewInteractiveLessonPage() {
  const router = useRouter()
  const lessonInputRef = useRef<HTMLInputElement>(null)
  const mcqInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('')
  const [language, setLanguage] = useState('fr')
  
  const [lessonFiles, setLessonFiles] = useState<File[]>([])
  const [mcqFiles, setMcqFiles] = useState<File[]>([])
  
  const [creating, setCreating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processingMessage, setProcessingMessage] = useState('')

  const handleLessonFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setLessonFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const handleMcqFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setMcqFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeLessonFile = (index: number) => {
    setLessonFiles(prev => prev.filter((_, i) => i !== index))
  }

  const removeMcqFile = (index: number) => {
    setMcqFiles(prev => prev.filter((_, i) => i !== index))
  }

  const uploadFileDirectly = async (lessonId: string, file: File, category: 'lesson' | 'mcq') => {
    const urlResponse = await fetch(`/api/interactive-lessons/${lessonId}/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        category,
        contentType: file.type
      })
    })

    if (!urlResponse.ok) {
      const error = await urlResponse.json()
      throw new Error(error.error || 'Failed to get upload URL')
    }

    const { uploadUrl, filePath, fileType } = await urlResponse.json()

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file
    })

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file to storage')
    }

    const confirmResponse = await fetch(`/api/interactive-lessons/${lessonId}/confirm-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath,
        fileName: file.name,
        category,
        fileType
      })
    })

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json()
      throw new Error(error.error || 'Failed to confirm upload')
    }

    return await confirmResponse.json()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter a lesson name')
      return
    }

    if (lessonFiles.length === 0 && mcqFiles.length === 0) {
      setError('Please upload at least one document')
      return
    }

    setCreating(true)
    setProcessingMessage('Création de la leçon...')

    try {
      // 1. Créer la leçon
      const createResponse = await fetch('/api/interactive-lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, level, language })
      })

      if (!createResponse.ok) {
        const data = await createResponse.json()
        throw new Error(data.error || 'Failed to create lesson')
      }

      const { lesson } = await createResponse.json()
      setProcessingMessage('Upload des fichiers...')

      // 2. Upload des fichiers
      for (const file of lessonFiles) {
        await uploadFileDirectly(lesson.id, file, 'lesson')
      }

      for (const file of mcqFiles) {
        await uploadFileDirectly(lesson.id, file, 'mcq')
      }

      // 3. Convert PDF to images if lesson files exist
      if (lessonFiles.length > 0) {
        setProcessingMessage('Conversion du PDF en images...')
        const convertResponse = await fetch(`/api/interactive-lessons/${lesson.id}/convert-pdf`, {
          method: 'POST',
        })

        if (!convertResponse.ok) {
          const data = await convertResponse.json()
          throw new Error(data.error || 'Failed to convert PDF')
        }
      }

      // 4. Set status to 'ready'
      await fetch(`/api/interactive-lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' })
      })

      // Redirect to reader page
      router.push(`/interactive-lessons/${lesson.id}/reader`)

    } catch (err: any) {
      console.error('Error:', err)
      setError(err.message || 'Something went wrong')
      setCreating(false)
      setProcessing(false)
    }
  }

  const getModeInfo = () => {
    if (lessonFiles.length > 0 && mcqFiles.length > 0) {
      return { mode: 'Document-based + Your MCQs', description: 'PDFs displayed page by page with your uploaded MCQs for checkpoints.' }
    }
    if (lessonFiles.length > 0) {
      return { mode: 'Document-based', description: 'PDFs displayed page by page. AI generates MCQ questions.' }
    }
    if (mcqFiles.length > 0) {
      return { mode: 'MCQ-only', description: 'AI generates lesson content based on your MCQ questions.' }
    }
    return null
  }

  const modeInfo = getModeInfo()
  const isSubmitting = creating || processing

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-2xl mx-auto px-6 h-full flex items-center gap-4">
          <button 
            onClick={() => router.push('/interactive-lessons')}
            className="btn-ghost p-2"
            disabled={isSubmitting}
          >
            <FiArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">Create Interactive Lesson</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider">Basic Information</h2>
            
            <div>
              <label className="input-label">Lesson Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Biology Chapter 3"
                className="input"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="input-label">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Biology"
                  className="input"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="input-label">Level</label>
                <input
                  type="text"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="e.g., University"
                  className="input"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="input-label">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="input"
                  disabled={isSubmitting}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>
          </section>

          {/* Documents */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider">Documents</h2>

            {/* Lesson Documents */}
            <div className="card p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 bg-accent-muted rounded-md flex items-center justify-center">
                  <FiBook className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary">Lesson Documents</h3>
                  <p className="text-sm text-text-tertiary">Upload your course PDFs or documents</p>
                </div>
              </div>

              <input
                ref={lessonInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleLessonFilesChange}
                className="hidden"
                disabled={isSubmitting}
              />

              {lessonFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {lessonFiles.map((file, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between px-3 py-2 bg-elevated rounded-md"
                    >
                      <span className="text-sm text-text-secondary truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeLessonFile(index)}
                        className="btn-ghost p-1 text-text-tertiary hover:text-error"
                        disabled={isSubmitting}
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => lessonInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-border rounded-md text-text-tertiary hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={isSubmitting}
              >
                <FiUpload className="w-4 h-4" />
                Add PDF Documents
              </button>
            </div>

            {/* MCQ Documents */}
            <div className="card p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 bg-elevated rounded-md flex items-center justify-center">
                  <FiFileText className="w-4 h-4 text-text-secondary" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary">MCQ Documents <span className="text-text-tertiary font-normal">(Optional)</span></h3>
                  <p className="text-sm text-text-tertiary">Upload existing test questions</p>
                </div>
              </div>

              <input
                ref={mcqInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                multiple
                onChange={handleMcqFilesChange}
                className="hidden"
                disabled={isSubmitting}
              />

              {mcqFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {mcqFiles.map((file, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between px-3 py-2 bg-elevated rounded-md"
                    >
                      <span className="text-sm text-text-secondary truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeMcqFile(index)}
                        className="btn-ghost p-1 text-text-tertiary hover:text-error"
                        disabled={isSubmitting}
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => mcqInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-border rounded-md text-text-tertiary hover:border-border-light hover:text-text-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={isSubmitting}
              >
                <FiUpload className="w-4 h-4" />
                Add MCQ Documents
              </button>
            </div>

            {/* Mode Info */}
            {modeInfo && (
              <div className="p-4 bg-accent-muted border border-accent/20 rounded-md">
                <p className="font-medium text-text-primary mb-1">{modeInfo.mode}</p>
                <p className="text-sm text-text-secondary">{modeInfo.description}</p>
              </div>
            )}
          </section>

          {/* Processing Status */}
          {processingMessage && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center gap-2">
                <FiLoader className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-800">{processingMessage}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-error-muted border border-error/30 text-error text-sm rounded-md">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-4 border-t border-border">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="w-4 h-4 animate-spin" />
                  {processing ? 'Processing...' : 'Creating...'}
                </>
              ) : (
                <>
                  Create Lesson
                  <FiArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}