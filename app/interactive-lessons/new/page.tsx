'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FiUpload, FiX, FiBook, FiFileText, FiInfo, FiArrowRight } from 'react-icons/fi'

interface UploadedFile {
  file: File
  category: 'lesson' | 'mcq'
}

export default function NewInteractiveLessonPage() {
  const router = useRouter()
  const lessonInputRef = useRef<HTMLInputElement>(null)
  const mcqInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('')
  const [language, setLanguage] = useState('fr')
  
  // Files state
  const [lessonFiles, setLessonFiles] = useState<File[]>([])
  const [mcqFiles, setMcqFiles] = useState<File[]>([])
  
  // UI state
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter a lesson name')
      return
    }

    if (lessonFiles.length === 0 && mcqFiles.length === 0) {
      setError('Please upload at least one document (lesson or MCQ)')
      return
    }

    setCreating(true)

    try {
      // Step 1: Create the interactive lesson
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

      // Step 2: Upload lesson documents
      for (const file of lessonFiles) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category', 'lesson')

        const uploadResponse = await fetch(`/api/interactive-lessons/${lesson.id}/documents`, {
          method: 'POST',
          body: formData
        })

        if (!uploadResponse.ok) {
          console.error('Failed to upload lesson file:', file.name)
        }
      }

      // Step 3: Upload MCQ documents
      for (const file of mcqFiles) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category', 'mcq')

        const uploadResponse = await fetch(`/api/interactive-lessons/${lesson.id}/documents`, {
          method: 'POST',
          body: formData
        })

        if (!uploadResponse.ok) {
          console.error('Failed to upload MCQ file:', file.name)
        }
      }

      // Redirect to detail page
      router.push(`/interactive-lessons/${lesson.id}`)

    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setCreating(false)
    }
  }

  const getModeDescription = () => {
    if (lessonFiles.length > 0 && mcqFiles.length > 0) {
      return {
        mode: 'Document-based + Your MCQs',
        description: 'Your lesson PDFs will be displayed page by page. Your uploaded MCQs will be used for checkpoints between sections.',
        icon: <FiBook className="w-5 h-5 text-violet-400" />
      }
    }
    if (lessonFiles.length > 0) {
      return {
        mode: 'Document-based',
        description: 'Your lesson PDFs will be displayed page by page. The AI will generate MCQ questions for each section.',
        icon: <FiBook className="w-5 h-5 text-violet-400" />
      }
    }
    if (mcqFiles.length > 0) {
      return {
        mode: 'MCQ-only',
        description: 'The AI will generate lesson content based on your MCQ questions. A textual course will be created.',
        icon: <FiFileText className="w-5 h-5 text-blue-400" />
      }
    }
    return null
  }

  const modeInfo = getModeDescription()

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button 
            onClick={() => router.push('/interactive-lessons')}
            className="text-gray-400 hover:text-white transition"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-white">Create Interactive Lesson</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Basic Information</h2>
            
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                Lesson Name *
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Biology Chapter 3 - Photosynthesis"
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Biology"
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="level" className="block text-sm font-medium text-gray-300 mb-1">
                  Level
                </label>
                <input
                  type="text"
                  id="level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="e.g., University"
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-300 mb-1">
                  Language
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>
          </section>

          {/* Upload Zones */}
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Documents</h2>

            {/* Lesson Documents Zone */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-violet-900/50 rounded-lg flex items-center justify-center">
                  <FiBook className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Lesson Documents</h3>
                  <p className="text-sm text-gray-400">
                    Upload your course PDFs or documents. They will be displayed page by page.
                  </p>
                </div>
              </div>

              <input
                ref={lessonInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                multiple
                onChange={handleLessonFilesChange}
                className="hidden"
              />

              {lessonFiles.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {lessonFiles.map((file, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between px-3 py-2 bg-neutral-800 rounded-lg"
                    >
                      <span className="text-sm text-gray-300 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeLessonFile(index)}
                        className="p-1 text-gray-400 hover:text-red-400 transition"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => lessonInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-neutral-700 rounded-lg text-gray-400 hover:border-violet-500 hover:text-violet-400 transition flex items-center justify-center gap-2"
              >
                <FiUpload className="w-4 h-4" />
                Add Lesson Documents
              </button>
            </div>

            {/* MCQ Documents Zone */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center">
                  <FiFileText className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">MCQ / Test Documents (Optional)</h3>
                  <p className="text-sm text-gray-400">
                    Upload existing test questions. The AI will extract and use them for checkpoints.
                  </p>
                </div>
              </div>

              <input
                ref={mcqInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                multiple
                onChange={handleMcqFilesChange}
                className="hidden"
              />

              {mcqFiles.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {mcqFiles.map((file, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between px-3 py-2 bg-neutral-800 rounded-lg"
                    >
                      <span className="text-sm text-gray-300 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeMcqFile(index)}
                        className="p-1 text-gray-400 hover:text-red-400 transition"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => mcqInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-neutral-700 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition flex items-center justify-center gap-2"
              >
                <FiUpload className="w-4 h-4" />
                Add MCQ Documents
              </button>
            </div>

            {/* Mode Info */}
            {modeInfo && (
              <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 flex items-start gap-3">
                <div className="mt-0.5">{modeInfo.icon}</div>
                <div>
                  <p className="font-medium text-white">{modeInfo.mode}</p>
                  <p className="text-sm text-gray-400">{modeInfo.description}</p>
                </div>
              </div>
            )}

            {/* Help Text */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <FiInfo className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-400 space-y-2">
                  <p><strong className="text-gray-300">3 modes available:</strong></p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li><strong className="text-violet-400">Lesson docs only</strong> → PDF displayed page by page, AI generates MCQs</li>
                    <li><strong className="text-blue-400">MCQ docs only</strong> → AI generates a textual course from your questions</li>
                    <li><strong className="text-emerald-400">Both</strong> → PDF as base + your MCQs for checkpoints</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  Create Interactive Lesson
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

