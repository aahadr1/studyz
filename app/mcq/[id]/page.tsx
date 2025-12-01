'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLoader } from 'react-icons/fi'
import Link from 'next/link'
import MCQViewer, { MCQQuestion } from '@/components/MCQViewer'

export default function MCQSetPage({ params }: { params: { id: string } }) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestion[]>([])

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
          <Link href="/dashboard" className="btn-primary inline-flex">
            Back to Dashboard
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
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{mcqSet.name}</h1>
            <p className="text-sm text-text-secondary">
              {mcqSet.total_questions} question{mcqSet.total_questions !== 1 ? 's' : ''} · {mcqSet.total_pages} page{mcqSet.total_pages !== 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/dashboard" className="btn-secondary">
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="p-8">
        <div className="max-w-6xl mx-auto">
          {questions.length > 0 ? (
            <MCQViewer questions={questions} />
          ) : (
            <div className="card p-8 text-center">
              <p className="text-text-secondary">No questions found in this set.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

